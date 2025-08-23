#!/bin/bash

# VibeTunnel Build and Start Script
# This script builds the project and starts it, with fallback to previous build

WORK_DIR="/home/f3rg/Documents/git/vibetunnel/web"
CLI_FILE="$WORK_DIR/dist/vibetunnel-cli"
BACKUP_CLI="$WORK_DIR/dist/vibetunnel-cli.backup"
LOG_FILE="/var/log/vibetunnel-build.log"

cd "$WORK_DIR"

echo "[$(date)] Starting VibeTunnel build and start process..." >> "$LOG_FILE"

# Create backup of current working version if it exists
if [ -f "$CLI_FILE" ]; then
    cp "$CLI_FILE" "$BACKUP_CLI"
    echo "[$(date)] Backed up current CLI to vibetunnel-cli.backup" >> "$LOG_FILE"
fi

# Try to build
echo "[$(date)] Starting build..." >> "$LOG_FILE"
if npm run build >> "$LOG_FILE" 2>&1; then
    echo "[$(date)] Build successful!" >> "$LOG_FILE"
    
    # Verify the built file exists and is executable
    if [ -f "$CLI_FILE" ]; then
        echo "[$(date)] Built CLI file exists, starting server..." >> "$LOG_FILE"
        exec "$CLI_FILE" --port 3000
    else
        echo "[$(date)] ERROR: Built CLI file missing!" >> "$LOG_FILE"
        exit 1
    fi
else
    echo "[$(date)] Build failed! Attempting to use backup version..." >> "$LOG_FILE"
    
    if [ -f "$BACKUP_CLI" ]; then
        echo "[$(date)] Using backup CLI file..." >> "$LOG_FILE"
        cp "$BACKUP_CLI" "$CLI_FILE"
        chmod +x "$CLI_FILE"
        exec "$CLI_FILE" --port 3000
    else
        echo "[$(date)] ERROR: No backup available and build failed!" >> "$LOG_FILE"
        exit 1
    fi
fi
