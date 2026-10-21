package main

import (
	"net/http"
	"testing"

	"github.com/gabstv/melody"
)

func TestWebsocketResumeParams(t *testing.T) {
	for _, tt := range []struct {
		url           string
		wantResumable bool
		wantToken     string
	}{
		{"/ws", false, ""},
		{"/ws?reconnect=1", false, ""},
		{"/ws?resumable=1", true, ""},
		{"/ws?resumable=0", false, ""},
		{"/ws?resume=abc", true, "abc"},
		{"/ws?resumable=1&resume=abc", true, "abc"},
	} {
		t.Run(tt.url, func(t *testing.T) {
			req, err := http.NewRequest(http.MethodGet, tt.url, nil)
			if err != nil {
				t.Fatal(err)
			}
			resumable, token := websocketResumeParams(req)
			if resumable != tt.wantResumable || token != tt.wantToken {
				t.Errorf("websocketResumeParams(%q) = (%v, %q), want (%v, %q)",
					tt.url, resumable, token, tt.wantResumable, tt.wantToken)
			}
		})
	}
	if resumable, token := websocketResumeParams(nil); resumable || token != "" {
		t.Errorf("nil request must not be resumable, got (%v, %q)", resumable, token)
	}
}

func TestSessionCanResume(t *testing.T) {
	s := NewSession()
	if s.canResume("") || s.canResume("abc") {
		t.Error("a session that is not resumable must not accept a token")
	}

	s.Resumable = true
	s.ResumeToken = websocketNewResumeToken()
	if s.ResumeToken == "" {
		t.Fatal("expected a resume token")
	}
	if !s.canResume(s.ResumeToken) {
		t.Error("the session's own token must be accepted")
	}
	if s.canResume("") || s.canResume(s.ResumeToken+"x") || s.canResume("abc") {
		t.Error("an empty or wrong token must be rejected")
	}
}

func TestSessionSwapMelodySession(t *testing.T) {
	s := NewSession()
	a, b := &melody.Session{}, &melody.Session{}
	s.setMS(a)
	if s.getMS() != a {
		t.Error("expected the first connection")
	}
	s.setMS(b)
	if s.getMS() != b {
		t.Error("expected the second connection after a resume")
	}
}
