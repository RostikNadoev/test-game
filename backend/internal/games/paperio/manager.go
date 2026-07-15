package paperio

import (
	"encoding/base64"
	"errors"
	"math/rand"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	GameCode     = "paper_io"
	GridSize     = 64
	CellCount    = GridSize * GridSize
	TickMS       = 78
	DurationMS   = 90_000
	RespawnMS    = 900
	startDelayMS = 650
	cleanupAfter = 10 * time.Minute
	maxInputRate = 30 * time.Millisecond
)

var dx = [4]int{0, 1, 0, -1}
var dy = [4]int{-1, 0, 1, 0}

type CellPatch struct {
	Index int   `json:"i"`
	Value uint8 `json:"v"`
}

type PublicPlayer struct {
	Slot        uint8 `json:"slot"`
	UserID      uint  `json:"user_id"`
	X           int   `json:"x"`
	Y           int   `json:"y"`
	PrevX       int   `json:"px"`
	PrevY       int   `json:"py"`
	Dir         int   `json:"dir"`
	NextDir     int   `json:"next_dir"`
	Alive       bool  `json:"alive"`
	RespawnAtMS int64 `json:"respawn_at_ms,omitempty"`
	Kills       int   `json:"kills"`
}

type PublicState struct {
	Type           string                  `json:"type"`
	Game           string                  `json:"game"`
	LobbyID        string                  `json:"lobby_id"`
	Phase          string                  `json:"phase"`
	Ready          bool                    `json:"ready"`
	YourUserID     uint                    `json:"your_user_id"`
	ServerMS       int64                   `json:"server_ms"`
	StartAtMS      int64                   `json:"start_at_ms,omitempty"`
	DeadlineMS     int64                   `json:"deadline_ms,omitempty"`
	DurationMS     int                     `json:"duration_ms"`
	TickMS         int                     `json:"tick_ms"`
	Tick           int64                   `json:"tick"`
	GridSize       int                     `json:"grid_size"`
	PlayerOrder    []uint                  `json:"player_order"`
	Players        map[string]PublicPlayer `json:"players"`
	Percent        map[string]float64      `json:"percent"`
	Full           bool                    `json:"full"`
	TerritoryB64   string                  `json:"territory_b64,omitempty"`
	TrailB64       string                  `json:"trail_b64,omitempty"`
	TerritoryPatch []CellPatch             `json:"territory_patch,omitempty"`
	TrailPatch     []CellPatch             `json:"trail_patch,omitempty"`
	WinnerUserID   *uint                   `json:"winner_user_id,omitempty"`
	Message        string                  `json:"message,omitempty"`
}

type ClientMessage struct {
	Type string `json:"type"`
	Dir  int    `json:"dir"`
}

type player struct {
	UserID      uint
	Slot        uint8
	X           int
	Y           int
	PrevX       int
	PrevY       int
	Dir         int
	NextDir     int
	TrailCells  []int
	Alive       bool
	ExitX       int
	ExitY       int
	RespawnAtMS int64
	Kills       int
	LastInputAt time.Time
}

type Manager struct {
	mu          sync.Mutex
	sessions    map[string]*Session
	onMatchOver func(lobbyID string, winnerUserID *uint)
}

func NewManager() *Manager {
	return &Manager{sessions: make(map[string]*Session)}
}

func (m *Manager) SetOnMatchOver(fn func(lobbyID string, winnerUserID *uint)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onMatchOver = fn
}

func (m *Manager) Connect(lobbyID string, playerIDs []uint, userID uint, conn *websocket.Conn) error {
	if lobbyID == "" {
		return errors.New("lobby_id is required")
	}
	if len(playerIDs) != 2 {
		return errors.New("paper io requires exactly 2 players")
	}
	if !contains(playerIDs, userID) {
		return errors.New("user is not a player of this lobby")
	}
	ids := append([]uint(nil), playerIDs...)
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })

	m.mu.Lock()
	s := m.sessions[lobbyID]
	if s == nil {
		s = newSession(lobbyID, ids, m.onMatchOver)
		m.sessions[lobbyID] = s
	}
	m.mu.Unlock()

	return s.Attach(userID, conn)
}

func (m *Manager) CleanupLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		m.mu.Lock()
		for id, session := range m.sessions {
			if session.Expired(now) {
				session.Close()
				delete(m.sessions, id)
			}
		}
		m.mu.Unlock()
	}
}

func contains(ids []uint, id uint) bool {
	for _, candidate := range ids {
		if candidate == id {
			return true
		}
	}
	return false
}

type client struct {
	userID uint
	conn   *websocket.Conn
	mu     sync.Mutex
}

func (c *client) Send(value any) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	_ = c.conn.SetWriteDeadline(time.Now().Add(7 * time.Second))
	return c.conn.WriteJSON(value)
}

type Session struct {
	mu sync.Mutex

	lobbyID     string
	playerOrder []uint
	clients     map[uint]*client
	ready       map[uint]bool
	players     [2]*player
	slotByUser  map[uint]uint8
	territory   []uint8
	trail       []uint8
	dirtyTerr   map[int]uint8
	dirtyTrail  map[int]uint8
	phase       string
	startAt     time.Time
	deadline    time.Time
	tick        int64
	percent     [2]float64
	winner      *uint
	finished    bool
	closed      bool
	lastActive  time.Time
	rng         *rand.Rand
	loopStop    chan struct{}
	loopDone    chan struct{}
	onMatchOver func(lobbyID string, winnerUserID *uint)
}

func newSession(lobbyID string, ids []uint, onMatchOver func(string, *uint)) *Session {
	s := &Session{
		lobbyID:     lobbyID,
		playerOrder: append([]uint(nil), ids...),
		clients:     make(map[uint]*client),
		ready:       make(map[uint]bool),
		slotByUser:  map[uint]uint8{ids[0]: 1, ids[1]: 2},
		territory:   make([]uint8, CellCount),
		trail:       make([]uint8, CellCount),
		dirtyTerr:   make(map[int]uint8),
		dirtyTrail:  make(map[int]uint8),
		phase:       "waiting",
		lastActive:  time.Now(),
		rng:         rand.New(rand.NewSource(time.Now().UnixNano())),
		loopStop:    make(chan struct{}),
		loopDone:    make(chan struct{}),
		onMatchOver: onMatchOver,
	}
	s.resetWorldLocked()
	return s
}

func (s *Session) resetWorldLocked() {
	clear(s.territory)
	clear(s.trail)
	clear(s.dirtyTerr)
	clear(s.dirtyTrail)

	s.players[0] = &player{UserID: s.playerOrder[0], Slot: 1, X: 16, Y: 46, PrevX: 16, PrevY: 46, Dir: 0, NextDir: 0, Alive: true, ExitX: 16, ExitY: 46}
	s.players[1] = &player{UserID: s.playerOrder[1], Slot: 2, X: 48, Y: 18, PrevX: 48, PrevY: 18, Dir: 2, NextDir: 2, Alive: true, ExitX: 48, ExitY: 18}
	s.seedTerritoryLocked(s.players[0], 16, 46, 1)
	s.seedTerritoryLocked(s.players[1], 48, 18, 1)
	s.tick = 0
	s.percent = [2]float64{}
	s.updatePercentLocked()
}

func (s *Session) Attach(userID uint, conn *websocket.Conn) error {
	cl := &client{userID: userID, conn: conn}

	s.mu.Lock()
	if old := s.clients[userID]; old != nil {
		_ = old.conn.Close()
	}
	s.clients[userID] = cl
	s.lastActive = time.Now()
	state := s.publicStateForLocked(userID, true, "connected")
	s.mu.Unlock()
	_ = cl.Send(state)

	defer func() {
		s.mu.Lock()
		if s.clients[userID] == cl {
			delete(s.clients, userID)
		}
		s.lastActive = time.Now()
		s.mu.Unlock()
		_ = conn.Close()
	}()

	conn.SetReadLimit(16 * 1024)
	_ = conn.SetReadDeadline(time.Now().Add(70 * time.Second))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(70 * time.Second))
	})

	ping := time.NewTicker(25 * time.Second)
	defer ping.Stop()
	pingDone := make(chan struct{})
	go func() {
		defer close(pingDone)
		for range ping.C {
			cl.mu.Lock()
			_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
			err := conn.WriteControl(websocket.PingMessage, []byte("ping"), time.Now().Add(5*time.Second))
			cl.mu.Unlock()
			if err != nil {
				_ = conn.Close()
				return
			}
		}
	}()

	for {
		var msg ClientMessage
		if err := conn.ReadJSON(&msg); err != nil {
			return nil
		}
		s.Handle(userID, msg)
		select {
		case <-pingDone:
			return nil
		default:
		}
	}
}

func (s *Session) Handle(userID uint, msg ClientMessage) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.lastActive = time.Now()

	switch msg.Type {
	case "state":
		s.sendToLocked(userID, s.publicStateForLocked(userID, true, "state"))
	case "ready":
		s.ready[userID] = true
		if s.phase == "waiting" && len(s.clients) == len(s.playerOrder) && s.allReadyLocked() {
			s.scheduleStartLocked(time.Now())
		} else {
			s.broadcastStateLocked(false, "ready")
		}
	case "direction":
		s.setDirectionLocked(userID, msg.Dir, time.Now())
	default:
		s.sendErrorLocked(userID, "unknown command")
	}
}

func (s *Session) allReadyLocked() bool {
	for _, id := range s.playerOrder {
		if !s.ready[id] {
			return false
		}
	}
	return true
}

func (s *Session) scheduleStartLocked(now time.Time) {
	if s.phase != "waiting" {
		return
	}
	s.resetWorldLocked()
	s.phase = "countdown"
	s.startAt = now.Add(startDelayMS * time.Millisecond)
	s.deadline = s.startAt.Add(DurationMS * time.Millisecond)
	s.broadcastStateLocked(true, "starting")
	clear(s.dirtyTerr)
	clear(s.dirtyTrail)
	go s.loop()
}

func (s *Session) loop() {
	ticker := time.NewTicker(TickMS * time.Millisecond)
	defer ticker.Stop()
	defer close(s.loopDone)

	for {
		select {
		case <-s.loopStop:
			return
		case now := <-ticker.C:
			s.mu.Lock()
			if s.closed {
				s.mu.Unlock()
				return
			}
			if s.phase == "countdown" && !now.Before(s.startAt) {
				s.phase = "playing"
			}
			if s.phase == "playing" {
				if !now.Before(s.deadline) {
					s.finishLocked()
				} else {
					s.stepLocked(now)
				}
			}
			s.broadcastStateLocked(false, "")
			clear(s.dirtyTerr)
			clear(s.dirtyTrail)
			done := s.finished
			s.mu.Unlock()
			if done {
				return
			}
		}
	}
}

func (s *Session) setDirectionLocked(userID uint, dir int, now time.Time) {
	if s.phase != "playing" || dir < 0 || dir > 3 {
		return
	}
	p := s.playerByUserLocked(userID)
	if p == nil || !p.Alive {
		return
	}
	if !p.LastInputAt.IsZero() && now.Sub(p.LastInputAt) < maxInputRate {
		return
	}
	p.LastInputAt = now
	if dir != opposite(p.Dir) {
		p.NextDir = dir
	}
}

func (s *Session) stepLocked(now time.Time) {
	nowMS := now.UnixMilli()
	for _, p := range s.players {
		if !p.Alive && nowMS >= p.RespawnAtMS {
			s.respawnLocked(p)
		}
	}
	for _, p := range s.players {
		if p.Alive {
			s.moveLocked(p, nowMS)
		}
	}

	a := s.players[0]
	b := s.players[1]
	if a.Alive && b.Alive {
		same := a.X == b.X && a.Y == b.Y
		swapped := a.X == b.PrevX && a.Y == b.PrevY && b.X == a.PrevX && b.Y == a.PrevY
		if same || swapped {
			s.killLocked(a, nowMS)
			s.killLocked(b, nowMS)
		}
	}
	s.tick++
	s.updatePercentLocked()
}

func (s *Session) moveLocked(p *player, nowMS int64) {
	if p.NextDir != opposite(p.Dir) {
		p.Dir = p.NextDir
	}
	nx := p.X + dx[p.Dir]
	ny := p.Y + dy[p.Dir]
	p.PrevX = p.X
	p.PrevY = p.Y
	if !inBounds(nx, ny) {
		return
	}
	cell := index(nx, ny)
	trailOwner := s.trail[cell]
	if trailOwner != 0 {
		victim := s.playerBySlotLocked(trailOwner)
		if victim != nil {
			if victim.Slot != p.Slot {
				p.Kills++
			}
			s.killLocked(victim, nowMS)
			if victim.Slot == p.Slot {
				return
			}
		}
	}

	p.X = nx
	p.Y = ny
	owner := s.territory[cell]
	if owner == p.Slot {
		if len(p.TrailCells) > 0 {
			s.captureLocked(p)
		}
		return
	}

	previousOwn := s.territory[index(p.PrevX, p.PrevY)] == p.Slot
	if previousOwn {
		p.ExitX = p.PrevX
		p.ExitY = p.PrevY
	}
	s.setTrailLocked(cell, p.Slot)
	p.TrailCells = append(p.TrailCells, cell)
}

func (s *Session) killLocked(p *player, nowMS int64) {
	if p == nil || !p.Alive {
		return
	}
	p.Alive = false
	for _, cell := range p.TrailCells {
		if s.trail[cell] == p.Slot {
			s.setTrailLocked(cell, 0)
		}
	}
	p.TrailCells = nil
	for cell, owner := range s.territory {
		if owner == p.Slot {
			s.setTerritoryLocked(cell, 0)
		}
	}
	p.RespawnAtMS = nowMS + RespawnMS
}

func (s *Session) respawnLocked(p *player) {
	other := s.players[0]
	if other == p {
		other = s.players[1]
	}
	bestX, bestY := 32, 32
	bestScore := -1 << 30
	for attempt := 0; attempt < 40; attempt++ {
		x := 5 + s.rng.Intn(GridSize-10)
		y := 5 + s.rng.Intn(GridSize-10)
		occupied := 0
		for yy := y - 2; yy <= y+2; yy++ {
			for xx := x - 2; xx <= x+2; xx++ {
				if inBounds(xx, yy) {
					cell := index(xx, yy)
					if s.territory[cell] != 0 || s.trail[cell] != 0 {
						occupied++
					}
				}
			}
		}
		far := 60
		if other != nil && other.Alive {
			far = absInt(x-other.X) + absInt(y-other.Y)
		}
		score := far - occupied*6
		if score > bestScore {
			bestScore = score
			bestX, bestY = x, y
		}
	}
	p.X, p.PrevX = bestX, bestX
	p.Y, p.PrevY = bestY, bestY
	p.Dir = s.rng.Intn(4)
	p.NextDir = p.Dir
	p.ExitX, p.ExitY = bestX, bestY
	p.TrailCells = nil
	p.Alive = true
	p.RespawnAtMS = 0
	s.seedTerritoryLocked(p, bestX, bestY, 1)
}

func (s *Session) captureLocked(p *player) {
	for _, cell := range p.TrailCells {
		s.setTerritoryLocked(cell, p.Slot)
		s.setTrailLocked(cell, 0)
	}
	p.TrailCells = nil

	visited := make([]bool, CellCount)
	queue := make([]int, 0, CellCount)
	push := func(x, y int) {
		if !inBounds(x, y) {
			return
		}
		cell := index(x, y)
		if !visited[cell] && s.territory[cell] != p.Slot {
			visited[cell] = true
			queue = append(queue, cell)
		}
	}
	for x := 0; x < GridSize; x++ {
		push(x, 0)
		push(x, GridSize-1)
	}
	for y := 0; y < GridSize; y++ {
		push(0, y)
		push(GridSize-1, y)
	}
	for head := 0; head < len(queue); head++ {
		cell := queue[head]
		x := cell % GridSize
		y := cell / GridSize
		for dir := 0; dir < 4; dir++ {
			nx := x + dx[dir]
			ny := y + dy[dir]
			if !inBounds(nx, ny) {
				continue
			}
			next := index(nx, ny)
			if !visited[next] && s.territory[next] != p.Slot {
				visited[next] = true
				queue = append(queue, next)
			}
		}
	}
	for cell := 0; cell < CellCount; cell++ {
		if s.territory[cell] != p.Slot && !visited[cell] {
			if s.trail[cell] != 0 && s.trail[cell] != p.Slot {
				s.setTrailLocked(cell, 0)
			}
			s.setTerritoryLocked(cell, p.Slot)
		}
	}
}

func (s *Session) seedTerritoryLocked(p *player, cx, cy, radius int) {
	for y := cy - radius; y <= cy+radius; y++ {
		for x := cx - radius; x <= cx+radius; x++ {
			if inBounds(x, y) {
				s.setTerritoryLocked(index(x, y), p.Slot)
			}
		}
	}
}

func (s *Session) setTerritoryLocked(cell int, value uint8) {
	if cell < 0 || cell >= CellCount || s.territory[cell] == value {
		return
	}
	s.territory[cell] = value
	s.dirtyTerr[cell] = value
}

func (s *Session) setTrailLocked(cell int, value uint8) {
	if cell < 0 || cell >= CellCount || s.trail[cell] == value {
		return
	}
	s.trail[cell] = value
	s.dirtyTrail[cell] = value
}

func (s *Session) updatePercentLocked() {
	counts := [2]int{}
	for _, owner := range s.territory {
		if owner == 1 {
			counts[0]++
		} else if owner == 2 {
			counts[1]++
		}
	}
	s.percent[0] = float64(counts[0]) * 100 / CellCount
	s.percent[1] = float64(counts[1]) * 100 / CellCount
}

func (s *Session) finishLocked() {
	if s.finished {
		return
	}
	s.updatePercentLocked()
	s.finished = true
	s.phase = "match_over"
	var winner *uint
	if s.percent[0] > s.percent[1] {
		id := s.players[0].UserID
		winner = &id
	} else if s.percent[1] > s.percent[0] {
		id := s.players[1].UserID
		winner = &id
	}
	s.winner = winner
	s.broadcastStateLocked(false, "match over")
	clear(s.dirtyTerr)
	clear(s.dirtyTrail)

	if s.onMatchOver != nil {
		lobbyID := s.lobbyID
		var copied *uint
		if winner != nil {
			id := *winner
			copied = &id
		}
		callback := s.onMatchOver
		go callback(lobbyID, copied)
	}
}

func (s *Session) publicStateForLocked(userID uint, full bool, message string) PublicState {
	selfSlot := s.slotByUser[userID]
	mapSlot := func(slot uint8) uint8 {
		if selfSlot == 2 {
			if slot == 1 {
				return 2
			}
			if slot == 2 {
				return 1
			}
		}
		return slot
	}
	players := make(map[string]PublicPlayer, 2)
	for _, p := range s.players {
		visualSlot := mapSlot(p.Slot)
		players[strconv.Itoa(int(visualSlot))] = PublicPlayer{
			Slot:        visualSlot,
			UserID:      p.UserID,
			X:           p.X,
			Y:           p.Y,
			PrevX:       p.PrevX,
			PrevY:       p.PrevY,
			Dir:         p.Dir,
			NextDir:     p.NextDir,
			Alive:       p.Alive,
			RespawnAtMS: p.RespawnAtMS,
			Kills:       p.Kills,
		}
	}
	percent := map[string]float64{}
	if selfSlot == 2 {
		percent["1"] = s.percent[1]
		percent["2"] = s.percent[0]
	} else {
		percent["1"] = s.percent[0]
		percent["2"] = s.percent[1]
	}
	state := PublicState{
		Type:         "state",
		Game:         GameCode,
		LobbyID:      s.lobbyID,
		Phase:        s.phase,
		Ready:        s.allReadyLocked(),
		YourUserID:   userID,
		ServerMS:     time.Now().UnixMilli(),
		StartAtMS:    millis(s.startAt),
		DeadlineMS:   millis(s.deadline),
		DurationMS:   DurationMS,
		TickMS:       TickMS,
		Tick:         s.tick,
		GridSize:     GridSize,
		PlayerOrder:  append([]uint(nil), s.playerOrder...),
		Players:      players,
		Percent:      percent,
		Full:         full,
		WinnerUserID: cloneUintPtr(s.winner),
		Message:      message,
	}
	if full {
		territory := remapOwners(s.territory, selfSlot == 2)
		trail := remapOwners(s.trail, selfSlot == 2)
		state.TerritoryB64 = base64.StdEncoding.EncodeToString(territory)
		state.TrailB64 = base64.StdEncoding.EncodeToString(trail)
	} else {
		state.TerritoryPatch = patchesFromMap(s.dirtyTerr, selfSlot == 2)
		state.TrailPatch = patchesFromMap(s.dirtyTrail, selfSlot == 2)
	}
	return state
}

func remapOwners(source []uint8, swap bool) []byte {
	result := make([]byte, len(source))
	for i, value := range source {
		result[i] = remapOwner(value, swap)
	}
	return result
}

func patchesFromMap(source map[int]uint8, swap bool) []CellPatch {
	if len(source) == 0 {
		return nil
	}
	indexes := make([]int, 0, len(source))
	for index := range source {
		indexes = append(indexes, index)
	}
	sort.Ints(indexes)
	patches := make([]CellPatch, 0, len(indexes))
	for _, index := range indexes {
		patches = append(patches, CellPatch{Index: index, Value: remapOwner(source[index], swap)})
	}
	return patches
}

func remapOwner(value uint8, swap bool) uint8 {
	if !swap {
		return value
	}
	if value == 1 {
		return 2
	}
	if value == 2 {
		return 1
	}
	return value
}

func (s *Session) broadcastStateLocked(full bool, message string) {
	for userID, cl := range s.clients {
		payload := s.publicStateForLocked(userID, full, message)
		clientCopy := cl
		go func() { _ = clientCopy.Send(payload) }()
	}
}

func (s *Session) sendToLocked(userID uint, payload any) {
	if cl := s.clients[userID]; cl != nil {
		go func() { _ = cl.Send(payload) }()
	}
}

func (s *Session) sendErrorLocked(userID uint, message string) {
	s.sendToLocked(userID, map[string]any{"type": "error", "error": message})
}

func (s *Session) playerByUserLocked(userID uint) *player {
	slot := s.slotByUser[userID]
	return s.playerBySlotLocked(slot)
}

func (s *Session) playerBySlotLocked(slot uint8) *player {
	if slot == 1 {
		return s.players[0]
	}
	if slot == 2 {
		return s.players[1]
	}
	return nil
}

func (s *Session) Expired(now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.finished && now.Sub(s.lastActive) > cleanupAfter
}

func (s *Session) Close() {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	s.closed = true
	close(s.loopStop)
	for _, cl := range s.clients {
		_ = cl.conn.Close()
	}
	s.mu.Unlock()
}

func index(x, y int) int     { return y*GridSize + x }
func inBounds(x, y int) bool { return x >= 0 && y >= 0 && x < GridSize && y < GridSize }
func opposite(dir int) int   { return (dir + 2) % 4 }
func absInt(value int) int {
	if value < 0 {
		return -value
	}
	return value
}
func millis(value time.Time) int64 {
	if value.IsZero() {
		return 0
	}
	return value.UnixMilli()
}
func cloneUintPtr(value *uint) *uint {
	if value == nil {
		return nil
	}
	copyValue := *value
	return &copyValue
}
