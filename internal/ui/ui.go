package ui

// State represents the current UI view state.
type State int

const (
	StateInbox State = iota
	StateReviewList
	StateDiffView
	StateIssueList
)

// String returns a human-readable name for the UI state.
func (s State) String() string {
	switch s {
	case StateInbox:
		return "inbox"
	case StateReviewList:
		return "reviews"
	case StateDiffView:
		return "diff"
	case StateIssueList:
		return "issues"
	default:
		return "unknown"
	}
}

// Model defines the basic skeleton model for Written's UI.
type Model struct {
	CurrentState State
	Width        int
	Height       int
}

// NewModel creates an initial UI model.
func NewModel() Model {
	return Model{
		CurrentState: StateInbox,
	}
}
