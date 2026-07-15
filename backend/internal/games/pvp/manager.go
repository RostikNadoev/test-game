package pvp

import (
	"errors"
	"sort"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type ClientMessage struct {
	Type         string `json:"type"`
	WinnerUserID *uint  `json:"winner_user_id"`
	Payload      any    `json:"payload,omitempty"`
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

func (m *Manager) Connect(gameCode, lobbyID string, playerIDs []uint, userID uint, conn *websocket.Conn) error {
	if lobbyID == "" {
		return errors.New("lobby_id is required")
	}
	if len(playerIDs) != 2 {
		return errors.New("pvp match requires exactly 2 players")
	}

	m.mu.Lock()
	key := gameCode + ":" + lobbyID
	s, ok := m.sessions[key]
	if !ok {
		s = NewSession(gameCode, lobbyID, playerIDs, m.onMatchOver)
		m.sessions[key] = s
	}
	m.mu.Unlock()

	return s.Attach(userID, conn)
}

type relayClient struct {
	userID uint
	conn   *websocket.Conn
	mu     sync.Mutex
}

func (c *relayClient) Send(v any) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	_ = c.conn.SetWriteDeadline(time.Now().Add(8 * time.Second))
	return c.conn.WriteJSON(v)
}

type Session struct {
	mu sync.Mutex

	gameCode    string
	lobbyID     string
	playerOrder []uint
	clients     map[uint]*relayClient
	finished    bool
	onMatchOver func(lobbyID string, winnerUserID *uint)
}

func NewSession(gameCode, lobbyID string, playerIDs []uint, onMatchOver func(lobbyID string, winnerUserID *uint)) *Session {
	ids := append([]uint(nil), playerIDs...)
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })

	return &Session{
		gameCode:    gameCode,
		lobbyID:     lobbyID,
		playerOrder: ids,
		clients:     make(map[uint]*relayClient),
		onMatchOver: onMatchOver,
	}
}

func (s *Session) Attach(userID uint, conn *websocket.Conn) error {
	client := &relayClient{userID: userID, conn: conn}

	s.mu.Lock()
	if old := s.clients[userID]; old != nil {
		_ = old.conn.Close()
	}
	s.clients[userID] = client
	ready := len(s.clients) >= len(s.playerOrder)
	s.mu.Unlock()

	_ = client.Send(map[string]any{
		"type":      "state",
		"game":      s.gameCode,
		"lobby_id":  s.lobbyID,
		"user_id":   userID,
		"ready":     ready,
		"server_ms": time.Now().UTC().UnixMilli(),
	})

	if ready {
		s.broadcastLocked(map[string]any{
			"type":      "start",
			"game":      s.gameCode,
			"lobby_id":  s.lobbyID,
			"server_ms": time.Now().UTC().UnixMilli(),
		})
	}

	defer func() {
		s.mu.Lock()
		if s.clients[userID] == client {
			delete(s.clients, userID)
		}
		s.mu.Unlock()
		_ = conn.Close()
	}()

	conn.SetReadLimit(1 << 20)
	for {
		var msg ClientMessage
		if err := conn.ReadJSON(&msg); err != nil {
			return nil
		}
		s.handle(userID, msg)
	}
}

func (s *Session) handle(userID uint, msg ClientMessage) {
	switch msg.Type {
	case "state":
		s.mu.Lock()
		client := s.clients[userID]
		s.mu.Unlock()
		if client != nil {
			_ = client.Send(map[string]any{"type": "state", "game": s.gameCode, "lobby_id": s.lobbyID})
		}
	case "relay":
		s.mu.Lock()
		for id, cl := range s.clients {
			if id == userID {
				continue
			}
			go func(c *relayClient, from uint) {
				_ = c.Send(map[string]any{"type": "relay", "from": from, "payload": msg.Payload})
			}(cl, userID)
		}
		s.mu.Unlock()
	case "finish":
		s.finish(userID, msg.WinnerUserID)
	default:
		s.mu.Lock()
		client := s.clients[userID]
		s.mu.Unlock()
		if client != nil {
			_ = client.Send(map[string]any{"type": "error", "error": "unknown command"})
		}
	}
}

func (s *Session) finish(reporterID uint, winnerUserID *uint) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.finished {
		return
	}

	if winnerUserID != nil {
		valid := *winnerUserID == s.playerOrder[0] || *winnerUserID == s.playerOrder[1]
		if !valid {
			return
		}
	}

	s.finished = true
	s.broadcastLocked(map[string]any{
		"type":           "match_over",
		"game":           s.gameCode,
		"lobby_id":       s.lobbyID,
		"winner_user_id": winnerUserID,
		"reported_by":    reporterID,
	})

	if s.onMatchOver != nil {
		lobbyID := s.lobbyID
		winner := winnerUserID
		cb := s.onMatchOver
		go cb(lobbyID, winner)
	}
}

func (s *Session) broadcastLocked(payload map[string]any) {
	for _, client := range s.clients {
		cl := client
		go func() { _ = cl.Send(payload) }()
	}
}
