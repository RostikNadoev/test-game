package reactions

import (
	"errors"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

const sendCooldown = 650 * time.Millisecond

var allowedEmoji = map[string]struct{}{
	"🔥": {},
	"😂": {},
	"👏": {},
}

type Manager struct {
	mu       sync.RWMutex
	rooms    map[string]map[*client]struct{}
	sequence atomic.Uint64
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

func NewManager() *Manager {
	return &Manager{rooms: make(map[string]map[*client]struct{})}
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
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.rooms[lobbyID] == nil {
		m.rooms[lobbyID] = make(map[*client]struct{})
	}
	m.rooms[lobbyID][current] = struct{}{}
}

func (m *Manager) unregister(lobbyID string, current *client) {
	m.mu.Lock()
	defer m.mu.Unlock()

	room := m.rooms[lobbyID]
	delete(room, current)
	if len(room) == 0 {
		delete(m.rooms, lobbyID)
	}
}

func (m *Manager) broadcast(lobbyID string, message ReactionMessage) {
	m.mu.RLock()
	room := m.rooms[lobbyID]
	clients := make([]*client, 0, len(room))
	for current := range room {
		clients = append(clients, current)
	}
	m.mu.RUnlock()

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
