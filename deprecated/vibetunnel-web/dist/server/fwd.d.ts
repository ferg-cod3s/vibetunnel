#!/usr/bin/env pnpm exec tsx --no-deprecation
/**
 * VibeTunnel Forward (fwd.ts)
 *
 * A simple command-line tool that spawns a PTY session and forwards it
 * using the VibeTunnel PTY infrastructure.
 *
 * Usage:
 *   pnpm exec tsx src/fwd.ts <command> [args...]
 *   pnpm exec tsx src/fwd.ts claude --resume
 */
export declare function startVibeTunnelForward(args: string[]): Promise<void>;
