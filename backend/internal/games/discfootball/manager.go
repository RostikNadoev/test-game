package discfootball

import (
	"errors"
	"math"
	"sort"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	GameCode    = "disc_football"
	TargetGoals = 2

	BoardWidth  = 1.0
	BoardHeight = 1.68

	SimulationHz = 60
	SnapshotHz   = 30

	PlanningDuration = 8 * time.Second
	RevealDuration   = 1 * time.Second
	GoalPause        = 1300 * time.Millisecond
	MaxResolveTime   = 7600 * time.Millisecond
	StableFor        = 480 * time.Millisecond

	PhaseWaiting   = "waiting"
	PhasePlanning  = "planning"
	PhaseReveal    = "reveal"
	PhaseResolving = "resolving"
	PhaseGoal      = "goal"
	PhaseMatchOver = "match_over"

	discRadius = 0.057
	ballRadius = discRadius * 0.5

	// The goal mouth is exactly three disc diameters wide.
	// The net is one disc diameter deep, so discs can genuinely enter it.
	goalWidth  = discRadius * 6.0
	goalDepth  = discRadius * 2.0
	goalLeft   = (BoardWidth - goalWidth) / 2.0
	goalRight  = goalLeft + goalWidth
	postRadius = 0.012

	maxLaunchSpeed = 2.12
	discMass       = 1.25
	ballMass       = 0.56

	discRestitution = 0.82
	ballRestitution = 0.91
	wallRestitution = 0.82

	discDragPerSecond = 0.165
	ballDragPerSecond = 0.235

	maxPhysicsSubsteps = 14
	stopSpeed          = 0.006
	stableSpeed        = 0.035
)

type BodyKind string

const (
	BodyDisc BodyKind = "disc"
	BodyBall BodyKind = "ball"
)

type Body struct {
	ID          string   `json:"id"`
	Kind        BodyKind `json:"kind"`
	OwnerUserID uint     `json:"owner_user_id,omitempty"`
	DiscIndex   int      `json:"disc_index"`
	X           float64  `json:"x"`
	Y           float64  `json:"y"`
	VX          float64  `json:"vx"`
	VY          float64  `json:"vy"`
	Radius      float64  `json:"radius"`
	Rotation    float64  `json:"rotation"`
	Mass        float64  `json:"-"`
}

type PlanInput struct {
	DiscIndex int     `json:"disc_index"`
	DX        float64 `json:"dx"`
	DY        float64 `json:"dy"`
	Power     float64 `json:"power"`
}

type PlanPublic struct {
	DiscIndex int     `json:"disc_index"`
	DX        float64 `json:"dx"`
	DY        float64 `json:"dy"`
	Power     float64 `json:"power"`
}

type ClientMessage struct {
	Type  string      `json:"type"`
	Plans []PlanInput `json:"plans,omitempty"`
}

type PublicState struct {
	Type               string                `json:"type"`
	Game               string                `json:"game"`
	LobbyID            string                `json:"lobby_id"`
	Phase              string                `json:"phase"`
	Ready              bool                  `json:"ready"`
	ServerMS           int64                 `json:"server_ms"`
	Tick               uint64                `json:"tick"`
	Round              int                   `json:"round"`
	TargetGoals        int                   `json:"target_goals"`
	BoardWidth         float64               `json:"board_width"`
	BoardHeight        float64               `json:"board_height"`
	GoalWidth          float64               `json:"goal_width"`
	GoalDepth          float64               `json:"goal_depth"`
	PlayerOrder        []uint                `json:"player_order"`
	Bodies             []Body                `json:"bodies"`
	Score              map[uint]int          `json:"score"`
	Submitted          map[uint]bool         `json:"submitted"`
	Plans              map[uint][]PlanPublic `json:"plans,omitempty"`
	PlanningDeadlineMS int64                 `json:"planning_deadline_ms,omitempty"`
	RevealDeadlineMS   int64                 `json:"reveal_deadline_ms,omitempty"`
	GoalSeq            uint64                `json:"goal_seq"`
	GoalScorerUserID   uint                  `json:"goal_scorer_user_id,omitempty"`
	WinnerUserID       uint                  `json:"winner_user_id,omitempty"`
	Message            string                `json:"message,omitempty"`
}

type planVector struct {
	DX    float64
	DY    float64
	Power float64
}

type Manager struct {
	mu          sync.Mutex
	sessions    map[string]*Session
	onMatchOver func(lobbyID string, winnerUserID uint)
}

func NewManager() *Manager {
	return &Manager{
		sessions: make(map[string]*Session),
	}
}

func (m *Manager) SetOnMatchOver(
	fn func(lobbyID string, winnerUserID uint),
) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.onMatchOver = fn
}

func (m *Manager) Connect(
	lobbyID string,
	playerIDs []uint,
	userID uint,
	conn *websocket.Conn,
) error {
	if lobbyID == "" {
		return errors.New("lobby_id is required")
	}

	if len(playerIDs) != 2 {
		return errors.New("disc football requires exactly 2 players")
	}

	if !containsPlayer(playerIDs, userID) {
		return errors.New("user is not a player of this lobby")
	}

	m.mu.Lock()

	session, exists := m.sessions[lobbyID]

	if !exists {
		onMatchOver := m.onMatchOver

		session = NewSession(
			lobbyID,
			playerIDs,
			onMatchOver,
			func() {
				m.mu.Lock()
				delete(m.sessions, lobbyID)
				m.mu.Unlock()
			},
		)

		m.sessions[lobbyID] = session
	}

	m.mu.Unlock()

	return session.Attach(userID, conn)
}

func (m *Manager) RemoveSession(lobbyID string) {
	m.mu.Lock()

	session := m.sessions[lobbyID]
	delete(m.sessions, lobbyID)

	m.mu.Unlock()

	if session != nil {
		session.Close()
	}
}

func (m *Manager) CleanupLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	for now := range ticker.C {
		m.mu.Lock()

		stale := make([]*Session, 0)

		for id, session := range m.sessions {
			if session.CanCleanup(now) {
				delete(m.sessions, id)
				stale = append(stale, session)
			}
		}

		m.mu.Unlock()

		for _, session := range stale {
			session.Close()
		}
	}
}

type client struct {
	userID    uint
	conn      *websocket.Conn
	send      chan any
	done      chan struct{}
	closeOnce sync.Once
}

func newClient(
	userID uint,
	conn *websocket.Conn,
) *client {
	return &client{
		userID: userID,
		conn:   conn,
		send:   make(chan any, 5),
		done:   make(chan struct{}),
	}
}

func (c *client) Close() {
	c.closeOnce.Do(func() {
		close(c.done)
		_ = c.conn.Close()
	})
}

func (c *client) Enqueue(payload any) {
	select {
	case <-c.done:
		return
	default:
	}

	select {
	case c.send <- payload:
		return
	default:
	}

	select {
	case <-c.send:
	default:
	}

	select {
	case c.send <- payload:
	default:
	}
}

func (c *client) writeLoop() {
	pingTicker := time.NewTicker(25 * time.Second)

	defer pingTicker.Stop()
	defer c.Close()

	for {
		select {
		case payload := <-c.send:
			_ = c.conn.SetWriteDeadline(
				time.Now().Add(4 * time.Second),
			)

			if err := c.conn.WriteJSON(payload); err != nil {
				return
			}

		case <-pingTicker.C:
			deadline := time.Now().Add(4 * time.Second)

			_ = c.conn.SetWriteDeadline(deadline)

			if err := c.conn.WriteControl(
				websocket.PingMessage,
				[]byte("ping"),
				deadline,
			); err != nil {
				return
			}

		case <-c.done:
			return
		}
	}
}

type Session struct {
	mu sync.Mutex

	lobbyID     string
	playerOrder []uint
	clients     map[uint]*client
	bodies      []Body
	score       map[uint]int
	plans       map[uint]map[int]planVector
	submitted   map[uint]bool

	phase            string
	round            int
	tick             uint64
	planningDeadline time.Time
	revealDeadline   time.Time
	resolveStartedAt time.Time
	stableSince      time.Time
	goalResumeAt     time.Time
	goalSeq          uint64
	goalScorerUserID uint
	winnerUserID     uint

	started      bool
	settled      bool
	closed       bool
	lastActivity time.Time

	onMatchOver func(lobbyID string, winnerUserID uint)
	onDone      func()

	stop     chan struct{}
	stopOnce sync.Once
}

func NewSession(
	lobbyID string,
	playerIDs []uint,
	onMatchOver func(lobbyID string, winnerUserID uint),
	onDone func(),
) *Session {
	ids := append([]uint(nil), playerIDs...)

	sort.Slice(
		ids,
		func(i, j int) bool {
			return ids[i] < ids[j]
		},
	)

	session := &Session{
		lobbyID:     lobbyID,
		playerOrder: ids,
		clients:     make(map[uint]*client),

		score: map[uint]int{
			ids[0]: 0,
			ids[1]: 0,
		},

		plans: map[uint]map[int]planVector{
			ids[0]: {},
			ids[1]: {},
		},

		submitted: map[uint]bool{
			ids[0]: false,
			ids[1]: false,
		},

		phase:        PhaseWaiting,
		round:        1,
		lastActivity: time.Now(),
		onMatchOver:  onMatchOver,
		onDone:       onDone,
		stop:         make(chan struct{}),
	}

	session.resetKickoffLocked()

	go session.run()

	return session
}

func (s *Session) Attach(
	userID uint,
	conn *websocket.Conn,
) error {
	cl := newClient(userID, conn)

	s.mu.Lock()

	if s.closed {
		s.mu.Unlock()
		return errors.New("match session is closed")
	}

	if old := s.clients[userID]; old != nil {
		old.Close()
	}

	s.clients[userID] = cl
	s.lastActivity = time.Now()

	if len(s.clients) == len(s.playerOrder) &&
		s.winnerUserID == 0 {
		if !s.started {
			s.started = true
			s.startPlanningLocked(
				time.Now(),
				false,
			)
		} else if s.phase == PhaseWaiting {
			s.startPlanningLocked(
				time.Now(),
				false,
			)
		}
	}

	state := s.publicStateLocked()

	s.mu.Unlock()

	go cl.writeLoop()

	cl.Enqueue(state)

	defer func() {
		s.mu.Lock()

		if s.clients[userID] == cl {
			delete(s.clients, userID)
		}

		if !s.closed && s.winnerUserID == 0 {
			s.phase = PhaseWaiting
			s.zeroVelocitiesLocked()
			s.clearPlansLocked()
			s.planningDeadline = time.Time{}
			s.revealDeadline = time.Time{}

			s.broadcastLocked(
				s.publicStateLocked(),
			)
		}

		s.lastActivity = time.Now()

		s.mu.Unlock()

		cl.Close()
	}()

	conn.SetReadLimit(16 << 10)

	_ = conn.SetReadDeadline(
		time.Now().Add(70 * time.Second),
	)

	conn.SetPongHandler(
		func(string) error {
			_ = conn.SetReadDeadline(
				time.Now().Add(70 * time.Second),
			)

			return nil
		},
	)

	for {
		var msg ClientMessage

		if err := conn.ReadJSON(&msg); err != nil {
			return nil
		}

		s.Handle(userID, msg)
	}
}

func (s *Session) Handle(
	userID uint,
	msg ClientMessage,
) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed ||
		!containsPlayer(s.playerOrder, userID) {
		return
	}

	s.lastActivity = time.Now()

	switch msg.Type {
	case "state":
		if cl := s.clients[userID]; cl != nil {
			cl.Enqueue(
				s.publicStateLocked(),
			)
		}

	case "plan":
		s.applyPlanLocked(
			userID,
			msg.Plans,
		)

	case "ping":
		if cl := s.clients[userID]; cl != nil {
			cl.Enqueue(
				map[string]any{
					"type": "pong",
					"server_ms": time.Now().
						UTC().
						UnixMilli(),
				},
			)
		}

	default:
		s.sendErrorLocked(
			userID,
			"unknown command",
		)
	}
}

func (s *Session) applyPlanLocked(
	userID uint,
	inputs []PlanInput,
) {
	if s.phase != PhasePlanning {
		s.sendErrorLocked(
			userID,
			"planning is closed",
		)

		return
	}

	if len(inputs) > 3 {
		s.sendErrorLocked(
			userID,
			"maximum 3 disc plans",
		)

		return
	}

	next := make(
		map[int]planVector,
		len(inputs),
	)

	for _, input := range inputs {
		if input.DiscIndex < 0 ||
			input.DiscIndex > 2 {
			s.sendErrorLocked(
				userID,
				"invalid disc_index",
			)

			return
		}

		if _, exists := next[input.DiscIndex]; exists {
			s.sendErrorLocked(
				userID,
				"duplicate disc_index",
			)

			return
		}

		if !isFinite(input.DX) ||
			!isFinite(input.DY) ||
			!isFinite(input.Power) {
			s.sendErrorLocked(
				userID,
				"plan contains non-finite values",
			)

			return
		}

		if input.Power < 0 ||
			input.Power > 1.0001 {
			s.sendErrorLocked(
				userID,
				"power must be between 0 and 1",
			)

			return
		}

		length := math.Hypot(
			input.DX,
			input.DY,
		)

		power := clamp(
			input.Power,
			0,
			1,
		)

		if length < 0.000001 ||
			power < 0.02 {
			continue
		}

		next[input.DiscIndex] = planVector{
			DX:    input.DX / length,
			DY:    input.DY / length,
			Power: power,
		}
	}

	s.plans[userID] = next
	s.submitted[userID] = true

	s.broadcastLocked(
		s.publicStateLocked(),
	)
}

func (s *Session) run() {
	ticker := time.NewTicker(
		time.Second / SimulationHz,
	)

	defer ticker.Stop()

	snapshotEvery := SimulationHz / SnapshotHz

	if snapshotEvery < 1 {
		snapshotEvery = 1
	}

	last := time.Now()

	for {
		select {
		case now := <-ticker.C:
			dt := now.Sub(last).Seconds()
			last = now

			if dt <= 0 || dt > 0.05 {
				dt = 1.0 / SimulationHz
			}

			s.mu.Lock()

			if s.closed {
				s.mu.Unlock()
				return
			}

			s.stepLocked(dt, now)

			s.tick++

			if s.tick%uint64(snapshotEvery) == 0 {
				s.broadcastLocked(
					s.publicStateLocked(),
				)
			}

			s.mu.Unlock()

		case <-s.stop:
			return
		}
	}
}

func (s *Session) stepLocked(
	dt float64,
	now time.Time,
) {
	if len(s.clients) != len(s.playerOrder) &&
		s.phase != PhaseMatchOver {
		if s.phase != PhaseWaiting {
			s.phase = PhaseWaiting
			s.zeroVelocitiesLocked()
			s.clearPlansLocked()
		}

		return
	}

	switch s.phase {
	case PhasePlanning:
		if !s.planningDeadline.IsZero() &&
			!now.Before(s.planningDeadline) {
			s.startRevealLocked(now)
		}

	case PhaseReveal:
		if !s.revealDeadline.IsZero() &&
			!now.Before(s.revealDeadline) {
			s.startResolvingLocked(now)
		}

	case PhaseResolving:
		s.simulateLocked(dt, now)

		if s.phase != PhaseResolving {
			return
		}

		maxSpeed := 0.0

		for i := range s.bodies {
			speed := math.Hypot(
				s.bodies[i].VX,
				s.bodies[i].VY,
			)

			maxSpeed = math.Max(
				maxSpeed,
				speed,
			)
		}

		if maxSpeed < stableSpeed {
			if s.stableSince.IsZero() {
				s.stableSince = now
			}
		} else {
			s.stableSince = time.Time{}
		}

		stableLongEnough :=
			!s.stableSince.IsZero() &&
				now.Sub(s.stableSince) >= StableFor

		expired :=
			!s.resolveStartedAt.IsZero() &&
				now.Sub(s.resolveStartedAt) >= MaxResolveTime

		if stableLongEnough || expired {
			s.startPlanningLocked(
				now,
				true,
			)
		}

	case PhaseGoal:
		if !s.goalResumeAt.IsZero() &&
			!now.Before(s.goalResumeAt) {
			if s.winnerUserID != 0 {
				s.finishMatchLocked()
				return
			}

			s.resetKickoffLocked()

			s.startPlanningLocked(
				now,
				true,
			)
		}
	}
}

func (s *Session) startPlanningLocked(
	now time.Time,
	incrementRound bool,
) {
	if incrementRound {
		s.round++
	}

	s.phase = PhasePlanning

	s.zeroVelocitiesLocked()
	s.clearPlansLocked()

	s.planningDeadline = now.Add(
		PlanningDuration,
	)

	s.revealDeadline = time.Time{}
	s.resolveStartedAt = time.Time{}
	s.stableSince = time.Time{}
	s.goalResumeAt = time.Time{}
	s.goalScorerUserID = 0

	s.broadcastLocked(
		s.publicStateLocked(),
	)
}

func (s *Session) startRevealLocked(
	now time.Time,
) {
	s.phase = PhaseReveal

	s.zeroVelocitiesLocked()

	s.revealDeadline = now.Add(
		RevealDuration,
	)

	s.planningDeadline = time.Time{}

	s.broadcastLocked(
		s.publicStateLocked(),
	)
}

func (s *Session) startResolvingLocked(
	now time.Time,
) {
	s.phase = PhaseResolving
	s.revealDeadline = time.Time{}
	s.resolveStartedAt = now
	s.stableSince = time.Time{}

	for i := range s.bodies {
		body := &s.bodies[i]

		if body.Kind != BodyDisc {
			continue
		}

		plan, exists :=
			s.plans[body.OwnerUserID][body.DiscIndex]

		if !exists {
			body.VX = 0
			body.VY = 0
			continue
		}

		speed := maxLaunchSpeed * plan.Power

		body.VX = plan.DX * speed
		body.VY = plan.DY * speed
	}

	s.broadcastLocked(
		s.publicStateLocked(),
	)
}

func (s *Session) simulateLocked(
	dt float64,
	now time.Time,
) {
	dt = clamp(
		dt,
		1.0/240.0,
		1.0/30.0,
	)

	maxSpeed := 0.0

	for i := range s.bodies {
		speed := math.Hypot(
			s.bodies[i].VX,
			s.bodies[i].VY,
		)

		maxSpeed = math.Max(
			maxSpeed,
			speed,
		)
	}

	maxTravel := ballRadius * 0.34

	substeps := int(
		math.Ceil(
			maxSpeed * dt / maxTravel,
		),
	)

	if substeps < 1 {
		substeps = 1
	}

	if substeps > maxPhysicsSubsteps {
		substeps = maxPhysicsSubsteps
	}

	subDT := dt / float64(substeps)

	for step := 0; step < substeps; step++ {
		for i := range s.bodies {
			body := &s.bodies[i]

			body.X += body.VX * subDT
			body.Y += body.VY * subDT

			body.Rotation +=
				(body.VX/body.Radius*0.30 +
					body.VY/body.Radius*0.11) *
					subDT

			if s.resolveArenaLocked(body, now) {
				return
			}
		}

		for first := 0; first < len(s.bodies); first++ {
			for second := first + 1; second < len(s.bodies); second++ {
				resolveBodyCollision(
					&s.bodies[first],
					&s.bodies[second],
				)
			}
		}

		for i := range s.bodies {
			body := &s.bodies[i]

			drag := discDragPerSecond

			if body.Kind == BodyBall {
				drag = ballDragPerSecond
			}

			damping := math.Pow(
				drag,
				subDT,
			)

			body.VX *= damping
			body.VY *= damping

			if math.Abs(body.VX) < stopSpeed {
				body.VX = 0
			}

			if math.Abs(body.VY) < stopSpeed {
				body.VY = 0
			}
		}
	}
}

func (s *Session) resolveArenaLocked(
	body *Body,
	now time.Time,
) bool {
	if body.X-body.Radius < 0 {
		body.X = body.Radius
		body.VX =
			math.Abs(body.VX) *
				wallRestitution
	} else if body.X+body.Radius > BoardWidth {
		body.X = BoardWidth - body.Radius
		body.VX =
			-math.Abs(body.VX) *
				wallRestitution
	}

	insideGoalMouth :=
		body.X > goalLeft+body.Radius*0.08 &&
			body.X < goalRight-body.Radius*0.08

	// A goal is still counted only when the whole ball crosses the line.
	// Discs use the same opening, but never trigger a score.
	if body.Kind == BodyBall &&
		insideGoalMouth &&
		body.Y+body.Radius < -0.002 {
		s.goalLocked(
			s.playerOrder[0],
			now,
		)

		return true
	}

	if body.Kind == BodyBall &&
		insideGoalMouth &&
		body.Y-body.Radius > BoardHeight+0.002 {
		s.goalLocked(
			s.playerOrder[1],
			now,
		)

		return true
	}

	switch {
	case body.Y < 0:
		// The body is behind the top goal line. Keep it inside the net's
		// side walls and let the back wall stop it one disc diameter deep.
		if body.X-body.Radius < goalLeft {
			body.X = goalLeft + body.Radius
			body.VX =
				math.Abs(body.VX) *
					wallRestitution
		} else if body.X+body.Radius > goalRight {
			body.X = goalRight - body.Radius
			body.VX =
				-math.Abs(body.VX) *
					wallRestitution
		}

		if body.Y-body.Radius < -goalDepth {
			body.Y = -goalDepth + body.Radius
			body.VY =
				math.Abs(body.VY) *
					wallRestitution
		}

	case body.Y > BoardHeight:
		// Same physical net for the bottom goal.
		if body.X-body.Radius < goalLeft {
			body.X = goalLeft + body.Radius
			body.VX =
				math.Abs(body.VX) *
					wallRestitution
		} else if body.X+body.Radius > goalRight {
			body.X = goalRight - body.Radius
			body.VX =
				-math.Abs(body.VX) *
					wallRestitution
		}

		if body.Y+body.Radius > BoardHeight+goalDepth {
			body.Y = BoardHeight + goalDepth - body.Radius
			body.VY =
				-math.Abs(body.VY) *
					wallRestitution
		}

	default:
		// The field border remains solid everywhere except the goal mouth.
		if body.Y-body.Radius < 0 &&
			!insideGoalMouth {
			body.Y = body.Radius
			body.VY =
				math.Abs(body.VY) *
					wallRestitution
		} else if body.Y+body.Radius > BoardHeight &&
			!insideGoalMouth {
			body.Y = BoardHeight - body.Radius
			body.VY =
				-math.Abs(body.VY) *
					wallRestitution
		}
	}

	// The four posts make the transition from field to net rounded and
	// prevent bodies from clipping through the mouth corners.
	resolvePostCollision(
		body,
		goalLeft,
		0,
	)

	resolvePostCollision(
		body,
		goalRight,
		0,
	)

	resolvePostCollision(
		body,
		goalLeft,
		BoardHeight,
	)

	resolvePostCollision(
		body,
		goalRight,
		BoardHeight,
	)

	return false
}

func (s *Session) goalLocked(
	scorer uint,
	now time.Time,
) {
	if s.phase != PhaseResolving ||
		scorer == 0 {
		return
	}

	s.score[scorer]++
	s.goalSeq++
	s.goalScorerUserID = scorer
	s.phase = PhaseGoal

	s.zeroVelocitiesLocked()

	s.goalResumeAt = now.Add(
		GoalPause,
	)

	s.resolveStartedAt = time.Time{}
	s.stableSince = time.Time{}

	if s.score[scorer] >= TargetGoals {
		s.winnerUserID = scorer
	}

	s.broadcastLocked(
		s.publicStateLocked(),
	)
}

func (s *Session) finishMatchLocked() {
	if s.phase == PhaseMatchOver ||
		s.winnerUserID == 0 {
		return
	}

	s.phase = PhaseMatchOver

	s.zeroVelocitiesLocked()

	s.broadcastLocked(
		s.publicStateLocked(),
	)

	if !s.settled {
		s.settled = true

		winner := s.winnerUserID
		callback := s.onMatchOver
		lobbyID := s.lobbyID

		if callback != nil {
			go callback(
				lobbyID,
				winner,
			)
		}
	}
}

func (s *Session) resetKickoffLocked() {
	bottom := s.playerOrder[0]
	top := s.playerOrder[1]

	horizontalSpacing := 0.20
	defensiveOffset := 0.235
	attackingOffset := 0.455

	s.bodies = []Body{
		newDisc(
			bottom,
			0,
			0.5-horizontalSpacing,
			BoardHeight-defensiveOffset,
		),
		newDisc(
			bottom,
			1,
			0.5+horizontalSpacing,
			BoardHeight-defensiveOffset,
		),
		newDisc(
			bottom,
			2,
			0.5,
			BoardHeight-attackingOffset,
		),
		newDisc(
			top,
			0,
			0.5-horizontalSpacing,
			defensiveOffset,
		),
		newDisc(
			top,
			1,
			0.5+horizontalSpacing,
			defensiveOffset,
		),
		newDisc(
			top,
			2,
			0.5,
			attackingOffset,
		),
		{
			ID:       "ball",
			Kind:     BodyBall,
			X:        BoardWidth / 2,
			Y:        BoardHeight / 2,
			Radius:   ballRadius,
			Mass:     ballMass,
			Rotation: 0,
		},
	}
}

func newDisc(
	owner uint,
	index int,
	x float64,
	y float64,
) Body {
	return Body{
		ID:          discID(owner, index),
		Kind:        BodyDisc,
		OwnerUserID: owner,
		DiscIndex:   index,
		X:           x,
		Y:           y,
		Radius:      discRadius,
		Mass:        discMass,
	}
}

func discID(
	owner uint,
	index int,
) string {
	return "disc-" +
		uintToString(owner) +
		"-" +
		string(rune('0'+index))
}

func uintToString(value uint) string {
	if value == 0 {
		return "0"
	}

	buffer := make(
		[]byte,
		0,
		20,
	)

	for value > 0 {
		buffer = append(
			buffer,
			byte('0'+value%10),
		)

		value /= 10
	}

	for left, right :=
		0,
		len(buffer)-1; left < right; left, right =
		left+1,
		right-1 {
		buffer[left], buffer[right] =
			buffer[right], buffer[left]
	}

	return string(buffer)
}

func resolveBodyCollision(
	first *Body,
	second *Body,
) {
	dx := second.X - first.X
	dy := second.Y - first.Y

	distance := math.Hypot(dx, dy)

	minimumDistance :=
		first.Radius +
			second.Radius

	if distance >= minimumDistance {
		return
	}

	nx := 1.0
	ny := 0.0

	if distance > 0.000001 {
		nx = dx / distance
		ny = dy / distance
	}

	penetration :=
		minimumDistance -
			distance

	inverseFirst := 1.0 / first.Mass
	inverseSecond := 1.0 / second.Mass

	inverseTotal :=
		inverseFirst +
			inverseSecond

	first.X -=
		nx *
			penetration *
			inverseFirst /
			inverseTotal

	first.Y -=
		ny *
			penetration *
			inverseFirst /
			inverseTotal

	second.X +=
		nx *
			penetration *
			inverseSecond /
			inverseTotal

	second.Y +=
		ny *
			penetration *
			inverseSecond /
			inverseTotal

	relativeVX :=
		second.VX -
			first.VX

	relativeVY :=
		second.VY -
			first.VY

	velocityAlongNormal :=
		relativeVX*nx +
			relativeVY*ny

	if velocityAlongNormal > 0 {
		return
	}

	restitution := discRestitution

	if first.Kind == BodyBall ||
		second.Kind == BodyBall {
		restitution = ballRestitution
	}

	impulseMagnitude :=
		-(1 + restitution) *
			velocityAlongNormal /
			inverseTotal

	impulseX :=
		impulseMagnitude *
			nx

	impulseY :=
		impulseMagnitude *
			ny

	first.VX -=
		impulseX *
			inverseFirst

	first.VY -=
		impulseY *
			inverseFirst

	second.VX +=
		impulseX *
			inverseSecond

	second.VY +=
		impulseY *
			inverseSecond

	tangentX := -ny
	tangentY := nx

	relativeTangent :=
		relativeVX*tangentX +
			relativeVY*tangentY

	frictionImpulse := clamp(
		-relativeTangent/inverseTotal,
		-impulseMagnitude*0.055,
		impulseMagnitude*0.055,
	)

	first.VX -=
		frictionImpulse *
			tangentX *
			inverseFirst

	first.VY -=
		frictionImpulse *
			tangentY *
			inverseFirst

	second.VX +=
		frictionImpulse *
			tangentX *
			inverseSecond

	second.VY +=
		frictionImpulse *
			tangentY *
			inverseSecond
}

func resolvePostCollision(
	body *Body,
	postX float64,
	postY float64,
) {
	dx := body.X - postX
	dy := body.Y - postY

	distance := math.Hypot(dx, dy)

	minimumDistance :=
		body.Radius +
			postRadius

	if distance >= minimumDistance {
		return
	}

	nx := 1.0
	ny := 0.0

	if distance > 0.000001 {
		nx = dx / distance
		ny = dy / distance
	}

	penetration :=
		minimumDistance -
			distance

	body.X += nx * penetration
	body.Y += ny * penetration

	normalVelocity :=
		body.VX*nx +
			body.VY*ny

	if normalVelocity < 0 {
		body.VX -=
			(1 + wallRestitution) *
				normalVelocity *
				nx

		body.VY -=
			(1 + wallRestitution) *
				normalVelocity *
				ny
	}
}

func (s *Session) clearPlansLocked() {
	for _, userID := range s.playerOrder {
		s.plans[userID] =
			make(map[int]planVector)

		s.submitted[userID] = false
	}
}

func (s *Session) zeroVelocitiesLocked() {
	for i := range s.bodies {
		s.bodies[i].VX = 0
		s.bodies[i].VY = 0
	}
}

func (s *Session) publicStateLocked() PublicState {
	bodies := make(
		[]Body,
		len(s.bodies),
	)

	copy(bodies, s.bodies)

	for i := range bodies {
		bodies[i].Mass = 0
	}

	score := make(
		map[uint]int,
		len(s.score),
	)

	submitted := make(
		map[uint]bool,
		len(s.submitted),
	)

	for _, userID := range s.playerOrder {
		score[userID] =
			s.score[userID]

		submitted[userID] =
			s.submitted[userID]
	}

	state := PublicState{
		Type:        "state",
		Game:        GameCode,
		LobbyID:     s.lobbyID,
		Phase:       s.phase,
		Ready:       len(s.clients) == len(s.playerOrder),
		ServerMS:    time.Now().UTC().UnixMilli(),
		Tick:        s.tick,
		Round:       s.round,
		TargetGoals: TargetGoals,
		BoardWidth:  BoardWidth,
		BoardHeight: BoardHeight,
		GoalWidth:   goalWidth,
		GoalDepth:   goalDepth,
		PlayerOrder: append(
			[]uint(nil),
			s.playerOrder...,
		),
		Bodies:           bodies,
		Score:            score,
		Submitted:        submitted,
		GoalSeq:          s.goalSeq,
		GoalScorerUserID: s.goalScorerUserID,
		WinnerUserID:     s.winnerUserID,
		Message:          s.messageLocked(),
	}

	if !s.planningDeadline.IsZero() {
		state.PlanningDeadlineMS =
			s.planningDeadline.
				UTC().
				UnixMilli()
	}

	if !s.revealDeadline.IsZero() {
		state.RevealDeadlineMS =
			s.revealDeadline.
				UTC().
				UnixMilli()
	}

	if s.phase == PhaseReveal {
		state.Plans = make(
			map[uint][]PlanPublic,
			len(s.playerOrder),
		)

		for _, userID := range s.playerOrder {
			items := make(
				[]PlanPublic,
				0,
				len(s.plans[userID]),
			)

			for discIndex, plan := range s.plans[userID] {
				items = append(
					items,
					PlanPublic{
						DiscIndex: discIndex,
						DX:        plan.DX,
						DY:        plan.DY,
						Power:     plan.Power,
					},
				)
			}

			sort.Slice(
				items,
				func(i, j int) bool {
					return items[i].DiscIndex <
						items[j].DiscIndex
				},
			)

			state.Plans[userID] = items
		}
	}

	return state
}

func (s *Session) messageLocked() string {
	switch s.phase {
	case PhaseWaiting:
		return "Ждём второго игрока"

	case PhasePlanning:
		return "Выбери направления для фишек"

	case PhaseReveal:
		return "Вскрытие ходов"

	case PhaseResolving:
		return "Ход выполняется"

	case PhaseGoal:
		return "Гол"

	case PhaseMatchOver:
		return "Матч завершён"

	default:
		return ""
	}
}

func (s *Session) broadcastLocked(payload any) {
	for _, cl := range s.clients {
		cl.Enqueue(payload)
	}
}

func (s *Session) sendErrorLocked(
	userID uint,
	message string,
) {
	if cl := s.clients[userID]; cl != nil {
		cl.Enqueue(
			map[string]any{
				"type":  "error",
				"error": message,
			},
		)
	}
}

func (s *Session) CanCleanup(
	now time.Time,
) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return true
	}

	if s.phase == PhaseMatchOver &&
		now.Sub(s.lastActivity) >
			5*time.Minute {
		return true
	}

	return len(s.clients) == 0 &&
		now.Sub(s.lastActivity) >
			45*time.Minute
}

func (s *Session) Close() {
	s.stopOnce.Do(func() {
		s.mu.Lock()

		s.closed = true

		clients := make(
			[]*client,
			0,
			len(s.clients),
		)

		for _, cl := range s.clients {
			clients = append(
				clients,
				cl,
			)
		}

		s.clients =
			make(map[uint]*client)

		s.mu.Unlock()

		close(s.stop)

		for _, cl := range clients {
			cl.Close()
		}

		if s.onDone != nil {
			s.onDone()
		}
	})
}

func containsPlayer(
	players []uint,
	userID uint,
) bool {
	for _, id := range players {
		if id == userID {
			return true
		}
	}

	return false
}

func isFinite(value float64) bool {
	return !math.IsNaN(value) &&
		!math.IsInf(value, 0)
}

func clamp(
	value float64,
	min float64,
	max float64,
) float64 {
	if value < min {
		return min
	}

	if value > max {
		return max
	}

	return value
}
