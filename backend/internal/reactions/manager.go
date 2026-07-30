package reactions

import (
	"errors"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

const (
	sendCooldown          = 650 * time.Millisecond
	disconnectGracePeriod = 10 * time.Second
)

var allowedEmoji = map[string]struct{}{
	"🔥": {},
	"😂": {},
	"👏": {},
}

type PresenceCallbacks struct {
	Pause   func(game, lobbyID string)
	Resume  func(game, lobbyID string, pausedFor time.Duration)
	Resolve func(game, lobbyID string, winnerUserID *uint)
}

type Manager struct {
	mu        sync.Mutex
	rooms     map[string]*room
	sequence  atomic.Uint64
	callbacks PresenceCallbacks
}

type room struct {
	lobbyID      string
	game         string
	playerIDs    []uint
	clients      map[*client]struct{}
	started      bool
	waiting      bool
	resolved     bool
	pausedAt     time.Time
	deadline     time.Time
	resolveTimer *time.Timer
}

type client struct {
	userID   uint
	conn     *websocket.Conn
	writeMu  sync.Mutex
	lastSent time.Time
}

type incomingMessage struct {
	Type  string `json:"type"`
	Emoji string `json:"emoji"`
}

type ReactionMessage struct {
	Type     string `json:"type"`
	Sequence uint64 `json:"sequence"`
	UserID   uint   `json:"user_id"`
	Emoji    string `json:"emoji"`
	SentAtMS int64  `json:"sent_at_ms"`
}

type PresenceMessage struct {
	Type               string `json:"type"`
	Status             string `json:"status"`
	DisconnectedUserID uint   `json:"disconnected_user_id,omitempty"`
	DeadlineMS         int64  `json:"deadline_ms,omitempty"`
	WinnerUserID       *uint  `json:"winner_user_id,omitempty"`
	Draw               bool   `json:"draw,omitempty"`
}

func NewManager() *Manager {
	return &Manager{rooms: make(map[string]*room)}
}

func (m *Manager) SetPresenceCallbacks(callbacks PresenceCallbacks) {
	m.mu.Lock()
	m.callbacks = callbacks
	m.mu.Unlock()
}

func (m *Manager) Complete(lobbyID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	r := m.rooms[lobbyID]
	if r == nil {
		return
	}
	r.resolved = true
	r.waiting = false
	if r.resolveTimer != nil {
		r.resolveTimer.Stop()
		r.resolveTimer = nil
	}
}

func (m *Manager) Prepare(lobbyID, game string, playerIDs []uint) {
	ids := append([]uint(nil), playerIDs...)
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })

	m.mu.Lock()
	defer m.mu.Unlock()

	current := m.rooms[lobbyID]
	if current == nil {
		m.rooms[lobbyID] = &room{
			lobbyID:   lobbyID,
			game:      game,
			playerIDs: ids,
			clients:   make(map[*client]struct{}),
		}
		return
	}
	current.game = game
	current.playerIDs = ids
}

func IsAllowedEmoji(emoji string) bool {
	_, ok := allowedEmoji[emoji]
	return ok
}

func (m *Manager) Connect(lobbyID string, userID uint, conn *websocket.Conn) error {
	if m == nil || conn == nil {
		return errors.New("reaction websocket is not configured")
	}
	if lobbyID == "" || userID == 0 {
		return errors.New("invalid reaction websocket identity")
	}

	current := &client{userID: userID, conn: conn}
	m.register(lobbyID, current)
	defer m.unregister(lobbyID, current)

	conn.SetReadLimit(1024)

	for {
		var incoming incomingMessage
		if err := conn.ReadJSON(&incoming); err != nil {
			return err
		}
		if incoming.Type != "reaction" || !IsAllowedEmoji(incoming.Emoji) {
			_ = current.writeJSON(map[string]any{
				"type":  "error",
				"error": "unsupported reaction",
			})
			continue
		}

		now := time.Now()
		if !current.lastSent.IsZero() && now.Sub(current.lastSent) < sendCooldown {
			continue
		}
		current.lastSent = now

		m.broadcast(lobbyID, ReactionMessage{
			Type:     "reaction",
			Sequence: m.sequence.Add(1),
			UserID:   userID,
			Emoji:    incoming.Emoji,
			SentAtMS: now.UnixMilli(),
		})
	}
}

func (m *Manager) register(lobbyID string, current *client) {
	var resume func()
	var presence PresenceMessage

	m.mu.Lock()
	r := m.rooms[lobbyID]
	if r == nil {
		r = &room{lobbyID: lobbyID, clients: make(map[*client]struct{})}
		m.rooms[lobbyID] = r
	}
	r.clients[current] = struct{}{}

	connected := connectedUsers(r)
	if len(connected) == len(r.playerIDs) && len(r.playerIDs) == 2 {
		if !r.started {
			r.started = true
		}
		if r.waiting && !r.resolved {
			pausedFor := time.Since(r.pausedAt)
			if r.resolveTimer != nil {
				r.resolveTimer.Stop()
				r.resolveTimer = nil
			}
			r.waiting = false
			r.deadline = time.Time{}
			callback := m.callbacks.Resume
			game := r.game
			resume = func() {
				if callback != nil {
					callback(game, lobbyID, pausedFor)
				}
			}
		}
		presence = PresenceMessage{Type: "presence", Status: "active"}
	} else if r.waiting {
		presence = presenceWaitingMessage(r, connected)
	}
	m.mu.Unlock()

	if resume != nil {
		resume()
	}
	if presence.Status != "" {
		m.broadcast(lobbyID, presence)
	}
}

func (m *Manager) unregister(lobbyID string, current *client) {
	var pause func()
	var presence PresenceMessage

	m.mu.Lock()
	r := m.rooms[lobbyID]
	if r == nil {
		m.mu.Unlock()
		return
	}
	delete(r.clients, current)

	connected := connectedUsers(r)
	if r.started && !r.waiting && !r.resolved && len(connected) < len(r.playerIDs) {
		now := time.Now()
		r.waiting = true
		r.pausedAt = now
		r.deadline = now.Add(disconnectGracePeriod)
		callback := m.callbacks.Pause
		game := r.game
		pause = func() {
			if callback != nil {
				callback(game, lobbyID)
			}
		}
		r.resolveTimer = time.AfterFunc(disconnectGracePeriod, func() {
			m.resolveDisconnect(lobbyID)
		})
	}
	if r.waiting {
		presence = presenceWaitingMessage(r, connected)
	}
	m.mu.Unlock()

	if pause != nil {
		pause()
	}
	if presence.Status != "" {
		m.broadcast(lobbyID, presence)
	}
}

func (m *Manager) resolveDisconnect(lobbyID string) {
	var callback func()
	var message PresenceMessage

	m.mu.Lock()
	r := m.rooms[lobbyID]
	if r == nil || !r.waiting || r.resolved {
		m.mu.Unlock()
		return
	}

	connected := connectedUsers(r)
	if len(connected) == len(r.playerIDs) {
		m.mu.Unlock()
		return
	}

	r.resolved = true
	r.waiting = false
	r.resolveTimer = nil

	var winner *uint
	if len(connected) == 1 {
		id := connected[0]
		winner = &id
	}
	message = PresenceMessage{
		Type:         "presence",
		Status:       "resolved",
		WinnerUserID: winner,
		Draw:         winner == nil,
	}
	resolve := m.callbacks.Resolve
	game := r.game
	callback = func() {
		if resolve != nil {
			resolve(game, lobbyID, winner)
		}
	}
	m.mu.Unlock()

	m.broadcast(lobbyID, message)
	callback()
}

func presenceWaitingMessage(r *room, connected []uint) PresenceMessage {
	var disconnected uint
	for _, id := range r.playerIDs {
		if !containsID(connected, id) {
			disconnected = id
			break
		}
	}
	return PresenceMessage{
		Type:               "presence",
		Status:             "waiting",
		DisconnectedUserID: disconnected,
		DeadlineMS:         r.deadline.UnixMilli(),
	}
}

func connectedUsers(r *room) []uint {
	seen := make(map[uint]bool)
	for current := range r.clients {
		seen[current.userID] = true
	}
	users := make([]uint, 0, len(seen))
	for id := range seen {
		users = append(users, id)
	}
	sort.Slice(users, func(i, j int) bool { return users[i] < users[j] })
	return users
}

func containsID(ids []uint, wanted uint) bool {
	for _, id := range ids {
		if id == wanted {
			return true
		}
	}
	return false
}

func (m *Manager) broadcast(lobbyID string, message any) {
	m.mu.Lock()
	r := m.rooms[lobbyID]
	clients := make([]*client, 0)
	if r != nil {
		clients = make([]*client, 0, len(r.clients))
		for current := range r.clients {
			clients = append(clients, current)
		}
	}
	m.mu.Unlock()

	for _, current := range clients {
		_ = current.writeJSON(message)
	}
}

func (c *client) writeJSON(value any) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()

	if err := c.conn.SetWriteDeadline(time.Now().Add(3 * time.Second)); err != nil {
		return err
	}
	return c.conn.WriteJSON(value)
}
