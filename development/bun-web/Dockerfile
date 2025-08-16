# Multi-stage build for VibeTunnel Bun Web Server
# Production-optimized with security and performance focus

# Build stage
FROM oven/bun:1.0-alpine AS builder

# Build arguments for configuration
ARG SENTRY_DSN=""
ARG BUILD_VERSION="1.0.0"
ARG BUILD_ENV="development"

# Security: Install security updates
RUN apk --no-cache update && \
    apk --no-cache upgrade && \
    apk --no-cache add curl git

WORKDIR /build

# Copy package files for dependency caching
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy source code
COPY . .

# Build the application (if build step is needed)
RUN bun run build || echo "No build step required"

# Production stage
FROM oven/bun:1.0-alpine AS production

# Build arguments available in production stage
ARG SENTRY_DSN=""
ARG BUILD_VERSION="1.0.0"
ARG BUILD_ENV="development"

# Security: Install updates and required packages
RUN apk --no-cache update && \
    apk --no-cache upgrade && \
    apk --no-cache add \
        ca-certificates \
        tzdata \
        curl \
        bash && \
    rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S bunweb && \
    adduser -u 1001 -S bunweb -G bunweb -h /app

# Set timezone
ENV TZ=UTC

# Create necessary directories
RUN mkdir -p /app/logs /app/public /app/config && \
    chown -R bunweb:bunweb /app

# Switch to non-root user
USER bunweb

WORKDIR /app

# Copy dependencies and source from builder
COPY --from=builder --chown=bunweb:bunweb /build/node_modules ./node_modules
COPY --from=builder --chown=bunweb:bunweb /build/package.json ./
COPY --from=builder --chown=bunweb:bunweb /build/src ./src
COPY --from=builder --chown=bunweb:bunweb /build/public ./public

# Environment variables with defaults
ENV PORT=3000
ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV GO_SERVER_URL=http://vibetunnel-go-server:4021

# Monitoring environment variables (configurable at build time)
ENV SENTRY_DSN=${SENTRY_DSN}
ENV SENTRY_ENVIRONMENT=${BUILD_ENV}
ENV SENTRY_RELEASE=${BUILD_VERSION}
ENV OTEL_SERVICE_NAME=vibetunnel-bun-web
ENV OTEL_SERVICE_VERSION=${BUILD_VERSION}
ENV OTEL_RESOURCE_ATTRIBUTES=service.name=vibetunnel-bun-web,service.version=${BUILD_VERSION}

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Add labels for monitoring and management
LABEL maintainer="VibeTunnel Team"
LABEL version="1.0.0"
LABEL description="VibeTunnel Bun Web Server - Frontend proxy and static file server"
LABEL monitoring.metrics.port="3000"
LABEL monitoring.health.endpoint="/health"
LABEL monitoring.service.name="vibetunnel-bun-web"
LABEL security.non-root="true"
LABEL build.architecture="amd64"

# Volume for static files and logs
VOLUME ["/app/public", "/app/logs"]

# Start the server
CMD ["bun", "run", "start"]