package ui

import "testing"

func TestNewModel(t *testing.T) {
	m := NewModel()
	if m.CurrentState != StateInbox {
		t.Errorf("expected initial state to be inbox, got %v", m.CurrentState)
	}

	if m.CurrentState.String() != "inbox" {
		t.Errorf("expected state string to be 'inbox', got %q", m.CurrentState.String())
	}
}
