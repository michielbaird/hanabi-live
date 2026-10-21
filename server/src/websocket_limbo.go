// Resumable sessions
//
// A client that connects with "/ws?resumable=1" is given a resume token in the "welcome" message.
// If its connection then drops (without a normal close), the session is not torn down right away.
// Instead, it waits in "limbo" for "limboGracePeriod". During that time, the user keeps their seat
// at their tables (and their table ownership). A new connection that presents the resume token
// ("/ws?resume=<token>") takes over the session; otherwise, the usual disconnect cleanup runs when
// the grace period ends.
//
// Authentication is unchanged: the new connection must still have a valid cookie. The token only
// proves that the new connection is the same client, as opposed to the user logging in from
// somewhere else (which still takes over immediately).

package main

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"net/http"
	"time"

	"github.com/Hanabi-Live/hanabi-live/logger"
	"github.com/gabstv/melody"
)

const (
	limboGracePeriod = 60 * time.Second

	// The connection mode that is sent in the "welcome" message when a session was resumed
	connectionModeResumed = "resumed"

	// WebSocket close code for a normal closure (RFC 6455)
	closeCodeNormal = 1000
)

// websocketResumeParams reads the resume-related query parameters of a WebSocket request
func websocketResumeParams(request *http.Request) (resumable bool, token string) {
	if request == nil || request.URL == nil {
		return false, ""
	}
	query := request.URL.Query()
	token = query.Get("resume")
	resumable = query.Get("resumable") == "1" || token != ""
	return resumable, token
}

func websocketNewResumeToken() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		logger.Error("Failed to generate a resume token: " + err.Error())
		return ""
	}
	return hex.EncodeToString(b)
}

// canResume must be called while holding "sessions.ConnectMutex"
func (s *Session) canResume(token string) bool {
	return s.Resumable && s.ResumeToken != "" && token != "" &&
		subtle.ConstantTimeCompare([]byte(s.ResumeToken), []byte(token)) == 1
}

// websocketClose is fired when the client sends a close frame
func websocketClose(ms *melody.Session, code int, text string) error {
	ms.Set("closeCode", code)
	return nil
}

func websocketClosedCleanly(ms *melody.Session) bool {
	v, ok := ms.Get("closeCode")
	if !ok {
		return false
	}
	code, ok := v.(int)
	return ok && code == closeCodeNormal
}

// websocketEnterLimbo must be called while holding "sessions.ConnectMutex"
func websocketEnterLimbo(ctx context.Context, s *Session) {
	logger.Info("User \"" + s.Username + "\" lost their connection; " +
		"waiting for them to resume their session.")

	s.Limbo = true
	websocketSetPresent(ctx, s, false)
	s.limboTimer = time.AfterFunc(limboGracePeriod, func() {
		websocketLimboExpire(s)
	})
}

// websocketLeaveLimbo must be called while holding "sessions.ConnectMutex"
func websocketLeaveLimbo(s *Session) {
	s.Limbo = false
	if s.limboTimer != nil {
		s.limboTimer.Stop()
		s.limboTimer = nil
	}
}

// websocketLimboExpire runs when nobody has claimed a session in limbo in time
func websocketLimboExpire(s *Session) {
	sessions.ConnectMutex.Lock()
	defer sessions.ConnectMutex.Unlock()

	// The session might have been resumed or replaced while we were waiting for the lock
	if current, ok := sessions.Get(s.UserID); !ok || current != s || !s.Limbo {
		return
	}

	logger.Info("The session for user \"" + s.Username + "\" was not resumed in time.")
	ctx := NewSessionContext(s)
	websocketLeaveLimbo(s)
	websocketDisconnectRemoveFromMap(s)
	websocketDisconnectRemoveFromGames(ctx, s)
	notifyAllUserLeft(s)
}

// websocketResume attaches a new connection to an existing session
// It must be called while holding "sessions.ConnectMutex"
func websocketResume(ctx context.Context, s *Session, ms *melody.Session, data *WebsocketConnectData) {
	logger.Info("User \"" + s.Username + "\" resumed their session.")

	// Swap the connection before closing the old one so that the old connection's disconnect
	// handler does not recognize itself as the session's connection
	oldMS := s.getMS()
	s.setMS(ms)
	websocketLeaveLimbo(s)
	if oldMS != nil && !oldMS.IsClosed() {
		// The old connection was never detected as dead
		if err := oldMS.Close(); err != nil {
			logger.Info("Failed to close the replaced WebSocket connection.")
		}
	}

	websocketSetPresent(ctx, s, true)
	go websocketConnectMessages(ctx, s, data)
}

// websocketSetPresent marks the user as present or away at the tables that they are playing at
// without removing them from those tables
func websocketSetPresent(ctx context.Context, s *Session, present bool) {
	for _, t := range tables.GetList(true) {
		t.Lock(ctx)
		if playerIndex := t.GetPlayerIndexFromID(s.UserID); playerIndex != -1 && !t.Replay {
			p := t.Players[playerIndex]
			p.Session = s
			if p.Present != present {
				p.Present = present
				if t.Running {
					t.NotifyConnected()
				} else {
					t.NotifyPlayerChange()
				}
			}
		}
		t.Unlock(ctx)
	}
}

func websocketResumeGraceSeconds(s *Session) int {
	if !s.Resumable {
		return 0
	}
	return int(limboGracePeriod / time.Second)
}
