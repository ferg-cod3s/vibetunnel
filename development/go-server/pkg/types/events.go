package types

import (
	"time"
)

// ServerEventType defines the types of events that can be broadcast via SSE
type ServerEventType string

const (
	// Session lifecycle events
	EventSessionStart    ServerEventType = "session-start"
	EventSessionExit     ServerEventType = "session-exit"
	EventCommandFinished ServerEventType = "command-finished"
	EventCommandError    ServerEventType = "command-error"

	// Git events
	EventGitFollowEnabled  ServerEventType = "git-follow-enabled"
	EventGitFollowDisabled ServerEventType = "git-follow-disabled"
	EventGitBranchSwitch   ServerEventType = "git-branch-switch"
	EventGitWorktreeSync   ServerEventType = "git-worktree-sync"

	// System events
	EventBell             ServerEventType = "bell"
	EventClaudeTurn       ServerEventType = "claude-turn"
	EventConnected        ServerEventType = "connected"
	EventTestNotification ServerEventType = "test-notification"

	// Server events
	EventHeartbeat      ServerEventType = "heartbeat"
	EventServerShutdown ServerEventType = "server-shutdown"
)

// ServerEvent represents an event that can be broadcast via Server-Sent Events
// This matches the original VibeTunnel TypeScript interface for compatibility
type ServerEvent struct {
	Type        ServerEventType `json:"type"`
	SessionID   *string         `json:"sessionId,omitempty"`
	SessionName *string         `json:"sessionName,omitempty"`
	Command     *string         `json:"command,omitempty"`
	ExitCode    *int            `json:"exitCode,omitempty"`
	Duration    *int64          `json:"duration,omitempty"` // milliseconds
	ProcessInfo *string         `json:"processInfo,omitempty"`
	Message     *string         `json:"message,omitempty"`
	Timestamp   string          `json:"timestamp"` // ISO 8601 format

	// Git event specific fields
	Branch       *string `json:"branch,omitempty"`
	RepoPath     *string `json:"repoPath,omitempty"`
	WorktreePath *string `json:"worktreePath,omitempty"`

	// Test notification specific fields
	Title *string `json:"title,omitempty"`
	Body  *string `json:"body,omitempty"`
}

// GitEvent represents a Git repository event
type GitEvent struct {
	Type      string    `json:"type"`
	Branch    string    `json:"branch,omitempty"`
	RepoPath  string    `json:"repoPath"`
	Timestamp time.Time `json:"timestamp"`
}

// NewServerEvent creates a new server event with the current timestamp
func NewServerEvent(eventType ServerEventType) *ServerEvent {
	return &ServerEvent{
		Type:      eventType,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}
}

// WithSessionID adds session ID to the event
func (e *ServerEvent) WithSessionID(sessionID string) *ServerEvent {
	e.SessionID = &sessionID
	return e
}

// WithSessionName adds session name to the event
func (e *ServerEvent) WithSessionName(sessionName string) *ServerEvent {
	e.SessionName = &sessionName
	return e
}

// WithCommand adds command to the event
func (e *ServerEvent) WithCommand(command string) *ServerEvent {
	e.Command = &command
	return e
}

// WithExitCode adds exit code to the event
func (e *ServerEvent) WithExitCode(exitCode int) *ServerEvent {
	e.ExitCode = &exitCode
	return e
}

// WithDuration adds duration to the event (in milliseconds)
func (e *ServerEvent) WithDuration(duration time.Duration) *ServerEvent {
	ms := duration.Milliseconds()
	e.Duration = &ms
	return e
}

// WithMessage adds message to the event
func (e *ServerEvent) WithMessage(message string) *ServerEvent {
	e.Message = &message
	return e
}

// WithProcessInfo adds process info to the event
func (e *ServerEvent) WithProcessInfo(processInfo string) *ServerEvent {
	e.ProcessInfo = &processInfo
	return e
}

// WithTestNotification adds test notification fields
func (e *ServerEvent) WithTestNotification(title, body string) *ServerEvent {
	e.Title = &title
	e.Body = &body
	return e
}
