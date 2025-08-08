# VibeTunnel Go Server - AI Agent Guide

## 🎯 Project Overview

**Project**: High-performance Go rewrite of VibeTunnel terminal multiplexer server  
**Goal**: Replace Node.js server with better performance, concurrency, and resource usage  
**Status**: Core functionality complete (Phase 1-4) with 22 passing tests  
**Architecture**: Clean Go architecture with comprehensive test coverage  

---

## 🏗️ Project Structure

```
go-server/
├── cmd/server/           # Main application entry point
├── internal/
│   ├── config/          # Configuration management
│   ├── server/          # HTTP server and REST API handlers
│   ├── session/         # Session management layer
│   ├── terminal/        # PTY terminal management
│   └── websocket/       # WebSocket handlers for real-time communication
├── pkg/types/           # Shared type definitions
├── go.mod              # Go module definition
├── TODO.md             # Comprehensive development roadmap
└── README.md           # Project documentation
```

---

## 🧠 Context for AI Agents

### What This Project Does
- **Terminal Multiplexer**: Manages multiple terminal sessions via web interface
- **WebSocket Streaming**: Real-time bidirectional terminal I/O
- **Session Management**: Create, list, retrieve, delete terminal sessions
- **PTY Integration**: Uses creack/pty for authentic terminal behavior
- **REST API**: JSON API compatible with existing VibeTunnel frontend

### Key Technologies
- **Language**: Go 1.21+
- **WebSockets**: `github.com/gorilla/websocket`
- **HTTP Router**: `github.com/gorilla/mux`
- **PTY**: `github.com/creack/pty`
- **CORS**: `github.com/rs/cors`
- **Testing**: Go's built-in testing + `github.com/stretchr/testify`

### Current Capabilities ✅
- Create and manage terminal sessions
- Stream terminal I/O via WebSocket
- Handle terminal resizing
- REST API endpoints for session CRUD operations
- Client connection management with cleanup
- Comprehensive test coverage (22 tests)

### Recently Completed ✅
- **Phase 5**: Authentication and security (JWT, CSRF, rate limiting)
- **Phase 6**: File system operations (secure file browser API)
- Comprehensive security testing and validation

### Next Priorities (See TODO.md)
- **Phase 7**: Git integration with security controls
- Push notifications and monitoring  
- Advanced multiplexer features

---

## 🎯 AI Agent Instructions

### When Working on This Project:

1. **🔒 SECURITY FIRST - MANDATORY PRINCIPLES**
   - **Input Validation**: ALWAYS validate and sanitize ALL user inputs
   - **Command Injection Prevention**: Never execute user input directly as commands
   - **Path Traversal Protection**: Validate file paths to prevent directory traversal
   - **Authentication**: Verify user permissions before any operation
   - **Error Handling**: Never expose sensitive information in error messages
   - **Logging**: Log security events but never log sensitive data

2. **Test-Driven Development (TDD) - MANDATORY**
   - **ALWAYS write tests BEFORE implementation**
   - Write failing tests first, then implement to make them pass
   - Cover security test cases: injection attacks, invalid inputs, edge cases
   - Test both success paths AND failure/attack scenarios
   - Maintain >95% test coverage including security edge cases

3. **Follow Existing Patterns**
   - Look at existing code structure in `internal/` packages
   - Follow the established error handling patterns
   - Use structured logging with consistent format
   - Follow security patterns from filesystem module

4. **Security-Aware Architecture**
   - Keep business logic in `internal/` packages
   - Use dependency injection for testability
   - Separate concerns (HTTP handlers, business logic, data access)
   - Use interfaces for external dependencies
   - Apply principle of least privilege
   - Validate at every boundary (input, output, internal calls)

5. **Code Style & Security**
   - Follow Go conventions and idioms
   - Use meaningful variable names
   - Document exported functions and types with security considerations
   - Keep functions focused, testable, and secure by design

### Current Port Configuration
- **Go Server**: Port 4021 (Node.js runs on 4020)
- **WebSocket**: `/ws?sessionId={sessionId}`
- **Health Check**: `/health`
- **REST API**: `/api/*`

### Testing Commands
```bash
# Run all tests
go test ./... -v

# Run specific package tests
go test ./internal/server -v
go test ./internal/websocket -v
go test ./internal/terminal -v

# Run tests with coverage
go test ./... -cover
```

### Development Commands
```bash
# Build the server
go build ./cmd/server

# Run the server
go run ./cmd/server

# Format code
go fmt ./...

# Vet code for issues
go vet ./...
```

---

## 🔧 Key Components Guide

### 1. Session Manager (`internal/session/manager.go`)
**Purpose**: Central session management  
**Key Methods**:
- `Create(*types.SessionCreateRequest) (*types.Session, error)`
- `Get(sessionID string) *types.Session`
- `List() []*types.Session`
- `Close(sessionID string) error`

### 2. PTY Manager (`internal/terminal/pty.go`)
**Purpose**: Terminal process management  
**Key Features**:
- Creates PTY sessions with authentic terminal behavior
- Handles terminal I/O and resizing
- Manages process lifecycle
- Thread-safe operations

### 3. WebSocket Handler (`internal/websocket/handler.go`)
**Purpose**: Real-time terminal communication  
**Key Features**:
- Client connection management
- Message parsing (input, resize, ping)
- Terminal data streaming
- Connection cleanup and error handling

### 4. HTTP Server (`internal/server/server.go`)
**Purpose**: REST API and HTTP routing  
**Key Endpoints**:
- `GET /health` - Server health check
- `GET /api/sessions` - List sessions
- `POST /api/sessions` - Create session
- `GET /api/sessions/{id}` - Get session details
- `DELETE /api/sessions/{id}` - Delete session

---

## 🧪 Testing Patterns

### Security Test Pattern (MANDATORY)
```go
func TestGitService_CommandInjectionPrevention(t *testing.T) {
    gitService := NewGitService("/safe/base/path")
    
    // Test malicious input attempts
    maliciousInputs := []string{
        "; rm -rf /",
        "master && rm important.txt",
        "branch`evil_command`",
        "../../../etc/passwd",
        "'; DROP TABLE users; --",
    }
    
    for _, input := range maliciousInputs {
        t.Run("blocks_injection_"+input, func(t *testing.T) {
            err := gitService.Checkout(input)
            
            // Should always fail with validation error
            require.Error(t, err)
            assert.Contains(t, err.Error(), "invalid")
        })
    }
}
```

### Unit Test Example  
```go
func TestSessionManager_Create(t *testing.T) {
    manager := NewManager()
    
    req := &types.SessionCreateRequest{
        Command: "echo hello",
        Title:   "Test Session",
    }
    
    session, err := manager.Create(req)
    
    require.NoError(t, err)
    assert.NotEmpty(t, session.ID)
    assert.Equal(t, "Test Session", session.Title)
}
```

### Integration Test Pattern
```go
func TestWebSocketHandler_ValidConnection(t *testing.T) {
    // Setup
    sessionManager := session.NewManager()
    handler := NewHandler(sessionManager)
    
    // Create session
    session, err := sessionManager.Create(&types.SessionCreateRequest{
        Command: "echo test",
    })
    require.NoError(t, err)
    
    // Test WebSocket connection
    server := httptest.NewServer(http.HandlerFunc(handler.HandleWebSocket))
    defer server.Close()
    
    wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "?sessionId=" + session.ID
    conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
    require.NoError(t, err)
    defer conn.Close()
    
    // Assertions
    assert.NotNil(t, conn)
}
```

### Security Validation Pattern
```go
func TestInputValidation_RejectsInvalidPaths(t *testing.T) {
    service := NewSecureService()
    
    tests := []struct {
        name        string
        input       string
        expectError bool
        errorMsg    string
    }{
        {
            name:        "directory_traversal",
            input:       "../../etc/passwd",
            expectError: true,
            errorMsg:    "path traversal",
        },
        {
            name:        "valid_path",
            input:       "safe/file.txt",
            expectError: false,
        },
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            err := service.ValidatePath(tt.input)
            
            if tt.expectError {
                require.Error(t, err)
                assert.Contains(t, err.Error(), tt.errorMsg)
            } else {
                require.NoError(t, err)
            }
        })
    }
}
```

---

## 🚨 Common Issues & Solutions

### Issue: Tests Failing Due to Race Conditions
**Solution**: Use proper synchronization, add delays for async operations
```go
// Wait for async cleanup
time.Sleep(100 * time.Millisecond)
```

### Issue: WebSocket Connection Cleanup
**Solution**: Ensure all goroutines properly signal completion via Done channel
```go
defer func() {
    select {
    case <-client.Done:
        // Already closed
    default:
        close(client.Done)
    }
}()
```

### Issue: PTY Session Leaks
**Solution**: Always close PTY sessions in cleanup
```go
defer func() {
    if err := ptySession.Close(); err != nil {
        log.Printf("Error closing PTY session: %v", err)
    }
}()
```

---

## 📚 Useful Resources

### Go Specific
- [Effective Go](https://golang.org/doc/effective_go.html)
- [Go Code Review Comments](https://github.com/golang/go/wiki/CodeReviewComments)
- [Go Testing Documentation](https://golang.org/pkg/testing/)

### Libraries Used
- [Gorilla WebSocket](https://github.com/gorilla/websocket)
- [Gorilla Mux](https://github.com/gorilla/mux)
- [creack/pty](https://github.com/creack/pty)
- [Testify](https://github.com/stretchr/testify)

### VibeTunnel Specific
- Original Node.js server at `/home/f3rg/Documents/git/vibetunnel/web/src/server/`
- Frontend compatibility requirements
- API format and response structures

---

## 🎯 Next Development Priorities

1. **Phase 5**: Authentication & Security (JWT, SSH keys, CSRF)
2. **Performance Testing**: Load testing with concurrent connections
3. **Documentation**: API specification and deployment guides
4. **CI/CD Pipeline**: Automated testing and deployment

---

## 💡 Tips for AI Agents

- **Always run tests** after making changes: `go test ./... -v`
- **Check existing patterns** before implementing new features
- **Use TODO.md** for understanding project roadmap and priorities
- **Maintain API compatibility** with existing frontend
- **Focus on performance** - this is a key advantage over Node.js version
- **Test error cases** - robust error handling is critical for server software

---

**Last Updated**: 2025-01-06  
**Version**: Phase 4 Complete  
**Test Status**: 22/22 tests passing ✅
