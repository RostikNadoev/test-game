package blackjack

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	mathrand "math/rand"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	GameCode    = "blackjack_duel"
	TargetWins  = 5
	TurnSeconds = 10

	DealDelayMS         = 700
	SettleRevealDelayMS = 900
	NextRoundDelayMS    = 2500

	PhaseDealing    = "dealing"
	PhasePlayerTurn = "player_turn"
	PhaseSettling   = "settling"
	PhaseRoundOver  = "round_over"
	PhaseMatchOver  = "match_over"
)

type Suit string
type Rank string

const (
	SuitSpades Suit = "spades"
	SuitClubs  Suit = "clubs"
)

var ranks = []Rank{"A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"}
var suits = []Suit{SuitSpades, SuitClubs}

type Card struct {
	ID     string `json:"id"`
	Suit   Suit   `json:"suit"`
	Rank   Rank   `json:"rank"`
	Deck   int    `json:"deck"`
	Hidden bool   `json:"hidden,omitempty"`
}

type HandInfo struct {
	Total     int  `json:"total"`
	Soft      bool `json:"soft"`
	Blackjack bool `json:"blackjack"`
	Bust      bool `json:"bust"`
}

type PlayerState struct {
	UserID uint     `json:"user_id"`
	Cards  []Card   `json:"cards"`
	Info   HandInfo `json:"info"`
	Done   bool     `json:"done"`
	Bust   bool     `json:"bust"`
	Stands bool     `json:"stands"`
}

type Score struct {
	Players map[uint]int `json:"players"`
	Push    int          `json:"push"`
}

type RoundResult struct {
	Round        int    `json:"round"`
	WinnerUserID uint   `json:"winner_user_id,omitempty"`
	Winner       string `json:"winner"` // "player" или "push"
	Reason       string `json:"reason"`

	PlayerTotals map[uint]int      `json:"player_totals"`
	PlayerInfo   map[uint]HandInfo `json:"player_info"`

	ScoreBefore map[uint]int `json:"score_before"`
	ScoreAfter  map[uint]int `json:"score_after"`
}

type PublicState struct {
	Type              string                 `json:"type"`
	Game              string                 `json:"game"`
	LobbyID           string                 `json:"lobby_id"`
	Phase             string                 `json:"phase"`
	Round             int                    `json:"round"`
	TargetWins        int                    `json:"target_wins"`
	TurnSeconds       int                    `json:"turn_seconds"`
	ActiveUserID      uint                   `json:"active_user_id,omitempty"`
	ActiveUserIDs     []uint                 `json:"active_user_ids,omitempty"`
	TurnDeadlineMS    int64                  `json:"turn_deadline_ms,omitempty"`
	ServerMS          int64                  `json:"server_ms"`
	DealerHidden      bool                   `json:"dealer_hidden"`
	DealerCards       []Card                 `json:"dealer_cards"`
	DealerInfo        HandInfo               `json:"dealer_info"`
	Players           map[uint]PlayerState   `json:"players"`
	PlayerOrder       []uint                 `json:"player_order"`
	Score             Score                  `json:"score"`
	RoundResult       *RoundResult           `json:"round_result,omitempty"`
	RoundWinnerUserID uint                   `json:"round_winner_user_id,omitempty"`
	WinnerUserID      uint                   `json:"winner_user_id,omitempty"`
	RoundWinner       string                 `json:"round_winner,omitempty"`
	Winner            string                 `json:"winner,omitempty"`
	MatchWinnerID     uint                   `json:"match_winner_id,omitempty"`
	Message           string                 `json:"message"`
	Extra             map[string]interface{} `json:"extra,omitempty"`
}

type ClientMessage struct {
	Type string `json:"type"`
}

type Manager struct {
	mu          sync.Mutex
	sessions    map[string]*Session
	onMatchOver func(lobbyID string, winnerUserID uint)
}

func NewManager() *Manager {
	return &Manager{sessions: make(map[string]*Session)}
}

func (m *Manager) SetOnMatchOver(fn func(lobbyID string, winnerUserID uint)) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.onMatchOver = fn
}

func (m *Manager) Connect(lobbyID string, playerIDs []uint, userID uint, conn *websocket.Conn) error {
	if lobbyID == "" {
		return errors.New("lobby_id is required")
	}
	if len(playerIDs) != 2 {
		return errors.New("blackjack match requires exactly 2 players")
	}
	if !containsPlayer(playerIDs, userID) {
		return errors.New("user is not a player of this lobby")
	}

	m.mu.Lock()
	s, ok := m.sessions[lobbyID]
	if !ok {
		s = NewSession(lobbyID, playerIDs, m.onMatchOver)
		m.sessions[lobbyID] = s
	}
	m.mu.Unlock()

	return s.Attach(userID, conn)
}

func (m *Manager) RemoveSession(lobbyID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sessions, lobbyID)
}

func (m *Manager) CleanupLoop() {
	ticker := time.NewTicker(30 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		m.mu.Lock()
		for id := range m.sessions {
			delete(m.sessions, id)
		}
		m.mu.Unlock()
	}
}

func containsPlayer(players []uint, userID uint) bool {
	for _, id := range players {
		if id == userID {
			return true
		}
	}
	return false
}

type Client struct {
	userID uint
	conn   *websocket.Conn
	mu     sync.Mutex
}

func (c *Client) Send(v any) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	_ = c.conn.SetWriteDeadline(time.Now().Add(8 * time.Second))
	return c.conn.WriteJSON(v)
}

type Session struct {
	mu sync.Mutex

	lobbyID string
	clients map[uint]*Client

	playerOrder []uint
	deck        []Card
	playerHands map[uint][]Card
	dealerHand  []Card
	playerDone  map[uint]bool
	playerStand map[uint]bool

	phase          string
	round          int
	score          map[uint]int
	pushes         int
	turnDeadline   time.Time
	roundTimer     *time.Timer
	settleTimer    *time.Timer
	nextRoundTimer *time.Timer
	roundResult    *RoundResult
	matchWinnerID  uint
	onMatchOver    func(lobbyID string, winnerUserID uint)
	matchClosed    bool
}

func NewSession(lobbyID string, playerIDs []uint, onMatchOver func(lobbyID string, winnerUserID uint)) *Session {
	ids := append([]uint(nil), playerIDs...)
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })

	s := &Session{
		lobbyID:     lobbyID,
		clients:     make(map[uint]*Client),
		playerOrder: ids,
		playerHands: make(map[uint][]Card),
		playerDone:  make(map[uint]bool),
		playerStand: make(map[uint]bool),
		score:       map[uint]int{ids[0]: 0, ids[1]: 0},
		round:       1,
		phase:       PhaseDealing,
		onMatchOver: onMatchOver,
	}

	s.startRoundLocked(1)
	return s
}

func (s *Session) Attach(userID uint, conn *websocket.Conn) error {
	client := &Client{userID: userID, conn: conn}

	s.mu.Lock()
	if old := s.clients[userID]; old != nil {
		_ = old.conn.Close()
	}
	s.clients[userID] = client
	state := s.publicStateForLocked(userID, "state")
	s.mu.Unlock()

	_ = client.Send(state)

	defer func() {
		s.mu.Lock()
		if s.clients[userID] == client {
			delete(s.clients, userID)
		}
		s.mu.Unlock()
		_ = conn.Close()
	}()

	conn.SetReadLimit(1 << 20)
	_ = conn.SetReadDeadline(time.Now().Add(70 * time.Second))
	conn.SetPongHandler(func(string) error {
		_ = conn.SetReadDeadline(time.Now().Add(70 * time.Second))
		return nil
	})

	pingTicker := time.NewTicker(25 * time.Second)
	defer pingTicker.Stop()
	done := make(chan struct{})

	go func() {
		defer close(done)
		for range pingTicker.C {
			client.mu.Lock()
			_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
			err := conn.WriteControl(websocket.PingMessage, []byte("ping"), time.Now().Add(5*time.Second))
			client.mu.Unlock()
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
		case <-done:
			return nil
		default:
		}
	}
}

func (s *Session) Handle(userID uint, msg ClientMessage) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.stopExpiredTurnLocked()

	switch msg.Type {
	case "state":
		s.sendToLocked(userID, s.publicStateForLocked(userID, "state"))
	case "hit":
		s.hitLocked(userID)
	case "stand":
		s.standLocked(userID)
	case "next_round":
		// Раунды теперь переключаются автоматически. Команду оставляем без ошибки для старого фронта.
		s.sendToLocked(userID, s.publicStateForLocked(userID, "state"))
	case "restart_match":
		s.restartMatchLocked()
	default:
		s.sendErrorLocked(userID, "unknown command")
	}
}

func (s *Session) hitLocked(userID uint) {
	if s.phase != PhasePlayerTurn {
		s.sendErrorLocked(userID, "round is not in player turn phase")
		return
	}
	if !containsPlayer(s.playerOrder, userID) {
		s.sendErrorLocked(userID, "user is not in match")
		return
	}
	if s.playerDone[userID] {
		s.sendErrorLocked(userID, "player already done")
		return
	}

	s.playerHands[userID] = append(s.playerHands[userID], s.drawCardLocked())
	info := GetHandInfo(s.playerHands[userID])

	if info.Bust || info.Total == 21 {
		s.playerDone[userID] = true
		s.playerStand[userID] = true
	}

	if s.allPlayersDoneLocked() {
		s.beginSettleLocked("all_players_done")
		return
	}

	s.broadcastLocked("state")
}

func (s *Session) standLocked(userID uint) {
	if s.phase != PhasePlayerTurn {
		s.sendErrorLocked(userID, "round is not in player turn phase")
		return
	}
	if !containsPlayer(s.playerOrder, userID) {
		s.sendErrorLocked(userID, "user is not in match")
		return
	}
	if s.playerDone[userID] {
		s.sendToLocked(userID, s.publicStateForLocked(userID, "state"))
		return
	}

	s.playerDone[userID] = true
	s.playerStand[userID] = true

	if s.allPlayersDoneLocked() {
		s.beginSettleLocked("all_players_done")
		return
	}

	s.broadcastLocked("state")
}

func (s *Session) restartMatchLocked() {
	if s.matchClosed {
		s.broadcastLocked("state")
		return
	}
	s.stopTimersLocked()
	s.score = make(map[uint]int, len(s.playerOrder))
	for _, id := range s.playerOrder {
		s.score[id] = 0
	}
	s.pushes = 0
	s.matchWinnerID = 0
	s.round = 1
	s.startRoundLocked(1)
	s.broadcastLocked("state")
}

func (s *Session) startRoundLocked(round int) {
	s.stopTimersLocked()

	if len(s.deck) < 24 {
		s.deck = createShoe(8)
	}

	s.round = round
	s.phase = PhaseDealing
	s.roundResult = nil
	s.matchWinnerID = 0
	s.turnDeadline = time.Time{}
	s.dealerHand = nil
	s.playerHands = make(map[uint][]Card, len(s.playerOrder))
	s.playerDone = make(map[uint]bool, len(s.playerOrder))
	s.playerStand = make(map[uint]bool, len(s.playerOrder))

	for _, id := range s.playerOrder {
		s.playerHands[id] = []Card{s.drawCardLocked(), s.drawCardLocked()}
	}
	s.dealerHand = []Card{s.drawCardLocked(), s.drawCardLocked()}

	s.broadcastLocked("state")

	s.roundTimer = time.AfterFunc(time.Duration(DealDelayMS)*time.Millisecond, func() {
		s.mu.Lock()
		defer s.mu.Unlock()

		if s.phase != PhaseDealing {
			return
		}

		instantSettle := GetHandInfo(s.dealerHand).Blackjack
		for _, id := range s.playerOrder {
			info := GetHandInfo(s.playerHands[id])
			if info.Blackjack || info.Total == 21 {
				s.playerDone[id] = true
				s.playerStand[id] = true
			}
			if info.Blackjack {
				instantSettle = true
			}
		}

		if instantSettle || s.allPlayersDoneLocked() {
			s.beginSettleLocked("blackjack")
			return
		}

		s.phase = PhasePlayerTurn
		s.turnDeadline = time.Now().UTC().Add(TurnSeconds * time.Second)
		s.startCommonTurnTimerLocked()
		s.broadcastLocked("state")
	})
}

func (s *Session) startCommonTurnTimerLocked() {
	if s.roundTimer != nil {
		s.roundTimer.Stop()
	}

	s.roundTimer = time.AfterFunc(TurnSeconds*time.Second, func() {
		s.mu.Lock()
		defer s.mu.Unlock()

		if s.phase != PhasePlayerTurn {
			return
		}

		for _, id := range s.playerOrder {
			if !s.playerDone[id] {
				s.playerDone[id] = true
				s.playerStand[id] = true
			}
		}

		s.beginSettleLocked("timer")
	})
}

func (s *Session) stopExpiredTurnLocked() {
	if s.phase != PhasePlayerTurn || s.turnDeadline.IsZero() {
		return
	}
	if time.Now().UTC().Before(s.turnDeadline) {
		return
	}

	for _, id := range s.playerOrder {
		if !s.playerDone[id] {
			s.playerDone[id] = true
			s.playerStand[id] = true
		}
	}
	s.beginSettleLocked("timer")
}

func (s *Session) allPlayersDoneLocked() bool {
	for _, id := range s.playerOrder {
		if !s.playerDone[id] {
			return false
		}
	}
	return true
}

func (s *Session) activePlayersLocked() []uint {
	if s.phase != PhasePlayerTurn {
		return nil
	}
	ids := make([]uint, 0, len(s.playerOrder))
	for _, id := range s.playerOrder {
		if !s.playerDone[id] {
			ids = append(ids, id)
		}
	}
	return ids
}

func (s *Session) beginSettleLocked(reason string) {
	if s.phase != PhasePlayerTurn && s.phase != PhaseDealing {
		return
	}

	if s.roundTimer != nil {
		s.roundTimer.Stop()
		s.roundTimer = nil
	}

	s.phase = PhaseSettling
	s.turnDeadline = time.Time{}
	s.broadcastLocked("state")

	s.settleTimer = time.AfterFunc(time.Duration(SettleRevealDelayMS)*time.Millisecond, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		s.finishRoundLocked(reason)
	})
}

func (s *Session) finishRoundLocked(reason string) {
	if s.phase != PhaseSettling {
		return
	}

	scoreBefore := cloneScore(s.score)

	result := s.calculateRoundResultLocked(reason)
	result.ScoreBefore = scoreBefore

	if result.WinnerUserID != 0 {
		s.score[result.WinnerUserID]++
	} else {
		s.pushes++
	}

	result.ScoreAfter = cloneScore(s.score)
	s.roundResult = result

	for _, id := range s.playerOrder {
		if s.score[id] >= TargetWins {
			s.phase = PhaseMatchOver
			s.matchWinnerID = id
			s.matchClosed = true
			s.broadcastLocked("state")

			if s.onMatchOver != nil {
				lobbyID := s.lobbyID
				winnerID := s.matchWinnerID
				onMatchOver := s.onMatchOver

				go onMatchOver(lobbyID, winnerID)
			}

			return
		}
	}

	s.phase = PhaseRoundOver
	s.broadcastLocked("state")

	roundToStart := s.round + 1

	s.nextRoundTimer = time.AfterFunc(time.Duration(NextRoundDelayMS)*time.Millisecond, func() {
		s.mu.Lock()
		defer s.mu.Unlock()

		if s.phase != PhaseRoundOver {
			return
		}

		s.startRoundLocked(roundToStart)
	})
}

func (s *Session) calculateRoundResultLocked(reason string) *RoundResult {
	totals := make(map[uint]int, len(s.playerOrder))
	infos := make(map[uint]HandInfo, len(s.playerOrder))

	for _, id := range s.playerOrder {
		info := GetHandInfo(s.playerHands[id])
		infos[id] = info
		totals[id] = info.Total
	}

	if len(s.playerOrder) != 2 {
		return &RoundResult{
			Round:        s.round,
			WinnerUserID: 0,
			Winner:       "push",
			Reason:       "invalid_players_count",
			PlayerTotals: totals,
			PlayerInfo:   infos,
		}
	}

	p1 := s.playerOrder[0]
	p2 := s.playerOrder[1]

	winnerID, resultReason := comparePvPHands(p1, infos[p1], p2, infos[p2])

	winner := "push"
	if winnerID != 0 {
		winner = "player"
	}

	return &RoundResult{
		Round:        s.round,
		WinnerUserID: winnerID,
		Winner:       winner,
		Reason:       resultReason,
		PlayerTotals: totals,
		PlayerInfo:   infos,
	}
}
func comparePvPHands(p1 uint, h1 HandInfo, p2 uint, h2 HandInfo) (uint, string) {
	// Оба перебрали — ничья
	if h1.Bust && h2.Bust {
		return 0, "both_bust"
	}

	// Один перебрал — второй победил
	if h1.Bust && !h2.Bust {
		return p2, "opponent_not_bust"
	}

	if h2.Bust && !h1.Bust {
		return p1, "player_not_bust"
	}

	// Блэкджек сильнее обычного 21
	if h1.Blackjack && !h2.Blackjack {
		return p1, "blackjack"
	}

	if h2.Blackjack && !h1.Blackjack {
		return p2, "blackjack"
	}

	// Оба blackjack — ничья
	if h1.Blackjack && h2.Blackjack {
		return 0, "both_blackjack"
	}

	// Сравнение по очкам
	if h1.Total > h2.Total {
		return p1, "higher_total"
	}

	if h2.Total > h1.Total {
		return p2, "higher_total"
	}

	return 0, "same_total"
}

func blackjackOutcome(player HandInfo, dealer HandInfo) string {
	if player.Bust && dealer.Bust {
		return "push"
	}
	if player.Blackjack && !dealer.Blackjack {
		return "win"
	}
	if dealer.Blackjack && !player.Blackjack {
		return "lose"
	}
	if player.Bust {
		return "lose"
	}
	if dealer.Bust {
		return "win"
	}
	if player.Total > dealer.Total {
		return "win"
	}
	if player.Total < dealer.Total {
		return "lose"
	}
	return "push"
}

func outcomeRank(outcome string) int {
	switch outcome {
	case "win":
		return 2
	case "push":
		return 1
	default:
		return 0
	}
}

func bestPlayerByHand(playerIDs []uint, hands map[uint][]Card) uint {
	bestID := uint(0)
	bestScore := -1
	tie := false

	for _, id := range playerIDs {
		info := GetHandInfo(hands[id])
		score := info.Total
		if info.Blackjack {
			score = 22
		}
		if info.Bust {
			score = -1
		}

		if score > bestScore {
			bestScore = score
			bestID = id
			tie = false
		} else if score == bestScore {
			tie = true
		}
	}

	if tie {
		return 0
	}
	return bestID
}

func (s *Session) drawCardLocked() Card {
	if len(s.deck) < 1 {
		s.deck = createShoe(8)
	}
	last := len(s.deck) - 1
	card := s.deck[last]
	s.deck = s.deck[:last]
	return card
}

func createShoe(decks int) []Card {
	shoe := make([]Card, 0, decks*len(suits)*len(ranks))
	for deck := 0; deck < decks; deck++ {
		for _, suit := range suits {
			for _, rank := range ranks {
				shoe = append(shoe, Card{ID: fmt.Sprintf("%d-%s-%s-%s", deck, rank, suit, randomHex(4)), Suit: suit, Rank: rank, Deck: deck})
			}
		}
	}
	mathrand.Shuffle(len(shoe), func(i, j int) { shoe[i], shoe[j] = shoe[j], shoe[i] })
	return shoe
}

func randomHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 36)
	}
	return hex.EncodeToString(b)
}

func rankValue(rank Rank) int {
	switch rank {
	case "A":
		return 11
	case "K", "Q", "J":
		return 10
	default:
		v, _ := strconv.Atoi(string(rank))
		return v
	}
}

func GetHandInfo(cards []Card) HandInfo {
	total := 0
	aces := 0
	for _, card := range cards {
		total += rankValue(card.Rank)
		if card.Rank == "A" {
			aces++
		}
	}

	softAces := aces
	for total > 21 && softAces > 0 {
		total -= 10
		softAces--
	}

	return HandInfo{
		Total:     total,
		Soft:      softAces > 0 && total <= 21,
		Blackjack: len(cards) == 2 && total == 21,
		Bust:      total > 21,
	}
}

func (s *Session) publicStateForLocked(viewerID uint, msgType string) PublicState {
	players := make(map[uint]PlayerState, len(s.playerOrder))
	for _, id := range s.playerOrder {
		cards := cloneCards(s.playerHands[id])
		info := GetHandInfo(cards)
		players[id] = PlayerState{UserID: id, Cards: cards, Info: info, Done: s.playerDone[id], Bust: info.Bust, Stands: s.playerStand[id]}
	}

	dealerCards := cloneCards(s.dealerHand)
	dealerHidden := s.phase == PhasePlayerTurn || s.phase == PhaseDealing
	if dealerHidden && len(dealerCards) > 1 {
		for i := 1; i < len(dealerCards); i++ {
			dealerCards[i].Hidden = true
			dealerCards[i].Rank = ""
			dealerCards[i].Suit = ""
		}
	}

	deadlineMS := int64(0)
	if !s.turnDeadline.IsZero() {
		deadlineMS = s.turnDeadline.UnixMilli()
	}

	activeIDs := s.activePlayersLocked()
	activeUserID := uint(0)
	if containsPlayer(activeIDs, viewerID) {
		activeUserID = viewerID
	} else if len(activeIDs) == 1 {
		activeUserID = activeIDs[0]
	}

	winnerID := uint(0)
	winner := ""
	if s.roundResult != nil {
		winnerID = s.roundResult.WinnerUserID
		winner = s.roundResult.Winner
	}

	return PublicState{
		Type:              msgType,
		Game:              GameCode,
		LobbyID:           s.lobbyID,
		Phase:             s.phase,
		Round:             s.round,
		TargetWins:        TargetWins,
		TurnSeconds:       TurnSeconds,
		ActiveUserID:      activeUserID,
		ActiveUserIDs:     activeIDs,
		TurnDeadlineMS:    deadlineMS,
		ServerMS:          time.Now().UTC().UnixMilli(),
		DealerHidden:      dealerHidden,
		DealerCards:       dealerCards,
		DealerInfo:        GetHandInfo(s.dealerHand),
		Players:           players,
		PlayerOrder:       append([]uint(nil), s.playerOrder...),
		Score:             Score{Players: cloneScore(s.score), Push: s.pushes},
		RoundResult:       s.roundResult,
		RoundWinnerUserID: winnerID,
		WinnerUserID:      winnerID,
		RoundWinner:       winner,
		Winner:            winner,
		MatchWinnerID:     s.matchWinnerID,
		Message:           s.messageLocked(),
	}
}

func (s *Session) messageLocked() string {
	switch s.phase {
	case PhaseDealing:
		return "Раздача"
	case PhasePlayerTurn:
		return "Общий ход"
	case PhaseSettling:
		return "Вскрытие"
	case PhaseRoundOver:
		return "Раунд окончен"
	case PhaseMatchOver:
		return "Матч окончен"
	default:
		return ""
	}
}

func cloneCards(in []Card) []Card {
	out := make([]Card, len(in))
	copy(out, in)
	return out
}

func cloneScore(in map[uint]int) map[uint]int {
	out := make(map[uint]int, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}

func (s *Session) sendToLocked(userID uint, v any) {
	client := s.clients[userID]
	if client == nil {
		return
	}
	go func() { _ = client.Send(v) }()
}

func (s *Session) sendErrorLocked(userID uint, msg string) {
	s.sendToLocked(userID, map[string]any{"type": "error", "error": msg, "server_ms": time.Now().UTC().UnixMilli()})
}

func (s *Session) broadcastLocked(msgType string) {
	for id, client := range s.clients {
		cl := client
		state := s.publicStateForLocked(id, msgType)
		go func() { _ = cl.Send(state) }()
	}
}

func (s *Session) stopTimersLocked() {
	if s.roundTimer != nil {
		s.roundTimer.Stop()
		s.roundTimer = nil
	}
	if s.settleTimer != nil {
		s.settleTimer.Stop()
		s.settleTimer = nil
	}
	if s.nextRoundTimer != nil {
		s.nextRoundTimer.Stop()
		s.nextRoundTimer = nil
	}
}
