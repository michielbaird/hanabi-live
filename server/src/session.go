// General purpose session functions

package main

import (
	"encoding/json"
	"time"

	"github.com/Hanabi-Live/hanabi-live/logger"
	"github.com/gabstv/melody"
	"github.com/sasha-s/go-deadlock"
)

type Session struct {
	// The underlying Melody session (which represents the WebSocket connection)
	// It is swapped when a client resumes the session on a new connection, so use getMS()/setMS()
	ms      *melody.Session
	msMutex *deadlock.RWMutex

	// Resume support (see "websocket_limbo.go")
	// These fields are only accessed while holding "sessions.ConnectMutex"
	Resumable   bool   // The client opted in to resumable sessions
	ResumeToken string // Proves that a new connection is the same client as this session
	Limbo       bool   // The connection dropped; waiting for the client to come back
	limboTimer  *time.Timer

	// Static data fields
	// (these do not change, so they can safely be read without race conditions or locking)
	SessionID uint64
	UserID    int
	Username  string
	Muted     bool // Users are forcefully disconnected upon being muted, so this is static
	FakeUser  bool

	// Dynamic data fields
	// (they are updated as the user performs activities, so we need to use a mutex)
	Data      *SessionData
	DataMutex *deadlock.RWMutex
}

type SessionData struct {
	Status             int
	TableID            uint64
	Friends            map[int]struct{}
	ReverseFriends     map[int]struct{}
	Hyphenated         bool
	Inactive           bool
	RateLimitAllowance float64
	RateLimitLastCheck time.Time
	Banned             bool
}

var (
	// The counter is atomically incremented before assignment,
	// so the first session ID will be 1 and will increase from there
	sessionIDCounter uint64 = 0
)

func NewSession() *Session {
	return &Session{
		ms:      nil,
		msMutex: &deadlock.RWMutex{},

		SessionID: uint64(0),
		UserID:    0,
		Username:  "[unknown]",
		Muted:     false,
		FakeUser:  false,

		Data: &SessionData{
			Status:             StatusLobby, // By default, new users are in the lobby
			TableID:            uint64(0),   // 0 is used as a null value
			Friends:            make(map[int]struct{}),
			ReverseFriends:     make(map[int]struct{}),
			Hyphenated:         false,
			Inactive:           false,
			RateLimitAllowance: RateLimitRate,
			RateLimitLastCheck: time.Now(),
			Banned:             false,
		},
		DataMutex: &deadlock.RWMutex{},
	}
}

// NewFakeSession prepares a "fake" user session that will be used for game emulation
func NewFakeSession(id int, name string) *Session {
	s := NewSession()
	s.SessionID = uint64(id)
	s.UserID = id
	s.Username = name
	s.FakeUser = true

	return s
}

func (s *Session) getMS() *melody.Session {
	s.msMutex.RLock()
	defer s.msMutex.RUnlock()
	return s.ms
}

func (s *Session) setMS(ms *melody.Session) {
	s.msMutex.Lock()
	defer s.msMutex.Unlock()
	s.ms = ms
}

// Emit sends a message to a client using the Golem-style protocol described above
func (s *Session) Emit(command string, d interface{}) {
	if s == nil {
		return
	}
	ms := s.getMS()
	if ms == nil || ms.Request == nil {
		return
	}

	// Convert the data to JSON
	var ds string
	if dj, err := json.Marshal(d); err != nil {
		logger.Error("Failed to marshal data when writing to a WebSocket session: " + err.Error())
		return
	} else {
		ds = string(dj)
	}

	// Send the message as bytes
	msg := command + " " + ds
	bytes := []byte(msg)
	if err := ms.Write(bytes); err != nil {
		// This can routinely fail if the session is closed, so just return
		return
	}
}

func (s *Session) Warning(message string) {
	logger.Info("Warning - " + message + " - " + s.Username)

	type WarningMessage struct {
		Warning string `json:"warning"`
	}
	s.Emit("warning", &WarningMessage{
		Warning: message,
	})
}

// Sent to the client if either their command was unsuccessful or something else went wrong
func (s *Session) Error(message string) {
	logger.Info("Error - " + message + " - " + s.Username)

	type ErrorMessage struct {
		Error string `json:"error"`
	}
	s.Emit("error", &ErrorMessage{
		Error: message,
	})
}
