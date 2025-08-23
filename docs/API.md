# TunnelForge API Documentation

## Overview

TunnelForge provides a RESTful API for managing terminal sessions and a WebSocket API for real-time terminal I/O. All APIs are served from the base URL (default: `http://localhost:4020`).

## Authentication

### Authentication Methods

The API supports multiple authentication methods configured at server startup:

1. **No Authentication** (`--no-auth`)
2. **System Authentication** (default) - Uses OS user accounts
3. **Environment Variables** - `TUNNELFORGE_USERNAME` and `TUNNELFORGE_PASSWORD`
4. **SSH Keys** (`--enable-ssh-keys`)
5. **Local Bypass** (`--allow-local-bypass`)

### Authentication Headers

For authenticated endpoints, include credentials:

```http
Authorization: Basic <base64(username:password)>
```

Or for token-based auth:

```http
X-Auth-Token: <token>
```

## REST API Endpoints

### Sessions

#### Create Session
Creates a new terminal session.

**Endpoint**: `POST /api/sessions`

**Request Body**:
```json
{
  "title": "My Session",
  "command": "/bin/bash",
  "args": ["-l"],
  "cwd": "/home/user/projects",
  "env": {
    "CUSTOM_VAR": "value"
  },
  "cols": 80,
  "rows": 24
}
```

**Response**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "My Session",
  "created": "2025-01-23T10:30:00Z",
  "status": "running",
  "pid": 12345
}
```

#### List Sessions
Get all active sessions.

**Endpoint**: `GET /api/sessions`

**Response**:
```json
{
  "sessions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "My Session",
      "command": "/bin/bash",
      "created": "2025-01-23T10:30:00Z",
      "status": "running",
      "pid": 12345,
      "lastActivity": "2025-01-23T10:35:00Z"
    }
  ]
}
```

#### Get Session
Get details of a specific session.

**Endpoint**: `GET /api/sessions/:id`

**Response**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "My Session",
  "command": "/bin/bash",
  "args": ["-l"],
  "cwd": "/home/user/projects",
  "created": "2025-01-23T10:30:00Z",
  "status": "running",
  "pid": 12345,
  "cols": 80,
  "rows": 24,
  "lastActivity": "2025-01-23T10:35:00Z",
  "bytesWritten": 4096,
  "bytesRead": 128
}
```

#### Update Session
Update session properties (title, size).

**Endpoint**: `PATCH /api/sessions/:id`

**Request Body**:
```json
{
  "title": "Updated Title",
  "cols": 120,
  "rows": 40
}
```

#### Delete Session
Terminate a session.

**Endpoint**: `DELETE /api/sessions/:id`

**Response**:
```json
{
  "message": "Session terminated",
  "id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Session I/O

#### Send Input
Send input to a session (alternative to WebSocket).

**Endpoint**: `POST /api/sessions/:id/input`

**Request Body**:
```json
{
  "data": "ls -la\n"
}
```

#### Resize Session
Change terminal dimensions.

**Endpoint**: `POST /api/sessions/:id/resize`

**Request Body**:
```json
{
  "cols": 120,
  "rows": 40
}
```

#### Get Output (SSE)
Stream session output via Server-Sent Events.

**Endpoint**: `GET /api/sessions/:id/stream`

**Response**: Server-Sent Events stream
```
data: {"type":"output","data":"Hello from terminal\r\n"}

data: {"type":"output","data":"$ "}

data: {"type":"exit","code":0}
```

### System

#### Health Check
Check server health status.

**Endpoint**: `GET /health`

**Response**:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 3600,
  "sessions": 5
}
```

#### Server Info
Get server information and capabilities.

**Endpoint**: `GET /api/info`

**Response**:
```json
{
  "version": "1.0.0",
  "platform": "darwin",
  "arch": "arm64",
  "features": {
    "authentication": true,
    "ssh_keys": false,
    "ngrok": true,
    "tailscale": false
  },
  "limits": {
    "max_sessions": 100,
    "max_buffer_size": 1048576
  }
}
```

## WebSocket API

### Connection
Connect to the WebSocket endpoint for real-time terminal I/O.

**Endpoint**: `ws://localhost:4020/ws?sessionId=<session-id>`

**Query Parameters**:
- `sessionId` (required): UUID of the session to connect to
- `token` (optional): Authentication token if required

### Message Protocol

#### Client to Server Messages

**Input Message**:
```json
{
  "type": "input",
  "data": "ls -la\n"
}
```

**Resize Message**:
```json
{
  "type": "resize",
  "cols": 120,
  "rows": 40
}
```

**Ping Message**:
```json
{
  "type": "ping"
}
```

#### Server to Client Messages

**Output Message**:
```json
{
  "type": "output",
  "data": "terminal output here\r\n"
}
```

**Status Message**:
```json
{
  "type": "status",
  "status": "connected",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Error Message**:
```json
{
  "type": "error",
  "message": "Session not found",
  "code": "SESSION_NOT_FOUND"
}
```

**Exit Message**:
```json
{
  "type": "exit",
  "code": 0,
  "signal": null
}
```

**Pong Message**:
```json
{
  "type": "pong"
}
```

### Binary Protocol

For efficient terminal rendering, TunnelForge also supports a binary WebSocket protocol:

**Endpoint**: `ws://localhost:4020/buffers`

**Binary Frame Structure**:
```
[1 byte: opcode][4 bytes: session_id_length][n bytes: session_id][remaining: data]

Opcodes:
- 0x01: Terminal output
- 0x02: Terminal input
- 0x03: Resize
- 0x04: Control message
```

## Error Handling

### HTTP Status Codes

- `200 OK`: Successful request
- `201 Created`: Resource created (new session)
- `400 Bad Request`: Invalid request parameters
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Access denied
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource conflict (e.g., session already exists)
- `500 Internal Server Error`: Server error
- `503 Service Unavailable`: Server overloaded

### Error Response Format

```json
{
  "error": {
    "code": "INVALID_PARAMETERS",
    "message": "Invalid session parameters",
    "details": {
      "field": "cols",
      "issue": "Must be between 1 and 500"
    }
  }
}
```

## Rate Limiting

The API implements rate limiting to prevent abuse:

- **Default**: 100 requests per minute per IP
- **WebSocket**: 1000 messages per minute per connection
- **Session Creation**: 10 new sessions per minute per IP

Rate limit headers:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1706012400
```

## CORS

Cross-Origin Resource Sharing (CORS) is configurable:

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Max-Age: 86400
```

## Client SDKs

### JavaScript/TypeScript

```typescript
import { TunnelForgeClient } from '@tunnelforge/client';

const client = new TunnelForgeClient({
  baseUrl: 'http://localhost:4020',
  auth: {
    username: 'user',
    password: 'pass'
  }
});

// Create session
const session = await client.createSession({
  title: 'My Session',
  command: '/bin/bash'
});

// Connect WebSocket
const ws = client.connectWebSocket(session.id);

ws.on('output', (data) => {
  console.log('Terminal output:', data);
});

ws.send({ type: 'input', data: 'ls\n' });
```

### Go

```go
import "github.com/tunnelforge/client-go"

client := tunnelforge.NewClient("http://localhost:4020")
client.SetAuth("user", "pass")

session, err := client.CreateSession(&tunnelforge.SessionOptions{
    Title:   "My Session",
    Command: "/bin/bash",
})

ws, err := client.ConnectWebSocket(session.ID)
defer ws.Close()

// Send input
ws.SendInput("ls\n")

// Read output
for {
    msg, err := ws.ReadMessage()
    if err != nil {
        break
    }
    fmt.Printf("Output: %s\n", msg.Data)
}
```

### Python

```python
from tunnelforge import TunnelForgeClient

client = TunnelForgeClient(
    base_url="http://localhost:4020",
    username="user",
    password="pass"
)

# Create session
session = client.create_session(
    title="My Session",
    command="/bin/bash"
)

# Connect WebSocket
async with client.connect_websocket(session.id) as ws:
    await ws.send_input("ls\n")
    
    async for message in ws:
        if message.type == "output":
            print(f"Output: {message.data}")
```

## Examples

### Create and Interact with Session

```bash
# Create session
curl -X POST http://localhost:4020/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Session","command":"/bin/bash"}'

# Response: {"id":"550e8400-e29b-41d4-a716-446655440000",...}

# Connect via WebSocket (using wscat)
wscat -c "ws://localhost:4020/ws?sessionId=550e8400-e29b-41d4-a716-446655440000"

# Send input
> {"type":"input","data":"echo hello\n"}

# Receive output
< {"type":"output","data":"hello\r\n"}
```

### Monitor Sessions

```bash
# List all sessions
curl http://localhost:4020/api/sessions

# Get specific session
curl http://localhost:4020/api/sessions/550e8400-e29b-41d4-a716-446655440000

# Stream output via SSE
curl -N http://localhost:4020/api/sessions/550e8400-e29b-41d4-a716-446655440000/stream
```

### Authentication Examples

```bash
# Basic auth
curl -u username:password http://localhost:4020/api/sessions

# Token auth
curl -H "X-Auth-Token: mytoken" http://localhost:4020/api/sessions

# SSH key auth (Ed25519)
curl --key ~/.ssh/id_ed25519 http://localhost:4020/api/sessions
```

## Best Practices

1. **Session Management**
   - Always clean up sessions when done
   - Implement heartbeat/ping to detect disconnections
   - Handle reconnection gracefully

2. **WebSocket Usage**
   - Use binary protocol for high-throughput scenarios
   - Implement exponential backoff for reconnections
   - Send periodic pings to keep connection alive

3. **Security**
   - Always use authentication in production
   - Implement rate limiting
   - Use HTTPS/WSS for remote connections
   - Validate and sanitize all inputs

4. **Performance**
   - Reuse WebSocket connections
   - Implement client-side buffering
   - Use compression for large outputs

## Changelog

### v1.0.0 (2025-01-23)
- Initial API release
- REST endpoints for session management
- WebSocket protocol for real-time I/O
- Multiple authentication methods
- Rate limiting and CORS support
