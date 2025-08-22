# VibeTunnel Go Server - Proposed Event-Driven Architecture

## Overview
The proposed architecture transforms VibeTunnel from a direct-coupled system to a fully event-driven architecture using an event bus pattern with optional external event streaming for horizontal scaling.

## Proposed Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENT LAYER                                      │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  Web Frontend     │  macOS App      │  CLI Tools        │  External Clients        │
│  (JavaScript)     │  (Swift)        │  (vibetunnel)     │  (curl, etc.)            │
└─────────────┬─────────────┬─────────────────┬─────────────────────┬─────────────────┘
              │             │                 │                     │
         ┌────▼─────┐  ┌────▼─────┐     ┌────▼─────┐         ┌────▼─────┐
         │WebSocket │  │WebSocket │     │HTTP API  │         │HTTP API  │
         │/ws       │  │/buffers  │     │/api/*    │         │/health   │
         └────┬─────┘  └────┬─────┘     └────┬─────┘         └────┬─────┘
              │             │                │                    │
┌─────────────▼─────────────▼────────────────▼────────────────────▼─────────────────────┐
│                              HTTP SERVER (Gorilla Mux)                               │
│                                   Port 4021                                          │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                               MIDDLEWARE STACK                                       │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │
│ │IP Whitelist │→│   CSRF      │→│Rate Limiter │→│Request Log  │→│Security Hdrs│     │
│ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘     │
│                                        │                                            │
│                               ┌────────▼────────┐                                   │
│                               │  CORS Handler   │                                   │
│                               └────────┬────────┘                                   │
├────────────────────────────────────────▼────────────────────────────────────────────┤
│                              SERVICE LAYER                                          │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Session    │    │  WebSocket   │    │    Buffer    │    │     Auth     │      │
│  │   Manager    │    │   Handler    │    │ Aggregator   │    │   Services   │      │
│  │              │    │              │    │              │    │              │      │
│  │ • Create     │    │ • Connect    │    │ • Binary     │    │ • JWT Auth   │      │
│  │ • List       │    │ • Input/Out  │    │ • Magic 0xBF │    │ • Password   │      │
│  │ • Delete     │    │ • Ping/Pong  │    │ • Subscribe  │    │ • Middleware │      │
│  │ • Resize     │    │ • Origin     │    │ • Stream     │    │ • User Ctx   │      │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    └──────────────┘      │
│         │                   │                   │                                  │
│         ▼                   ▼                   ▼                                  │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │                        TERMINAL LAYER                                       │  │
│  │ ┌──────────────┐                           ┌──────────────┐                 │  │
│  │ │   PTY        │  ◄──────────────────────► │   Process    │                 │  │
│  │ │   Manager    │                           │   Spawner    │                 │  │
│  │ │              │                           │              │                 │  │
│  │ │ • creack/pty │                           │ • /bin/bash  │                 │  │
│  │ │ • I/O Stream │                           │ • Working Dir│                 │  │
│  │ │ • Resize     │                           │ • Env Vars   │                 │  │
│  │ └──────────────┘                           └──────────────┘                 │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                             FILESYSTEM & GIT LAYER                                 │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                          │
│  │ FileSystem   │    │     Git      │    │ Git Follow   │                          │
│  │   Service    │    │   Service    │    │    Mode      │                          │
│  │              │    │              │    │              │                          │
│  │ • List/Download │  │ • Status     │    │ • Worktrees  │                          │
│  │ • Upload       │  │ • Branches   │    │ • Hooks      │                          │
│  │ • Create/Delete│  │ • Checkout   │    │ • Sync       │                          │
│  │ • Path Security│  │ • Security   │    │ • Config     │                          │
│  └──────────────┘    └──────────────┘    └──────────────┘                          │
│                                                                                     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                              🆕 EVENT BUS LAYER                                    │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│                     ┌─────────────────────────────────────────┐                     │
│                     │            EVENT BUS CORE              │                     │
│                     │                                         │                     │
│                     │  ┌─────────────┐  ┌─────────────┐      │                     │
│                     │  │  Publisher  │  │ Subscriber  │      │                     │
│                     │  │  Registry   │  │  Registry   │      │                     │
│                     │  └─────────────┘  └─────────────┘      │                     │
│                     │           │              │             │                     │
│                     │  ┌────────▼──────────────▼───────┐     │                     │
│                     │  │     Event Router & Queue      │     │                     │
│                     │  │  • Pattern Matching           │     │                     │
│                     │  │  • Priority Queues            │     │                     │
│                     │  │  • Dead Letter Handling       │     │                     │
│                     │  │  • Retry Logic                │     │                     │
│                     │  └────────────────────────────────┘     │                     │
│                     └─────────────────────────────────────────┘                     │
│                                        │                                           │
│                     ┌──────────────────▼──────────────────┐                        │
│                     │        EVENT PERSISTENCE            │                        │
│                     │                                     │                        │
│                     │ ┌─────────────┐ ┌─────────────┐     │                        │
│                     │ │   Memory    │ │   Disk      │     │                        │
│                     │ │   Buffer    │ │   Journal   │     │                        │
│                     │ │  (Fast)     │ │  (Durable)  │     │                        │
│                     │ └─────────────┘ └─────────────┘     │                        │
│                     └─────────────────────────────────────┘                        │
│                                        │                                           │
├────────────────────────────────────────▼───────────────────────────────────────────┤
│                           🆕 EVENT CONSUMER SERVICES                               │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│ │     SSE      │ │    Push      │ │   Metrics    │ │    Audit     │ │   System   │ │
│ │ Broadcaster  │ │Notifications │ │  Collector   │ │   Logger     │ │  Health    │ │
│ │              │ │              │ │              │ │              │ │  Monitor   │ │
│ │ • Real-time  │ │ • VAPID Keys │ │ • Prometheus │ │ • Security   │ │ • Resource │ │
│ │ • WebSocket  │ │ • Web Push   │ │ • Grafana    │ │ • Compliance │ │ • Alerts   │ │
│ │ • Filtering  │ │ • Retry      │ │ • Custom     │ │ • Debug      │ │ • Status   │ │
│ │ • Buffering  │ │ • Templates  │ │ • Export     │ │ • Events     │ │ • Recovery │ │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘ │
│                                                                                     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                      🆕 OPTIONAL: EXTERNAL EVENT STREAMING                         │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│              ┌─────────────────────────────────────────────────────────┐             │
│              │                NATS / NATS Streaming                    │             │
│              │                                                         │             │
│              │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │             │
│              │  │   Cluster   │  │  Subjects   │  │ Persistence │      │             │
│              │  │   Leader    │  │  Routing    │  │   Store     │      │             │
│              │  └─────────────┘  └─────────────┘  └─────────────┘      │             │
│              │                                                         │             │
│              │  vibetunnel.session.*     vibetunnel.git.*              │             │
│              │  vibetunnel.system.*      vibetunnel.notifications.*    │             │
│              └─────────────────────────────────────────────────────────┘             │
│                                        │                                           │
│              ┌────────────────────────────────────────────────────────────┐          │
│              │              MULTI-INSTANCE COORDINATION                   │          │
│              │                                                            │          │
│              │  Instance A ◄─────► NATS ◄─────► Instance B                │          │
│              │  Instance C ◄─────► NATS ◄─────► Instance D                │          │
│              │                                                            │          │
│              │  • Load Balancing        • Event Replay                    │          │
│              │  • Failover              • Distributed Sessions            │          │
│              │  • Geographic Distribution                                 │          │
│              └────────────────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## Proposed Event Flow

### 1. **Session Management Flow (Event-Driven)**
```
HTTP Request → Session Manager → PTY Creation → Process Spawn
                      ↓
               Event Bus.Publish("session.created")
                      ↓
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   SSE Broadcaster  Push Notif.  Metrics
   Real-time UI     Mobile Alert  Tracking
```

### 2. **Git Integration Flow (Event-Driven)**
```
Git Hook → CLI Command → HTTP API → Git Service → Follow Mode
                                          ↓
                               Event Bus.Publish("git.branch-switch")
                                          ↓
                      ┌──────────────────┼──────────────────┐
                      ▼                  ▼                  ▼
               SSE Broadcaster    Push Notification    Audit Logger
               Live Git Status    Developer Alert     Compliance Log
```

### 3. **Multi-Consumer Event Processing**
```
Single Event → Event Bus → Multiple Subscribers (Parallel Processing)
                   ↓
             ┌─────┼─────┼─────┼─────┐
             ▼     ▼     ▼     ▼     ▼
           SSE   Push  Metrics Audit Health
```

## Event Schema Design

### Core Event Structure
```go
type VibeTunnelEvent struct {
    ID        string                 `json:"id"`        // UUID for deduplication
    Type      EventType              `json:"type"`      // Enum for type safety
    Timestamp time.Time             `json:"timestamp"` // RFC3339 format
    Source    string                 `json:"source"`    // Component that generated event
    SessionID *string               `json:"sessionId,omitempty"`
    UserID    *string               `json:"userId,omitempty"`
    Severity  EventSeverity         `json:"severity"`  // INFO, WARN, ERROR, CRITICAL
    Data      map[string]interface{} `json:"data"`      // Event-specific payload
    Metadata  EventMetadata         `json:"metadata"`  // Routing and processing hints
}

type EventType string
const (
    // Session Events
    EventSessionCreated     EventType = "session.created"
    EventSessionClosed      EventType = "session.closed"
    EventSessionResized     EventType = "session.resized"
    EventSessionIdle        EventType = "session.idle"
    EventSessionActive      EventType = "session.active"
    
    // Git Events
    EventGitFollowEnabled   EventType = "git.follow-enabled"
    EventGitFollowDisabled  EventType = "git.follow-disabled"
    EventGitBranchSwitch    EventType = "git.branch-switch"
    EventGitCommit          EventType = "git.commit"
    EventGitWorktreeSync    EventType = "git.worktree-sync"
    
    // System Events
    EventSystemStartup      EventType = "system.startup"
    EventSystemShutdown     EventType = "system.shutdown"
    EventSystemHealthCheck  EventType = "system.health-check"
    EventSystemAlert        EventType = "system.alert"
    
    // Notification Events
    EventNotificationQueued EventType = "notification.queued"
    EventNotificationSent   EventType = "notification.sent"
    EventNotificationFailed EventType = "notification.failed"
)

type EventSeverity string
const (
    SeverityInfo     EventSeverity = "info"
    SeverityWarn     EventSeverity = "warn"
    SeverityError    EventSeverity = "error"
    SeverityCritical EventSeverity = "critical"
)

type EventMetadata struct {
    CorrelationID string   `json:"correlationId,omitempty"` // Group related events
    RetryCount    int      `json:"retryCount,omitempty"`    // For failed processing
    TTL           *int64   `json:"ttl,omitempty"`           // Time to live in seconds
    Priority      int      `json:"priority,omitempty"`      // Processing priority
    Tags          []string `json:"tags,omitempty"`          // For filtering/routing
}
```

### Event Subjects/Patterns
```go
// NATS subject patterns for external streaming
const (
    SubjectSession      = "vibetunnel.session.*"
    SubjectGit          = "vibetunnel.git.*"  
    SubjectSystem       = "vibetunnel.system.*"
    SubjectNotification = "vibetunnel.notification.*"
    
    // Specific subjects
    SubjectSessionCreated    = "vibetunnel.session.created"
    SubjectGitBranchSwitch   = "vibetunnel.git.branch-switch"
    SubjectSystemHealth      = "vibetunnel.system.health-check"
)
```

## Implementation Phases

### Phase 1: Internal Event Bus (Foundation)
```go
type EventBus interface {
    Publish(ctx context.Context, event *VibeTunnelEvent) error
    Subscribe(pattern string, handler EventHandler) (Subscription, error)
    Start() error
    Stop() error
    Metrics() EventMetrics
}

type EventHandler func(ctx context.Context, event *VibeTunnelEvent) error

type Subscription interface {
    Unsubscribe() error
    Pattern() string
    IsActive() bool
}
```

**Implementation:**
- In-memory pub/sub with goroutine pools
- Pattern-based subscription (glob patterns)
- Error handling and dead letter queues
- Metrics collection (published, processed, failed)
- Graceful shutdown with event draining

### Phase 2: Event Consumer Services
```go
// SSE Consumer
type SSEConsumer struct {
    eventBus EventBus
    clients  map[string]*SSEClient
}

func (s *SSEConsumer) Start() error {
    return s.eventBus.Subscribe("vibetunnel.*", s.handleEvent)
}

// Push Notification Consumer  
type PushConsumer struct {
    eventBus    EventBus
    vapidKeys   VAPIDKeys
    subscribers map[string]*PushSubscription
}

// Metrics Consumer
type MetricsConsumer struct {
    eventBus EventBus
    registry prometheus.Registry
}
```

### Phase 3: Event Persistence & Replay
- Event journal for durability
- Event replay for debugging
- Event snapshots for performance
- Compaction for storage efficiency

### Phase 4: External Event Streaming (NATS)
- NATS integration for multi-instance coordination
- Subject-based routing for event types
- Cluster management and failover
- Geographic distribution support

## Architecture Benefits

### 1. **Decoupling & Modularity**
- Services don't directly reference each other
- Easy to add/remove consumers
- Independent scaling of components
- Simplified testing with event mocking

### 2. **Scalability & Performance**
- Async event processing prevents blocking
- Consumer services can run in parallel
- Horizontal scaling with external streaming
- Efficient resource utilization

### 3. **Reliability & Durability**
- Event persistence prevents data loss
- Dead letter queues for failed processing
- Retry logic with exponential backoff
- Event replay for debugging/recovery

### 4. **Observability & Monitoring**
- All system interactions are events
- Rich metrics and monitoring capabilities
- Audit trails for compliance
- Debugging with event replay

### 5. **Extensibility**
- Easy to add new event consumers
- Plugin architecture for custom handlers
- External service integration via events
- API webhook notifications

## Migration Strategy

### Phase 1: Parallel Implementation
- Keep existing direct coupling
- Add event bus alongside current system  
- Dual-publish events (direct + event bus)
- Gradual consumer migration

### Phase 2: Consumer Migration
- Migrate SSE broadcaster to event consumer
- Add push notification consumer
- Add metrics consumer
- Add audit logging consumer

### Phase 3: Publisher Migration  
- Migrate services to publish-only mode
- Remove direct EventBroadcaster references
- Clean up coupling between services
- Performance testing and optimization

### Phase 4: External Streaming (Optional)
- Add NATS integration
- Multi-instance coordination
- Geographic distribution
- Advanced clustering features

## Configuration Example

```yaml
# vibetunnel.yaml
eventBus:
  type: "memory"  # memory, nats
  bufferSize: 1000
  workers: 10
  persistence:
    enabled: true
    journalPath: "/var/lib/vibetunnel/events"
    retention: "7d"
  
consumers:
  sse:
    enabled: true
    patterns: ["vibetunnel.*"]
    buffer: 100
    
  push:
    enabled: true  
    patterns: ["vibetunnel.session.*", "vibetunnel.git.*"]
    vapidKeys: "/etc/vibetunnel/vapid"
    
  metrics:
    enabled: true
    patterns: ["vibetunnel.*"]
    prometheus: true
    
  audit:
    enabled: true
    patterns: ["vibetunnel.system.*", "vibetunnel.auth.*"]
    logPath: "/var/log/vibetunnel/audit.log"

# NATS configuration (Phase 4)
nats:
  enabled: false
  urls: ["nats://localhost:4222"]
  cluster: "vibetunnel"
  subjects:
    prefix: "vibetunnel"
    mapping:
      "session.*": "vibetunnel.session.>"
      "git.*": "vibetunnel.git.>"
```

This event-driven architecture provides a solid foundation for scaling VibeTunnel while maintaining clean separation of concerns and enabling powerful new features like distributed push notifications and comprehensive monitoring.