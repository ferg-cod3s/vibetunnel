# Multi-stage Docker build for VibeTunnel Go Server
# Stage 1: Build stage
FROM golang:1.21-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git make

# Set working directory
WORKDIR /app

# Copy go mod files first for better caching
COPY go.mod go.sum ./
RUN go mod download

# Verify dependencies
RUN go mod verify

# Copy source code
COPY . .

# Build the CLI binary
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags='-w -s -extldflags "-static"' \
    -a -installsuffix cgo \
    -o /bin/vibetunnel \
    cmd/vibetunnel/main.go

# Build the server binary (for development use)
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags='-w -s -extldflags "-static"' \
    -a -installsuffix cgo \
    -o /bin/vibetunnel-server \
    cmd/server/main.go

# Stage 2: Runtime stage
FROM alpine:3.19

# Install runtime dependencies
RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    bash \
    curl \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1000 vibetunnel \
    && adduser -D -s /bin/bash -u 1000 -G vibetunnel vibetunnel

# Create necessary directories
RUN mkdir -p /app/data /app/logs \
    && chown -R vibetunnel:vibetunnel /app

# Copy binaries from builder stage
COPY --from=builder /bin/vibetunnel /usr/local/bin/vibetunnel
COPY --from=builder /bin/vibetunnel-server /usr/local/bin/vibetunnel-server

# Copy any additional assets if needed
# COPY --from=builder /app/assets /app/assets

# Set working directory
WORKDIR /app

# Switch to non-root user
USER vibetunnel

# Environment variables with sensible defaults
ENV PORT=4021
ENV HOST=0.0.0.0
ENV ENABLE_RATE_LIMIT=true
ENV RATE_LIMIT_PER_MIN=100
ENV ENABLE_REQUEST_LOG=true
ENV FILESYSTEM_BASE_PATH=/app/data
ENV GIT_BASE_PATH=/app/data

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Expose port
EXPOSE ${PORT}

# Default command (can be overridden)
CMD ["vibetunnel"]

# Labels for metadata
LABEL org.opencontainers.image.title="VibeTunnel Go Server"
LABEL org.opencontainers.image.description="High-performance terminal sharing server built with Go"
LABEL org.opencontainers.image.vendor="VibeTunnel"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.source="https://github.com/amantus-ai/vibetunnel"
LABEL org.opencontainers.image.documentation="https://vibetunnel.sh"