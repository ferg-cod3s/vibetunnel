"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessTreeAnalyzer = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)('process-tree-analyzer');
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class ProcessTreeAnalyzer {
    /**
     * Get the complete process tree for a given root process
     */
    async getProcessTree(rootPid) {
        try {
            if (process.platform === 'win32') {
                return await this.getWindowsProcessTree(rootPid);
            }
            else {
                return await this.getUnixProcessTree(rootPid);
            }
        }
        catch (_error) {
            logger.warn('ProcessTreeAnalyzer', `Failed to get process tree for PID ${rootPid}:`, _error);
            return [];
        }
    }
    /**
     * Get process tree on Unix-like systems (macOS, Linux)
     */
    async getUnixProcessTree(rootPid) {
        const isMacOS = process.platform === 'darwin';
        // Always use the recursive approach since process groups aren't working reliably
        logger.log('ProcessTreeAnalyzer', `Using recursive child search for ${rootPid} to find all descendants`);
        try {
            return await this.getProcessTreeRecursive(rootPid, isMacOS);
        }
        catch (fallbackError) {
            logger.warn('ProcessTreeAnalyzer', `Recursive process search failed:`, fallbackError);
            // Final fallback: try to get just the root process
            try {
                const psCommand = isMacOS
                    ? `ps -o pid,ppid,pgid,tty,state,lstart,command -p ${rootPid}`
                    : `ps -o pid,ppid,pgid,sid,tty,state,lstart,command -p ${rootPid}`;
                const { stdout } = await execAsync(psCommand, { timeout: 5000 });
                return this.parseUnixProcessOutput(stdout, isMacOS);
            }
            catch (finalError) {
                logger.warn('ProcessTreeAnalyzer', `Final fallback also failed:`, finalError);
                return [];
            }
        }
    }
    /**
     * Get process tree on Windows systems
     */
    async getWindowsProcessTree(rootPid) {
        try {
            const { stdout } = await execAsync(`wmic process where "ParentProcessId=${rootPid}" get ProcessId,ParentProcessId,CommandLine /format:csv`, { timeout: 5000 });
            return this.parseWindowsProcessOutput(stdout, rootPid);
        }
        catch (error) {
            logger.warn('ProcessTreeAnalyzer', `Windows process query failed:`, error);
            return [];
        }
    }
    /**
     * Parse Unix/Linux ps command output
     */
    parseUnixProcessOutput(output, isMacOS = false) {
        const lines = output.trim().split('\n');
        const processes = [];
        // Skip header line
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line)
                continue;
            try {
                if (isMacOS) {
                    // macOS ps output: PID PPID PGID TTY STATE STARTED COMMAND
                    // STARTED format: "Mon Jun 23 23:44:31 2025" (contains spaces)
                    // We need to handle the multi-word timestamp properly
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 10) {
                        const pid = Number.parseInt(parts[0]);
                        const ppid = Number.parseInt(parts[1]);
                        const pgid = Number.parseInt(parts[2]);
                        const tty = parts[3] === '?' ? undefined : parts[3];
                        const state = parts[4];
                        // STARTED timestamp spans multiple parts: parts[5] through parts[9]
                        const startTime = parts.slice(5, 10).join(' ');
                        // COMMAND is everything from part 10 onwards
                        const command = parts.slice(10).join(' ');
                        if (!Number.isNaN(pid) && !Number.isNaN(ppid) && !Number.isNaN(pgid) && command) {
                            logger.log('ProcessTreeAnalyzer', `Parsed macOS process: PID=${pid}, COMMAND="${command.trim()}"`);
                            processes.push({
                                pid,
                                ppid,
                                pgid,
                                tty,
                                state,
                                startTime,
                                command: command.trim(),
                            });
                        }
                    }
                }
                else {
                    // Linux ps output: PID PPID PGID SID TTY STATE STARTED COMMAND
                    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.+?)\s+(.+)$/);
                    if (match) {
                        const [, pid, ppid, pgid, sid, tty, state, startTime, command] = match;
                        processes.push({
                            pid: Number.parseInt(pid),
                            ppid: Number.parseInt(ppid),
                            pgid: Number.parseInt(pgid),
                            sid: Number.parseInt(sid),
                            tty: tty === '?' ? undefined : tty,
                            state,
                            startTime,
                            command: command.trim(),
                        });
                    }
                }
            }
            catch (_parseError) {
                logger.debug('ProcessTreeAnalyzer', `Failed to parse ps line: ${line}`);
            }
        }
        return processes;
    }
    /**
     * Parse Windows tasklist/wmic output
     */
    parseWindowsProcessOutput(output, rootPid) {
        const lines = output.trim().split('\n');
        const processes = [];
        // Add the root process (we only get children from wmic)
        processes.push({
            pid: rootPid,
            ppid: 0,
            pgid: rootPid,
            command: 'shell', // Placeholder
        });
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line)
                continue;
            const parts = line.split(',');
            if (parts.length >= 3) {
                const pid = Number.parseInt(parts[1]);
                const ppid = Number.parseInt(parts[2]);
                const command = parts[3] || 'unknown';
                if (!Number.isNaN(pid) && !Number.isNaN(ppid)) {
                    processes.push({
                        pid,
                        ppid,
                        pgid: pid, // Windows doesn't have process groups like Unix
                        command,
                    });
                }
            }
        }
        return processes;
    }
    /**
     * Identify the most likely source of a bell event
     */
    async identifyBellSource(sessionPid) {
        const tree = await this.getProcessTree(sessionPid);
        logger.log('ProcessTreeAnalyzer', `Process tree for session ${sessionPid}: ${JSON.stringify(tree.map((p) => ({ pid: p.pid, ppid: p.ppid, command: p.command })))}`);
        if (tree.length === 0) {
            logger.warn('ProcessTreeAnalyzer', `No processes found in tree for session ${sessionPid}`);
            return null;
        }
        // Strategy 1: Look for foreground process (non-shell child)
        const foreground = this.findForegroundProcess(tree, sessionPid);
        if (foreground) {
            logger.debug('ProcessTreeAnalyzer', `Identified foreground process: ${foreground.command} (PID: ${foreground.pid})`);
            return foreground;
        }
        // Strategy 2: Look for most recently started child process
        const recentChild = this.findMostRecentChild(tree, sessionPid);
        if (recentChild) {
            logger.debug('ProcessTreeAnalyzer', `Identified recent child process: ${recentChild.command} (PID: ${recentChild.pid})`);
            return recentChild;
        }
        // Strategy 3: Look for any non-shell process in the tree
        const nonShellProcess = tree.find((p) => p.pid !== sessionPid &&
            !this.isShellProcess(p.command) &&
            !this.isBackgroundProcess(p.command));
        if (nonShellProcess) {
            logger.debug('ProcessTreeAnalyzer', `Found non-shell process: ${nonShellProcess.command} (PID: ${nonShellProcess.pid})`);
            return nonShellProcess;
        }
        // Strategy 4: Return the shell itself
        const shellProcess = tree.find((p) => p.pid === sessionPid);
        if (shellProcess) {
            logger.debug('ProcessTreeAnalyzer', `Defaulting to shell process: ${shellProcess.command} (PID: ${shellProcess.pid})`);
            return shellProcess;
        }
        return null;
    }
    /**
     * Find the foreground process (likely the active process the user is interacting with)
     */
    findForegroundProcess(tree, sessionPid) {
        // Strategy 1: Direct children that are not shells or background processes
        let candidates = tree.filter((p) => p.pid !== sessionPid &&
            p.ppid === sessionPid &&
            !this.isShellProcess(p.command) &&
            !this.isBackgroundProcess(p.command));
        logger.log('ProcessTreeAnalyzer', `Direct child candidates: ${JSON.stringify(candidates.map((p) => ({ pid: p.pid, command: p.command })))}`);
        // Strategy 2: If no direct children, look for any descendant processes
        if (candidates.length === 0) {
            candidates = tree.filter((p) => p.pid !== sessionPid &&
                !this.isShellProcess(p.command) &&
                !this.isBackgroundProcess(p.command));
            logger.log('ProcessTreeAnalyzer', `Descendant candidates: ${JSON.stringify(candidates.map((p) => ({ pid: p.pid, command: p.command })))}`);
        }
        if (candidates.length === 0) {
            logger.log('ProcessTreeAnalyzer', 'No suitable candidate processes found, bell likely from shell itself');
            return null;
        }
        // Filter out very short-lived processes (likely prompt utilities)
        const now = new Date();
        const recentCandidates = candidates.filter((p) => {
            if (!p.startTime)
                return true; // Keep if we can't determine age
            const processStart = new Date(p.startTime);
            const ageMs = now.getTime() - processStart.getTime();
            // If process is less than 100ms old, it's likely a prompt utility
            if (ageMs < 100) {
                logger.log('ProcessTreeAnalyzer', `Filtering out very recent process: ${p.command} (age: ${ageMs}ms)`);
                return false;
            }
            return true;
        });
        if (recentCandidates.length === 0) {
            logger.log('ProcessTreeAnalyzer', 'All candidates were very recent (likely prompt utilities)');
            return null;
        }
        // Prefer the most recently started process among the remaining candidates
        const sorted = recentCandidates.sort((a, b) => {
            if (a.startTime && b.startTime) {
                return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
            }
            return 0;
        });
        logger.log('ProcessTreeAnalyzer', `Selected foreground candidate: ${sorted[0].command} (PID: ${sorted[0].pid})`);
        return sorted[0];
    }
    /**
     * Find the most recently started child process
     */
    findMostRecentChild(tree, sessionPid) {
        // Look for any non-shell children first
        let children = tree.filter((p) => p.ppid === sessionPid && p.pid !== sessionPid && !this.isShellProcess(p.command));
        // If no non-shell children, include all children
        if (children.length === 0) {
            children = tree.filter((p) => p.ppid === sessionPid && p.pid !== sessionPid);
        }
        logger.log('ProcessTreeAnalyzer', `Recent child candidates: ${JSON.stringify(children.map((p) => ({ pid: p.pid, command: p.command })))}`);
        if (children.length === 0) {
            return null;
        }
        // Sort by start time if available, otherwise return the last one found
        const sorted = children.sort((a, b) => {
            if (a.startTime && b.startTime) {
                return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
            }
            return 0;
        });
        return sorted[0];
    }
    /**
     * Check if a process is likely a shell process
     */
    isShellProcess(command) {
        const shellIndicators = ['bash', 'zsh', 'sh', 'fish', 'csh', 'tcsh', 'ksh'];
        const processName = ProcessTreeAnalyzer.extractProcessName(command);
        return shellIndicators.includes(processName.toLowerCase());
    }
    /**
     * Check if a process is likely a background process or shell utility
     */
    isBackgroundProcess(command) {
        const backgroundIndicators = [
            'ssh-agent',
            'gpg-agent',
            'dbus-daemon',
            'systemd',
            'kworker',
            'ksoftirqd',
            'migration',
            'watchdog',
        ];
        // Shell prompt utilities that shouldn't be considered bell sources
        const promptUtilities = [
            'git status',
            'git branch',
            'hg branch',
            'hg status',
            'svn status',
            'pwd',
            'whoami',
            'hostname',
            'date',
            'ps ',
            'ls -la',
            'df -h',
        ];
        const lowerCommand = command.toLowerCase();
        // Check for general background processes
        if (backgroundIndicators.some((indicator) => lowerCommand.includes(indicator))) {
            return true;
        }
        // Check for shell prompt utilities
        if (promptUtilities.some((utility) => lowerCommand.includes(utility))) {
            logger.log('ProcessTreeAnalyzer', `Identified prompt utility: ${command}`);
            return true;
        }
        return false;
    }
    /**
     * Get process tree recursively by finding children
     */
    async getProcessTreeRecursive(rootPid, isMacOS) {
        const allProcesses = [];
        const processedPids = new Set();
        // Get all processes on the system
        const psCommand = isMacOS
            ? 'ps -eo pid,ppid,pgid,tty,state,lstart,command'
            : 'ps -eo pid,ppid,pgid,sid,tty,state,lstart,command';
        logger.log('ProcessTreeAnalyzer', `Getting all system processes with: ${psCommand}`);
        const { stdout } = await execAsync(psCommand, { timeout: 10000 });
        const allSystemProcesses = this.parseUnixProcessOutput(stdout, isMacOS);
        logger.log('ProcessTreeAnalyzer', `Found ${allSystemProcesses.length} total system processes`);
        // Build a map of parent -> children
        const childrenMap = new Map();
        for (const proc of allSystemProcesses) {
            if (!childrenMap.has(proc.ppid)) {
                childrenMap.set(proc.ppid, []);
            }
            const children = childrenMap.get(proc.ppid);
            if (children) {
                children.push(proc);
            }
        }
        // Check what children exist for our root PID
        const directChildren = childrenMap.get(rootPid) || [];
        logger.log('ProcessTreeAnalyzer', `Direct children of ${rootPid}: ${JSON.stringify(directChildren.map((p) => ({ pid: p.pid, command: p.command })))}`);
        // Recursively collect the process tree starting from rootPid
        const collectProcessTree = (pid) => {
            if (processedPids.has(pid))
                return;
            processedPids.add(pid);
            // Find the process itself
            const process = allSystemProcesses.find((p) => p.pid === pid);
            if (process) {
                allProcesses.push(process);
            }
            // Find and collect children
            const children = childrenMap.get(pid) || [];
            for (const child of children) {
                collectProcessTree(child.pid);
            }
        };
        collectProcessTree(rootPid);
        logger.log('ProcessTreeAnalyzer', `Final process tree: ${JSON.stringify(allProcesses.map((p) => ({ pid: p.pid, ppid: p.ppid, command: p.command })))}`);
        return allProcesses;
    }
    /**
     * Create a complete process snapshot for bell event analysis
     */
    async captureProcessSnapshot(sessionPid) {
        const processTree = await this.getProcessTree(sessionPid);
        const foregroundProcess = this.findForegroundProcess(processTree, sessionPid);
        const suspectedBellSource = await this.identifyBellSource(sessionPid);
        return {
            sessionPid,
            processTree,
            foregroundProcess,
            suspectedBellSource,
            capturedAt: new Date().toISOString(),
        };
    }
    /**
     * Extract a human-readable process name from a command string
     */
    static extractProcessName(command) {
        // Remove common shell prefixes and arguments
        const cleaned = command
            .replace(/^.*\//, '') // Remove path
            .replace(/\s+.*$/, '') // Remove arguments
            .replace(/^sudo\s+/, '') // Remove sudo
            .replace(/^exec\s+/, ''); // Remove exec
        return cleaned || 'unknown';
    }
    /**
     * Get a short description of the process for notifications
     */
    static getProcessDescription(processInfo) {
        if (!processInfo) {
            return 'unknown process';
        }
        const name = ProcessTreeAnalyzer.extractProcessName(processInfo.command);
        // Return a user-friendly description
        if (name === 'bash' || name === 'zsh' || name === 'sh' || name === 'fish') {
            return 'shell';
        }
        return name;
    }
}
exports.ProcessTreeAnalyzer = ProcessTreeAnalyzer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzcy10cmVlLWFuYWx5emVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NlcnZlci9zZXJ2aWNlcy9wcm9jZXNzLXRyZWUtYW5hbHl6ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsaURBQXFDO0FBQ3JDLCtCQUFpQztBQUNqQyxrREFBa0Q7QUFFbEQsTUFBTSxNQUFNLEdBQUcsSUFBQSx3QkFBWSxFQUFDLHVCQUF1QixDQUFDLENBQUM7QUFFckQsTUFBTSxTQUFTLEdBQUcsSUFBQSxnQkFBUyxFQUFDLG9CQUFJLENBQUMsQ0FBQztBQXFCbEMsTUFBYSxtQkFBbUI7SUFDOUI7O09BRUc7SUFDSCxLQUFLLENBQUMsY0FBYyxDQUFDLE9BQWU7UUFDbEMsSUFBSSxDQUFDO1lBQ0gsSUFBSSxPQUFPLENBQUMsUUFBUSxLQUFLLE9BQU8sRUFBRSxDQUFDO2dCQUNqQyxPQUFPLE1BQU0sSUFBSSxDQUFDLHFCQUFxQixDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ25ELENBQUM7aUJBQU0sQ0FBQztnQkFDTixPQUFPLE1BQU0sSUFBSSxDQUFDLGtCQUFrQixDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ2hELENBQUM7UUFDSCxDQUFDO1FBQUMsT0FBTyxNQUFNLEVBQUUsQ0FBQztZQUNoQixNQUFNLENBQUMsSUFBSSxDQUFDLHFCQUFxQixFQUFFLHNDQUFzQyxPQUFPLEdBQUcsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUM3RixPQUFPLEVBQUUsQ0FBQztRQUNaLENBQUM7SUFDSCxDQUFDO0lBRUQ7O09BRUc7SUFDSyxLQUFLLENBQUMsa0JBQWtCLENBQUMsT0FBZTtRQUM5QyxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsUUFBUSxLQUFLLFFBQVEsQ0FBQztRQUU5QyxpRkFBaUY7UUFDakYsTUFBTSxDQUFDLEdBQUcsQ0FDUixxQkFBcUIsRUFDckIsb0NBQW9DLE9BQU8sMEJBQTBCLENBQ3RFLENBQUM7UUFFRixJQUFJ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VTtZQUNWLFdBQVc7WUFDWCxpQkFBaUI7WUFDakIsbUJBQW1CO1lBQ25CLFVBQVUsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtTQUNyQyxDQUFDO0lBQ0osQ0FBQztJQUVEOztPQUVHO0lBQ0gsTUFBTSxDQUFDLGtCQUFrQixDQUFDLE9BQWU7UUFDdkMsNkNBQTZDO1FBQzdDLE1BQU0sT0FBTyxHQUFHLE9BQU87YUFDcEIsT0FBTyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQyxjQUFjO2FBQ25DLE9BQU8sQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLENBQUMsbUJBQW1CO2FBQ3pDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDLENBQUMsY0FBYzthQUN0QyxPQUFPLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsY0FBYztRQUUxQyxPQUFPLE9BQU8sSUFBSSxTQUFTLENBQUM7SUFDOUIsQ0FBQztJQUVEOztPQUVHO0lBQ0gsTUFBTSxDQUFDLHFCQUFxQixDQUFDLFdBQStCO1FBQzFELElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNqQixPQUFPLGlCQUFpQixDQUFDO1FBQzNCLENBQUM7UUFFRCxNQUFNLElBQUksR0FBRyxtQkFBbUIsQ0FBQyxrQkFBa0IsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFekUscUNBQXFDO1FBQ3JDLElBQUksSUFBSSxLQUFLLE1BQU0sSUFBSSxJQUFJLEtBQUssS0FBSyxJQUFJLElBQUksS0FBSyxJQUFJLElBQUksSUFBSSxLQUFLLE1BQU0sRUFBRSxDQUFDO1lBQzFFLE9BQU8sT0FBTyxDQUFDO1FBQ2pCLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7Q0FDRjtBQWhoQkQsa0RBZ2hCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGV4ZWMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IHByb21pc2lmeSB9IGZyb20gJ3V0aWwnO1xuaW1wb3J0IHsgY3JlYXRlTG9nZ2VyIH0gZnJvbSAnLi4vdXRpbHMvbG9nZ2VyLmpzJztcblxuY29uc3QgbG9nZ2VyID0gY3JlYXRlTG9nZ2VyKCdwcm9jZXNzLXRyZWUtYW5hbHl6ZXInKTtcblxuY29uc3QgZXhlY0FzeW5jID0gcHJvbWlzaWZ5KGV4ZWMpO1xuXG5leHBvcnQgaW50ZXJmYWNlIFByb2Nlc3NJbmZvIHtcbiAgcGlkOiBudW1iZXI7XG4gIHBwaWQ6IG51bWJlcjtcbiAgcGdpZDogbnVtYmVyO1xuICBzaWQ/OiBudW1iZXI7XG4gIHR0eT86IHN0cmluZztcbiAgY29tbWFuZDogc3RyaW5nO1xuICBzdGF0ZT86IHN0cmluZztcbiAgc3RhcnRUaW1lPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByb2Nlc3NTbmFwc2hvdCB7XG4gIHNlc3Npb25QaWQ6IG51bWJlcjtcbiAgcHJvY2Vzc1RyZWU6IFByb2Nlc3NJbmZvW107XG4gIGZvcmVncm91bmRQcm9jZXNzOiBQcm9jZXNzSW5mbyB8IG51bGw7XG4gIHN1c3BlY3RlZEJlbGxTb3VyY2U6IFByb2Nlc3NJbmZvIHwgbnVsbDtcbiAgY2FwdHVyZWRBdDogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgUHJvY2Vzc1RyZWVBbmFseXplciB7XG4gIC8qKlxuICAgKiBHZXQgdGhlIGNvbXBsZXRlIHByb2Nlc3MgdHJlZSBmb3IgYSBnaXZlbiByb290IHByb2Nlc3NcbiAgICovXG4gIGFzeW5jIGdldFByb2Nlc3NUcmVlKHJvb3RQaWQ6IG51bWJlcik6IFByb21pc2U8UHJvY2Vzc0luZm9bXT4ge1xuICAgIHRyeSB7XG4gICAgICBpZiAocHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJykge1xuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5nZXRXaW5kb3dzUHJvY2Vzc1RyZWUocm9vdFBpZCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5nZXRVbml4UHJvY2Vzc1RyZWUocm9vdFBpZCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoX2Vycm9yKSB7XG4gICAgICBsb2dnZXIud2FybignUHJvY2Vzc1RyZWVBbmFseXplcicsIGBGYWlsZWQgdG8gZ2V0IHByb2Nlc3MgdHJlZSBmb3IgUElEICR7cm9vdFBpZH06YCwgX2Vycm9yKTtcbiAgICAgIHJldHVybiBbXTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogR2V0IHByb2Nlc3MgdHJlZSBvbiBVbml4LWxpa2Ugc3lzdGVtcyAobWFjT1MsIExpbnV4KVxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBnZXRVbml4UHJvY2Vzc1RyZWUocm9vdFBpZDogbnVtYmVyKTogUHJvbWlzZTxQcm9jZXNzSW5mb1tdPiB7XG4gICAgY29uc3QgaXNNYWNPUyA9IHByb2Nlc3MucGxhdGZvcm0gPT09ICdkYXJ3aW4nO1xuXG4gICAgLy8gQWx3YXlzIHVzZSB0aGUgcmVjdXJzaXZlIGFwcHJvYWNoIHNpbmNlIHByb2Nlc3MgZ3JvdXBzIGFyZW4ndCB3b3JraW5nIHJlbGlhYmx5XG4gICAgbG9nZ2VyLmxvZyhcbiAgICAgICdQcm9jZXNzVHJlZUFuYWx5emVyJyxcbiAgICAgIGBVc2luZyByZWN1cnNpdmUgY2hpbGQgc2VhcmNoIGZvciAke3Jvb3RQaWR9IHRvIGZpbmQgYWxsIGRlc2NlbmRhbnRzYFxuICAgICk7XG5cbiAgICB0cnkge1xuICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuZ2V0UHJvY2Vzc1RyZWVSZWN1cnNpdmUocm9vdFBpZCwgaXNNYWNPUyk7XG4gICAgfSBjYXRjaCAoZmFsbGJhY2tFcnJvcikge1xuICAgICAgbG9nZ2VyLndhcm4oJ1Byb2Nlc3NUcmVlQW5hbHl6ZXInLCBgUmVjdXJzaXZlIHByb2Nlc3Mgc2VhcmNoIGZhaWxlZDpgLCBmYWxsYmFja0Vycm9yKTtcblxuICAgICAgLy8gRmluYWwgZmFsbGJhY2s6IHRyeSB0byBnZXQganVzdCB0aGUgcm9vdCBwcm9jZXNzXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBwc0NvbW1hbmQgPSBpc01hY09TXG4gICAgICAgICAgPyBgcHMgLW8gcGlkLHBwaWQscGdpZCx0dHksc3RhdGUsbHN0YXJ0LGNvbW1hbmQgLXAgJHtyb290UGlkfWBcbiAgICAgICAgICA6IGBwcyAtbyBwaWQscHBpZCxwZ2lkLHNpZCx0dHksc3RhdGUsbHN0YXJ0LGNvbW1hbmQgLXAgJHtyb290UGlkfWA7XG5cbiAgICAgICAgY29uc3QgeyBzdGRvdXQgfSA9IGF3YWl0IGV4ZWNBc3luYyhwc0NvbW1hbmQsIHsgdGltZW91dDogNTAwMCB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXMucGFyc2VVbml4UHJvY2Vzc091dHB1dChzdGRvdXQsIGlzTWFjT1MpO1xuICAgICAgfSBjYXRjaCAoZmluYWxFcnJvcikge1xuICAgICAgICBsb2dnZXIud2FybignUHJvY2Vzc1RyZWVBbmFseXplcicsIGBGaW5hbCBmYWxsYmFjayBhbHNvIGZhaWxlZDpgLCBmaW5hbEVycm9yKTtcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgcHJvY2VzcyB0cmVlIG9uIFdpbmRvd3Mgc3lzdGVtc1xuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBnZXRXaW5kb3dzUHJvY2Vzc1RyZWUocm9vdFBpZDogbnVtYmVyKTogUHJvbWlzZTxQcm9jZXNzSW5mb1tdPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHsgc3Rkb3V0IH0gPSBhd2FpdCBleGVjQXN5bmMoXG4gICAgICAgIGB3bWljIHByb2Nlc3Mgd2hlcmUgXCJQYXJlbnRQcm9jZXNzSWQ9JHtyb290UGlkfVwiIGdldCBQcm9jZXNzSWQsUGFyZW50UHJvY2Vzc0lkLENvbW1hbmRMaW5lIC9mb3JtYXQ6Y3N2YCxcbiAgICAgICAgeyB0aW1lb3V0OiA1MDAwIH1cbiAgICAgICk7XG5cbiAgICAgIHJldHVybiB0aGlzLnBhcnNlV2luZG93c1Byb2Nlc3NPdXRwdXQoc3Rkb3V0LCByb290UGlkKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLndhcm4oJ1Byb2Nlc3NUcmVlQW5hbHl6ZXInLCBgV2luZG93cyBwcm9jZXNzIHF1ZXJ5IGZhaWxlZDpgLCBlcnJvcik7XG4gICAgICByZXR1cm4gW107XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFBhcnNlIFVuaXgvTGludXggcHMgY29tbWFuZCBvdXRwdXRcbiAgICovXG4gIHByaXZhdGUgcGFyc2VVbml4UHJvY2Vzc091dHB1dChvdXRwdXQ6IHN0cmluZywgaXNNYWNPUzogYm9vbGVhbiA9IGZhbHNlKTogUHJvY2Vzc0luZm9bXSB7XG4gICAgY29uc3QgbGluZXMgPSBvdXRwdXQudHJpbSgpLnNwbGl0KCdcXG4nKTtcbiAgICBjb25zdCBwcm9jZXNzZXM6IFByb2Nlc3NJbmZvW10gPSBbXTtcblxuICAgIC8vIFNraXAgaGVhZGVyIGxpbmVcbiAgICBmb3IgKGxldCBpID0gMTsgaSA8IGxpbmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBsaW5lID0gbGluZXNbaV0udHJpbSgpO1xuICAgICAgaWYgKCFsaW5lKSBjb250aW51ZTtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgaWYgKGlzTWFjT1MpIHtcbiAgICAgICAgICAvLyBtYWNPUyBwcyBvdXRwdXQ6IFBJRCBQUElEIFBHSUQgVFRZIFNUQVRFIFNUQVJURUQgQ09NTUFORFxuICAgICAgICAgIC8vIFNUQVJURUQgZm9ybWF0OiBcIk1vbiBKdW4gMjMgMjM6NDQ6MzEgMjAyNVwiIChjb250YWlucyBzcGFjZXMpXG4gICAgICAgICAgLy8gV2UgbmVlZCB0byBoYW5kbGUgdGhlIG11bHRpLXdvcmQgdGltZXN0YW1wIHByb3Blcmx5XG4gICAgICAgICAgY29uc3QgcGFydHMgPSBsaW5lLnRyaW0oKS5zcGxpdCgvXFxzKy8pO1xuICAgICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPj0gMTApIHtcbiAgICAgICAgICAgIGNvbnN0IHBpZCA9IE51bWJlci5wYXJzZUludChwYXJ0c1swXSk7XG4gICAgICAgICAgICBjb25zdCBwcGlkID0gTnVtYmVyLnBhcnNlSW50KHBhcnRzWzFdKTtcbiAgICAgICAgICAgIGNvbnN0IHBnaWQgPSBOdW1iZXIucGFyc2VJbnQocGFydHNbMl0pO1xuICAgICAgICAgICAgY29uc3QgdHR5ID0gcGFydHNbM10gPT09ICc/JyA/IHVuZGVmaW5lZCA6IHBhcnRzWzNdO1xuICAgICAgICAgICAgY29uc3Qgc3RhdGUgPSBwYXJ0c1s0XTtcbiAgICAgICAgICAgIC8vIFNUQVJURUQgdGltZXN0YW1wIHNwYW5zIG11bHRpcGxlIHBhcnRzOiBwYXJ0c1s1XSB0aHJvdWdoIHBhcnRzWzldXG4gICAgICAgICAgICBjb25zdCBzdGFydFRpbWUgPSBwYXJ0cy5zbGljZSg1LCAxMCkuam9pbignICcpO1xuICAgICAgICAgICAgLy8gQ09NTUFORCBpcyBldmVyeXRoaW5nIGZyb20gcGFydCAxMCBvbndhcmRzXG4gICAgICAgICAgICBjb25zdCBjb21tYW5kID0gcGFydHMuc2xpY2UoMTApLmpvaW4oJyAnKTtcblxuICAgICAgICAgICAgaWYgKCFOdW1iZXIuaXNOYU4ocGlkKSAmJiAhTnVtYmVyLmlzTmFOKHBwaWQpICYmICFOdW1iZXIuaXNOYU4ocGdpZCkgJiYgY29tbWFuZCkge1xuICAgICAgICAgICAgICBsb2dnZXIubG9nKFxuICAgICAgICAgICAgICAgICdQcm9jZXNzVHJlZUFuYWx5emVyJyxcbiAgICAgICAgICAgICAgICBgUGFyc2VkIG1hY09TIHByb2Nlc3M6IFBJRD0ke3BpZH0sIENPTU1BTkQ9XCIke2NvbW1hbmQudHJpbSgpfVwiYFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICBwcm9jZXNzZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgcGlkLFxuICAgICAgICAgICAgICAgIHBwaWQsXG4gICAgICAgICAgICAgICAgcGdpZCxcbiAgICAgICAgICAgICAgICB0dHksXG4gICAgICAgICAgICAgICAgc3RhdGUsXG4gICAgICAgICAgICAgICAgc3RhcnRUaW1lLFxuICAgICAgICAgICAgICAgIGNvbW1hbmQ6IGNvbW1hbmQudHJpbSgpLFxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gTGludXggcHMgb3V0cHV0OiBQSUQgUFBJRCBQR0lEIFNJRCBUVFkgU1RBVEUgU1RBUlRFRCBDT01NQU5EXG4gICAgICAgICAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKFxuICAgICAgICAgICAgL15cXHMqKFxcZCspXFxzKyhcXGQrKVxccysoXFxkKylcXHMrKFxcZCspXFxzKyhcXFMrKVxccysoXFxTKylcXHMrKC4rPylcXHMrKC4rKSQvXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgIGNvbnN0IFssIHBpZCwgcHBpZCwgcGdpZCwgc2lkLCB0dHksIHN0YXRlLCBzdGFydFRpbWUsIGNvbW1hbmRdID0gbWF0Y2g7XG4gICAgICAgICAgICBwcm9jZXNzZXMucHVzaCh7XG4gICAgICAgICAgICAgIHBpZDogTnVtYmVyLnBhcnNlSW50KHBpZCksXG4gICAgICAgICAgICAgIHBwaWQ6IE51bWJlci5wYXJzZUludChwcGlkKSxcbiAgICAgICAgICAgICAgcGdpZDogTnVtYmVyLnBhcnNlSW50KHBnaWQpLFxuICAgICAgICAgICAgICBzaWQ6IE51bWJlci5wYXJzZUludChzaWQpLFxuICAgICAgICAgICAgICB0dHk6IHR0eSA9PT0gJz8nID8gdW5kZWZpbmVkIDogdHR5LFxuICAgICAgICAgICAgICBzdGF0ZSxcbiAgICAgICAgICAgICAgc3RhcnRUaW1lLFxuICAgICAgICAgICAgICBjb21tYW5kOiBjb21tYW5kLnRyaW0oKSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoX3BhcnNlRXJyb3IpIHtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKCdQcm9jZXNzVHJlZUFuYWx5emVyJywgYEZhaWxlZCB0byBwYXJzZSBwcyBsaW5lOiAke2xpbmV9YCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHByb2Nlc3NlcztcbiAgfVxuXG4gIC8qKlxuICAgKiBQYXJzZSBXaW5kb3dzIHRhc2tsaXN0L3dtaWMgb3V0cHV0XG4gICAqL1xuICBwcml2YXRlIHBhcnNlV2luZG93c1Byb2Nlc3NPdXRwdXQob3V0cHV0OiBzdHJpbmcsIHJvb3RQaWQ6IG51bWJlcik6IFByb2Nlc3NJbmZvW10ge1xuICAgIGNvbnN0IGxpbmVzID0gb3V0cHV0LnRyaW0oKS5zcGxpdCgnXFxuJyk7XG4gICAgY29uc3QgcHJvY2Vzc2VzOiBQcm9jZXNzSW5mb1tdID0gW107XG5cbiAgICAvLyBBZGQgdGhlIHJvb3QgcHJvY2VzcyAod2Ugb25seSBnZXQgY2hpbGRyZW4gZnJvbSB3bWljKVxuICAgIHByb2Nlc3Nlcy5wdXNoKHtcbiAgICAgIHBpZDogcm9vdFBpZCxcbiAgICAgIHBwaWQ6IDAsXG4gICAgICBwZ2lkOiByb290UGlkLFxuICAgICAgY29tbWFuZDogJ3NoZWxsJywgLy8gUGxhY2Vob2xkZXJcbiAgICB9KTtcblxuICAgIGZvciAobGV0IGkgPSAxOyBpIDwgbGluZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IGxpbmUgPSBsaW5lc1tpXS50cmltKCk7XG4gICAgICBpZiAoIWxpbmUpIGNvbnRpbnVlO1xuXG4gICAgICBjb25zdCBwYXJ0cyA9IGxpbmUuc3BsaXQoJywnKTtcbiAgICAgIGlmIChwYXJ0cy5sZW5ndGggPj0gMykge1xuICAgICAgICBjb25zdCBwaWQgPSBOdW1iZXIucGFyc2VJbnQocGFydHNbMV0pO1xuICAgICAgICBjb25zdCBwcGlkID0gTnVtYmVyLnBhcnNlSW50KHBhcnRzWzJdKTtcbiAgICAgICAgY29uc3QgY29tbWFuZCA9IHBhcnRzWzNdIHx8ICd1bmtub3duJztcblxuICAgICAgICBpZiAoIU51bWJlci5pc05hTihwaWQpICYmICFOdW1iZXIuaXNOYU4ocHBpZCkpIHtcbiAgICAgICAgICBwcm9jZXNzZXMucHVzaCh7XG4gICAgICAgICAgICBwaWQsXG4gICAgICAgICAgICBwcGlkLFxuICAgICAgICAgICAgcGdpZDogcGlkLCAvLyBXaW5kb3dzIGRvZXNuJ3QgaGF2ZSBwcm9jZXNzIGdyb3VwcyBsaWtlIFVuaXhcbiAgICAgICAgICAgIGNvbW1hbmQsXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcHJvY2Vzc2VzO1xuICB9XG5cbiAgLyoqXG4gICAqIElkZW50aWZ5IHRoZSBtb3N0IGxpa2VseSBzb3VyY2Ugb2YgYSBiZWxsIGV2ZW50XG4gICAqL1xuICBhc3luYyBpZGVudGlmeUJlbGxTb3VyY2Uoc2Vzc2lvblBpZDogbnVtYmVyKTogUHJvbWlzZTxQcm9jZXNzSW5mbyB8IG51bGw+IHtcbiAgICBjb25zdCB0cmVlID0gYXdhaXQgdGhpcy5nZXRQcm9jZXNzVHJlZShzZXNzaW9uUGlkKTtcbiAgICBsb2dnZXIubG9nKFxuICAgICAgJ1Byb2Nlc3NUcmVlQW5hbHl6ZXInLFxuICAgICAgYFByb2Nlc3MgdHJlZSBmb3Igc2Vzc2lvbiAke3Nlc3Npb25QaWR9OiAke0pTT04uc3RyaW5naWZ5KHRyZWUubWFwKChwKSA9PiAoeyBwaWQ6IHAucGlkLCBwcGlkOiBwLnBwaWQsIGNvbW1hbmQ6IHAuY29tbWFuZCB9KSkpfWBcbiAgICApO1xuXG4gICAgaWYgKHRyZWUubGVuZ3RoID09PSAwKSB7XG4gICAgICBsb2dnZXIud2FybignUHJvY2Vzc1RyZWVBbmFseXplcicsIGBObyBwcm9jZXNzZXMgZm91bmQgaW4gdHJlZSBmb3Igc2Vzc2lvbiAke3Nlc3Npb25QaWR9YCk7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvLyBTdHJhdGVneSAxOiBMb29rIGZvciBmb3JlZ3JvdW5kIHByb2Nlc3MgKG5vbi1zaGVsbCBjaGlsZClcbiAgICBjb25zdCBmb3JlZ3JvdW5kID0gdGhpcy5maW5kRm9yZWdyb3VuZFByb2Nlc3ModHJlZSwgc2Vzc2lvblBpZCk7XG4gICAgaWYgKGZvcmVncm91bmQpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgICAgJ1Byb2Nlc3NUcmVlQW5hbHl6ZXInLFxuICAgICAgICBgSWRlbnRpZmllZCBmb3JlZ3JvdW5kIHByb2Nlc3M6ICR7Zm9yZWdyb3VuZC5jb21tYW5kfSAoUElEOiAke2ZvcmVncm91bmQucGlkfSlgXG4gICAgICApO1xuICAgICAgcmV0dXJuIGZvcmVncm91bmQ7XG4gICAgfVxuXG4gICAgLy8gU3RyYXRlZ3kgMjogTG9vayBmb3IgbW9zdCByZWNlbnRseSBzdGFydGVkIGNoaWxkIHByb2Nlc3NcbiAgICBjb25zdCByZWNlbnRDaGlsZCA9IHRoaXMuZmluZE1vc3RSZWNlbnRDaGlsZCh0cmVlLCBzZXNzaW9uUGlkKTtcbiAgICBpZiAocmVjZW50Q2hpbGQpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgICAgJ1Byb2Nlc3NUcmVlQW5hbHl6ZXInLFxuICAgICAgICBgSWRlbnRpZmllZCByZWNlbnQgY2hpbGQgcHJvY2VzczogJHtyZWNlbnRDaGlsZC5jb21tYW5kfSAoUElEOiAke3JlY2VudENoaWxkLnBpZH0pYFxuICAgICAgKTtcbiAgICAgIHJldHVybiByZWNlbnRDaGlsZDtcbiAgICB9XG5cbiAgICAvLyBTdHJhdGVneSAzOiBMb29rIGZvciBhbnkgbm9uLXNoZWxsIHByb2Nlc3MgaW4gdGhlIHRyZWVcbiAgICBjb25zdCBub25TaGVsbFByb2Nlc3MgPSB0cmVlLmZpbmQoXG4gICAgICAocCkgPT5cbiAgICAgICAgcC5waWQgIT09IHNlc3Npb25QaWQgJiZcbiAgICAgICAgIXRoaXMuaXNTaGVsbFByb2Nlc3MocC5jb21tYW5kKSAmJlxuICAgICAgICAhdGhpcy5pc0JhY2tncm91bmRQcm9jZXNzKHAuY29tbWFuZClcbiAgICApO1xuICAgIGlmIChub25TaGVsbFByb2Nlc3MpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgICAgJ1Byb2Nlc3NUcmVlQW5hbHl6ZXInLFxuICAgICAgICBgRm91bmQgbm9uLXNoZWxsIHByb2Nlc3M6ICR7bm9uU2hlbGxQcm9jZXNzLmNvbW1hbmR9IChQSUQ6ICR7bm9uU2hlbGxQcm9jZXNzLnBpZH0pYFxuICAgICAgKTtcbiAgICAgIHJldHVybiBub25TaGVsbFByb2Nlc3M7XG4gICAgfVxuXG4gICAgLy8gU3RyYXRlZ3kgNDogUmV0dXJuIHRoZSBzaGVsbCBpdHNlbGZcbiAgICBjb25zdCBzaGVsbFByb2Nlc3MgPSB0cmVlLmZpbmQoKHApID0+IHAucGlkID09PSBzZXNzaW9uUGlkKTtcbiAgICBpZiAoc2hlbGxQcm9jZXNzKSB7XG4gICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgICdQcm9jZXNzVHJlZUFuYWx5emVyJyxcbiAgICAgICAgYERlZmF1bHRpbmcgdG8gc2hlbGwgcHJvY2VzczogJHtzaGVsbFByb2Nlc3MuY29tbWFuZH0gKFBJRDogJHtzaGVsbFByb2Nlc3MucGlkfSlgXG4gICAgICApO1xuICAgICAgcmV0dXJuIHNoZWxsUHJvY2VzcztcbiAgICB9XG5cbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIC8qKlxuICAgKiBGaW5kIHRoZSBmb3JlZ3JvdW5kIHByb2Nlc3MgKGxpa2VseSB0aGUgYWN0aXZlIHByb2Nlc3MgdGhlIHVzZXIgaXMgaW50ZXJhY3Rpbmcgd2l0aClcbiAgICovXG4gIHByaXZhdGUgZmluZEZvcmVncm91bmRQcm9jZXNzKHRyZWU6IFByb2Nlc3NJbmZvW10sIHNlc3Npb25QaWQ6IG51bWJlcik6IFByb2Nlc3NJbmZvIHwgbnVsbCB7XG4gICAgLy8gU3RyYXRlZ3kgMTogRGlyZWN0IGNoaWxkcmVuIHRoYXQgYXJlIG5vdCBzaGVsbHMgb3IgYmFja2dyb3VuZCBwcm9jZXNzZXNcbiAgICBsZXQgY2FuZGlkYXRlcyA9IHRyZWUuZmlsdGVyKFxuICAgICAgKHApID0+XG4gICAgICAgIHAucGlkICE9PSBzZXNzaW9uUGlkICYmXG4gICAgICAgIHAucHBpZCA9PT0gc2Vzc2lvblBpZCAmJlxuICAgICAgICAhdGhpcy5pc1NoZWxsUHJvY2VzcyhwLmNvbW1hbmQpICYmXG4gICAgICAgICF0aGlzLmlzQmFja2dyb3VuZFByb2Nlc3MocC5jb21tYW5kKVxuICAgICk7XG5cbiAgICBsb2dnZXIubG9nKFxuICAgICAgJ1Byb2Nlc3NUcmVlQW5hbHl6ZXInLFxuICAgICAgYERpcmVjdCBjaGlsZCBjYW5kaWRhdGVzOiAke0pTT04uc3RyaW5naWZ5KGNhbmRpZGF0ZXMubWFwKChwKSA9PiAoeyBwaWQ6IHAucGlkLCBjb21tYW5kOiBwLmNvbW1hbmQgfSkpKX1gXG4gICAgKTtcblxuICAgIC8vIFN0cmF0ZWd5IDI6IElmIG5vIGRpcmVjdCBjaGlsZHJlbiwgbG9vayBmb3IgYW55IGRlc2NlbmRhbnQgcHJvY2Vzc2VzXG4gICAgaWYgKGNhbmRpZGF0ZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICBjYW5kaWRhdGVzID0gdHJlZS5maWx0ZXIoXG4gICAgICAgIChwKSA9PlxuICAgICAgICAgIHAucGlkICE9PSBzZXNzaW9uUGlkICYmXG4gICAgICAgICAgIXRoaXMuaXNTaGVsbFByb2Nlc3MocC5jb21tYW5kKSAmJlxuICAgICAgICAgICF0aGlzLmlzQmFja2dyb3VuZFByb2Nlc3MocC5jb21tYW5kKVxuICAgICAgKTtcblxuICAgICAgbG9nZ2VyLmxvZyhcbiAgICAgICAgJ1Byb2Nlc3NUcmVlQW5hbHl6ZXInLFxuICAgICAgICBgRGVzY2VuZGFudCBjYW5kaWRhdGVzOiAke0pTT04uc3RyaW5naWZ5KGNhbmRpZGF0ZXMubWFwKChwKSA9PiAoeyBwaWQ6IHAucGlkLCBjb21tYW5kOiBwLmNvbW1hbmQgfSkpKX1gXG4gICAgICApO1xuICAgIH1cblxuICAgIGlmIChjYW5kaWRhdGVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgbG9nZ2VyLmxvZyhcbiAgICAgICAgJ1Byb2Nlc3NUcmVlQW5hbHl6ZXInLFxuICAgICAgICAnTm8gc3VpdGFibGUgY2FuZGlkYXRlIHByb2Nlc3NlcyBmb3VuZCwgYmVsbCBsaWtlbHkgZnJvbSBzaGVsbCBpdHNlbGYnXG4gICAgICApO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLy8gRmlsdGVyIG91dCB2ZXJ5IHNob3J0LWxpdmVkIHByb2Nlc3NlcyAobGlrZWx5IHByb21wdCB1dGlsaXRpZXMpXG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKTtcbiAgICBjb25zdCByZWNlbnRDYW5kaWRhdGVzID0gY2FuZGlkYXRlcy5maWx0ZXIoKHApID0+IHtcbiAgICAgIGlmICghcC5zdGFydFRpbWUpIHJldHVybiB0cnVlOyAvLyBLZWVwIGlmIHdlIGNhbid0IGRldGVybWluZSBhZ2VcblxuICAgICAgY29uc3QgcHJvY2Vzc1N0YXJ0ID0gbmV3IERhdGUocC5zdGFydFRpbWUpO1xuICAgICAgY29uc3QgYWdlTXMgPSBub3cuZ2V0VGltZSgpIC0gcHJvY2Vzc1N0YXJ0LmdldFRpbWUoKTtcblxuICAgICAgLy8gSWYgcHJvY2VzcyBpcyBsZXNzIHRoYW4gMTAwbXMgb2xkLCBpdCdzIGxpa2VseSBhIHByb21wdCB1dGlsaXR5XG4gICAgICBpZiAoYWdlTXMgPCAxMDApIHtcbiAgICAgICAgbG9nZ2VyLmxvZyhcbiAgICAgICAgICAnUHJvY2Vzc1RyZWVBbmFseXplcicsXG4gICAgICAgICAgYEZpbHRlcmluZyBvdXQgdmVyeSByZWNlbnQgcHJvY2VzczogJHtwLmNvbW1hbmR9IChhZ2U6ICR7YWdlTXN9bXMpYFxuICAgICAgICApO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0pO1xuXG4gICAgaWYgKHJlY2VudENhbmRpZGF0ZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICBsb2dnZXIubG9nKFxuICAgICAgICAnUHJvY2Vzc1RyZWVBbmFseXplcicsXG4gICAgICAgICdBbGwgY2FuZGlkYXRlcyB3ZXJlIHZlcnkgcmVjZW50IChsaWtlbHkgcHJvbXB0IHV0aWxpdGllcyknXG4gICAgICApO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLy8gUHJlZmVyIHRoZSBtb3N0IHJlY2VudGx5IHN0YXJ0ZWQgcHJvY2VzcyBhbW9uZyB0aGUgcmVtYWluaW5nIGNhbmRpZGF0ZXNcbiAgICBjb25zdCBzb3J0ZWQgPSByZWNlbnRDYW5kaWRhdGVzLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgIGlmIChhLnN0YXJ0VGltZSAmJiBiLnN0YXJ0VGltZSkge1xuICAgICAgICByZXR1cm4gbmV3IERhdGUoYi5zdGFydFRpbWUpLmdldFRpbWUoKSAtIG5ldyBEYXRlKGEuc3RhcnRUaW1lKS5nZXRUaW1lKCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gMDtcbiAgICB9KTtcblxuICAgIGxvZ2dlci5sb2coXG4gICAgICAnUHJvY2Vzc1RyZWVBbmFseXplcicsXG4gICAgICBgU2VsZWN0ZWQgZm9yZWdyb3VuZCBjYW5kaWRhdGU6ICR7c29ydGVkWzBdLmNvbW1hbmR9IChQSUQ6ICR7c29ydGVkWzBdLnBpZH0pYFxuICAgICk7XG5cbiAgICByZXR1cm4gc29ydGVkWzBdO1xuICB9XG5cbiAgLyoqXG4gICAqIEZpbmQgdGhlIG1vc3QgcmVjZW50bHkgc3RhcnRlZCBjaGlsZCBwcm9jZXNzXG4gICAqL1xuICBwcml2YXRlIGZpbmRNb3N0UmVjZW50Q2hpbGQodHJlZTogUHJvY2Vzc0luZm9bXSwgc2Vzc2lvblBpZDogbnVtYmVyKTogUHJvY2Vzc0luZm8gfCBudWxsIHtcbiAgICAvLyBMb29rIGZvciBhbnkgbm9uLXNoZWxsIGNoaWxkcmVuIGZpcnN0XG4gICAgbGV0IGNoaWxkcmVuID0gdHJlZS5maWx0ZXIoXG4gICAgICAocCkgPT4gcC5wcGlkID09PSBzZXNzaW9uUGlkICYmIHAucGlkICE9PSBzZXNzaW9uUGlkICYmICF0aGlzLmlzU2hlbGxQcm9jZXNzKHAuY29tbWFuZClcbiAgICApO1xuXG4gICAgLy8gSWYgbm8gbm9uLXNoZWxsIGNoaWxkcmVuLCBpbmNsdWRlIGFsbCBjaGlsZHJlblxuICAgIGlmIChjaGlsZHJlbi5sZW5ndGggPT09IDApIHtcbiAgICAgIGNoaWxkcmVuID0gdHJlZS5maWx0ZXIoKHApID0+IHAucHBpZCA9PT0gc2Vzc2lvblBpZCAmJiBwLnBpZCAhPT0gc2Vzc2lvblBpZCk7XG4gICAgfVxuXG4gICAgbG9nZ2VyLmxvZyhcbiAgICAgICdQcm9jZXNzVHJlZUFuYWx5emVyJyxcbiAgICAgIGBSZWNlbnQgY2hpbGQgY2FuZGlkYXRlczogJHtKU09OLnN0cmluZ2lmeShjaGlsZHJlbi5tYXAoKHApID0+ICh7IHBpZDogcC5waWQsIGNvbW1hbmQ6IHAuY29tbWFuZCB9KSkpfWBcbiAgICApO1xuXG4gICAgaWYgKGNoaWxkcmVuLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLy8gU29ydCBieSBzdGFydCB0aW1lIGlmIGF2YWlsYWJsZSwgb3RoZXJ3aXNlIHJldHVybiB0aGUgbGFzdCBvbmUgZm91bmRcbiAgICBjb25zdCBzb3J0ZWQgPSBjaGlsZHJlbi5zb3J0KChhLCBiKSA9PiB7XG4gICAgICBpZiAoYS5zdGFydFRpbWUgJiYgYi5zdGFydFRpbWUpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBEYXRlKGIuc3RhcnRUaW1lKS5nZXRUaW1lKCkgLSBuZXcgRGF0ZShhLnN0YXJ0VGltZSkuZ2V0VGltZSgpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIDA7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gc29ydGVkWzBdO1xuICB9XG5cbiAgLyoqXG4gICAqIENoZWNrIGlmIGEgcHJvY2VzcyBpcyBsaWtlbHkgYSBzaGVsbCBwcm9jZXNzXG4gICAqL1xuICBwcml2YXRlIGlzU2hlbGxQcm9jZXNzKGNvbW1hbmQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IHNoZWxsSW5kaWNhdG9ycyA9IFsnYmFzaCcsICd6c2gnLCAnc2gnLCAnZmlzaCcsICdjc2gnLCAndGNzaCcsICdrc2gnXTtcbiAgICBjb25zdCBwcm9jZXNzTmFtZSA9IFByb2Nlc3NUcmVlQW5hbHl6ZXIuZXh0cmFjdFByb2Nlc3NOYW1lKGNvbW1hbmQpO1xuICAgIHJldHVybiBzaGVsbEluZGljYXRvcnMuaW5jbHVkZXMocHJvY2Vzc05hbWUudG9Mb3dlckNhc2UoKSk7XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2sgaWYgYSBwcm9jZXNzIGlzIGxpa2VseSBhIGJhY2tncm91bmQgcHJvY2VzcyBvciBzaGVsbCB1dGlsaXR5XG4gICAqL1xuICBwcml2YXRlIGlzQmFja2dyb3VuZFByb2Nlc3MoY29tbWFuZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgY29uc3QgYmFja2dyb3VuZEluZGljYXRvcnMgPSBbXG4gICAgICAnc3NoLWFnZW50JyxcbiAgICAgICdncGctYWdlbnQnLFxuICAgICAgJ2RidXMtZGFlbW9uJyxcbiAgICAgICdzeXN0ZW1kJyxcbiAgICAgICdrd29ya2VyJyxcbiAgICAgICdrc29mdGlycWQnLFxuICAgICAgJ21pZ3JhdGlvbicsXG4gICAgICAnd2F0Y2hkb2cnLFxuICAgIF07XG5cbiAgICAvLyBTaGVsbCBwcm9tcHQgdXRpbGl0aWVzIHRoYXQgc2hvdWxkbid0IGJlIGNvbnNpZGVyZWQgYmVsbCBzb3VyY2VzXG4gICAgY29uc3QgcHJvbXB0VXRpbGl0aWVzID0gW1xuICAgICAgJ2dpdCBzdGF0dXMnLFxuICAgICAgJ2dpdCBicmFuY2gnLFxuICAgICAgJ2hnIGJyYW5jaCcsXG4gICAgICAnaGcgc3RhdHVzJyxcbiAgICAgICdzdm4gc3RhdHVzJyxcbiAgICAgICdwd2QnLFxuICAgICAgJ3dob2FtaScsXG4gICAgICAnaG9zdG5hbWUnLFxuICAgICAgJ2RhdGUnLFxuICAgICAgJ3BzICcsXG4gICAgICAnbHMgLWxhJyxcbiAgICAgICdkZiAtaCcsXG4gICAgXTtcblxuICAgIGNvbnN0IGxvd2VyQ29tbWFuZCA9IGNvbW1hbmQudG9Mb3dlckNhc2UoKTtcblxuICAgIC8vIENoZWNrIGZvciBnZW5lcmFsIGJhY2tncm91bmQgcHJvY2Vzc2VzXG4gICAgaWYgKGJhY2tncm91bmRJbmRpY2F0b3JzLnNvbWUoKGluZGljYXRvcikgPT4gbG93ZXJDb21tYW5kLmluY2x1ZGVzKGluZGljYXRvcikpKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBmb3Igc2hlbGwgcHJvbXB0IHV0aWxpdGllc1xuICAgIGlmIChwcm9tcHRVdGlsaXRpZXMuc29tZSgodXRpbGl0eSkgPT4gbG93ZXJDb21tYW5kLmluY2x1ZGVzKHV0aWxpdHkpKSkge1xuICAgICAgbG9nZ2VyLmxvZygnUHJvY2Vzc1RyZWVBbmFseXplcicsIGBJZGVudGlmaWVkIHByb21wdCB1dGlsaXR5OiAke2NvbW1hbmR9YCk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICAvKipcbiAgICogR2V0IHByb2Nlc3MgdHJlZSByZWN1cnNpdmVseSBieSBmaW5kaW5nIGNoaWxkcmVuXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGdldFByb2Nlc3NUcmVlUmVjdXJzaXZlKHJvb3RQaWQ6IG51bWJlciwgaXNNYWNPUzogYm9vbGVhbik6IFByb21pc2U8UHJvY2Vzc0luZm9bXT4ge1xuICAgIGNvbnN0IGFsbFByb2Nlc3NlczogUHJvY2Vzc0luZm9bXSA9IFtdO1xuICAgIGNvbnN0IHByb2Nlc3NlZFBpZHMgPSBuZXcgU2V0PG51bWJlcj4oKTtcblxuICAgIC8vIEdldCBhbGwgcHJvY2Vzc2VzIG9uIHRoZSBzeXN0ZW1cbiAgICBjb25zdCBwc0NvbW1hbmQgPSBpc01hY09TXG4gICAgICA/ICdwcyAtZW8gcGlkLHBwaWQscGdpZCx0dHksc3RhdGUsbHN0YXJ0LGNvbW1hbmQnXG4gICAgICA6ICdwcyAtZW8gcGlkLHBwaWQscGdpZCxzaWQsdHR5LHN0YXRlLGxzdGFydCxjb21tYW5kJztcblxuICAgIGxvZ2dlci5sb2coJ1Byb2Nlc3NUcmVlQW5hbHl6ZXInLCBgR2V0dGluZyBhbGwgc3lzdGVtIHByb2Nlc3NlcyB3aXRoOiAke3BzQ29tbWFuZH1gKTtcbiAgICBjb25zdCB7IHN0ZG91dCB9ID0gYXdhaXQgZXhlY0FzeW5jKHBzQ29tbWFuZCwgeyB0aW1lb3V0OiAxMDAwMCB9KTtcbiAgICBjb25zdCBhbGxTeXN0ZW1Qcm9jZXNzZXMgPSB0aGlzLnBhcnNlVW5peFByb2Nlc3NPdXRwdXQoc3Rkb3V0LCBpc01hY09TKTtcblxuICAgIGxvZ2dlci5sb2coJ1Byb2Nlc3NUcmVlQW5hbHl6ZXInLCBgRm91bmQgJHthbGxTeXN0ZW1Qcm9jZXNzZXMubGVuZ3RofSB0b3RhbCBzeXN0ZW0gcHJvY2Vzc2VzYCk7XG5cbiAgICAvLyBCdWlsZCBhIG1hcCBvZiBwYXJlbnQgLT4gY2hpbGRyZW5cbiAgICBjb25zdCBjaGlsZHJlbk1hcCA9IG5ldyBNYXA8bnVtYmVyLCBQcm9jZXNzSW5mb1tdPigpO1xuICAgIGZvciAoY29uc3QgcHJvYyBvZiBhbGxTeXN0ZW1Qcm9jZXNzZXMpIHtcbiAgICAgIGlmICghY2hpbGRyZW5NYXAuaGFzKHByb2MucHBpZCkpIHtcbiAgICAgICAgY2hpbGRyZW5NYXAuc2V0KHByb2MucHBpZCwgW10pO1xuICAgICAgfVxuICAgICAgY29uc3QgY2hpbGRyZW4gPSBjaGlsZHJlbk1hcC5nZXQocHJvYy5wcGlkKTtcbiAgICAgIGlmIChjaGlsZHJlbikge1xuICAgICAgICBjaGlsZHJlbi5wdXNoKHByb2MpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENoZWNrIHdoYXQgY2hpbGRyZW4gZXhpc3QgZm9yIG91ciByb290IFBJRFxuICAgIGNvbnN0IGRpcmVjdENoaWxkcmVuID0gY2hpbGRyZW5NYXAuZ2V0KHJvb3RQaWQpIHx8IFtdO1xuICAgIGxvZ2dlci5sb2coXG4gICAgICAnUHJvY2Vzc1RyZWVBbmFseXplcicsXG4gICAgICBgRGlyZWN0IGNoaWxkcmVuIG9mICR7cm9vdFBpZH06ICR7SlNPTi5zdHJpbmdpZnkoZGlyZWN0Q2hpbGRyZW4ubWFwKChwKSA9PiAoeyBwaWQ6IHAucGlkLCBjb21tYW5kOiBwLmNvbW1hbmQgfSkpKX1gXG4gICAgKTtcblxuICAgIC8vIFJlY3Vyc2l2ZWx5IGNvbGxlY3QgdGhlIHByb2Nlc3MgdHJlZSBzdGFydGluZyBmcm9tIHJvb3RQaWRcbiAgICBjb25zdCBjb2xsZWN0UHJvY2Vzc1RyZWUgPSAocGlkOiBudW1iZXIpID0+IHtcbiAgICAgIGlmIChwcm9jZXNzZWRQaWRzLmhhcyhwaWQpKSByZXR1cm47XG4gICAgICBwcm9jZXNzZWRQaWRzLmFkZChwaWQpO1xuXG4gICAgICAvLyBGaW5kIHRoZSBwcm9jZXNzIGl0c2VsZlxuICAgICAgY29uc3QgcHJvY2VzcyA9IGFsbFN5c3RlbVByb2Nlc3Nlcy5maW5kKChwKSA9PiBwLnBpZCA9PT0gcGlkKTtcbiAgICAgIGlmIChwcm9jZXNzKSB7XG4gICAgICAgIGFsbFByb2Nlc3Nlcy5wdXNoKHByb2Nlc3MpO1xuICAgICAgfVxuXG4gICAgICAvLyBGaW5kIGFuZCBjb2xsZWN0IGNoaWxkcmVuXG4gICAgICBjb25zdCBjaGlsZHJlbiA9IGNoaWxkcmVuTWFwLmdldChwaWQpIHx8IFtdO1xuICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuICAgICAgICBjb2xsZWN0UHJvY2Vzc1RyZWUoY2hpbGQucGlkKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgY29sbGVjdFByb2Nlc3NUcmVlKHJvb3RQaWQpO1xuXG4gICAgbG9nZ2VyLmxvZyhcbiAgICAgICdQcm9jZXNzVHJlZUFuYWx5emVyJyxcbiAgICAgIGBGaW5hbCBwcm9jZXNzIHRyZWU6ICR7SlNPTi5zdHJpbmdpZnkoYWxsUHJvY2Vzc2VzLm1hcCgocCkgPT4gKHsgcGlkOiBwLnBpZCwgcHBpZDogcC5wcGlkLCBjb21tYW5kOiBwLmNvbW1hbmQgfSkpKX1gXG4gICAgKTtcblxuICAgIHJldHVybiBhbGxQcm9jZXNzZXM7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGEgY29tcGxldGUgcHJvY2VzcyBzbmFwc2hvdCBmb3IgYmVsbCBldmVudCBhbmFseXNpc1xuICAgKi9cbiAgYXN5bmMgY2FwdHVyZVByb2Nlc3NTbmFwc2hvdChzZXNzaW9uUGlkOiBudW1iZXIpOiBQcm9taXNlPFByb2Nlc3NTbmFwc2hvdD4ge1xuICAgIGNvbnN0IHByb2Nlc3NUcmVlID0gYXdhaXQgdGhpcy5nZXRQcm9jZXNzVHJlZShzZXNzaW9uUGlkKTtcbiAgICBjb25zdCBmb3JlZ3JvdW5kUHJvY2VzcyA9IHRoaXMuZmluZEZvcmVncm91bmRQcm9jZXNzKHByb2Nlc3NUcmVlLCBzZXNzaW9uUGlkKTtcbiAgICBjb25zdCBzdXNwZWN0ZWRCZWxsU291cmNlID0gYXdhaXQgdGhpcy5pZGVudGlmeUJlbGxTb3VyY2Uoc2Vzc2lvblBpZCk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc2Vzc2lvblBpZCxcbiAgICAgIHByb2Nlc3NUcmVlLFxuICAgICAgZm9yZWdyb3VuZFByb2Nlc3MsXG4gICAgICBzdXNwZWN0ZWRCZWxsU291cmNlLFxuICAgICAgY2FwdHVyZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogRXh0cmFjdCBhIGh1bWFuLXJlYWRhYmxlIHByb2Nlc3MgbmFtZSBmcm9tIGEgY29tbWFuZCBzdHJpbmdcbiAgICovXG4gIHN0YXRpYyBleHRyYWN0UHJvY2Vzc05hbWUoY29tbWFuZDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAvLyBSZW1vdmUgY29tbW9uIHNoZWxsIHByZWZpeGVzIGFuZCBhcmd1bWVudHNcbiAgICBjb25zdCBjbGVhbmVkID0gY29tbWFuZFxuICAgICAgLnJlcGxhY2UoL14uKlxcLy8sICcnKSAvLyBSZW1vdmUgcGF0aFxuICAgICAgLnJlcGxhY2UoL1xccysuKiQvLCAnJykgLy8gUmVtb3ZlIGFyZ3VtZW50c1xuICAgICAgLnJlcGxhY2UoL15zdWRvXFxzKy8sICcnKSAvLyBSZW1vdmUgc3Vkb1xuICAgICAgLnJlcGxhY2UoL15leGVjXFxzKy8sICcnKTsgLy8gUmVtb3ZlIGV4ZWNcblxuICAgIHJldHVybiBjbGVhbmVkIHx8ICd1bmtub3duJztcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgYSBzaG9ydCBkZXNjcmlwdGlvbiBvZiB0aGUgcHJvY2VzcyBmb3Igbm90aWZpY2F0aW9uc1xuICAgKi9cbiAgc3RhdGljIGdldFByb2Nlc3NEZXNjcmlwdGlvbihwcm9jZXNzSW5mbzogUHJvY2Vzc0luZm8gfCBudWxsKTogc3RyaW5nIHtcbiAgICBpZiAoIXByb2Nlc3NJbmZvKSB7XG4gICAgICByZXR1cm4gJ3Vua25vd24gcHJvY2Vzcyc7XG4gICAgfVxuXG4gICAgY29uc3QgbmFtZSA9IFByb2Nlc3NUcmVlQW5hbHl6ZXIuZXh0cmFjdFByb2Nlc3NOYW1lKHByb2Nlc3NJbmZvLmNvbW1hbmQpO1xuXG4gICAgLy8gUmV0dXJuIGEgdXNlci1mcmllbmRseSBkZXNjcmlwdGlvblxuICAgIGlmIChuYW1lID09PSAnYmFzaCcgfHwgbmFtZSA9PT0gJ3pzaCcgfHwgbmFtZSA9PT0gJ3NoJyB8fCBuYW1lID09PSAnZmlzaCcpIHtcbiAgICAgIHJldHVybiAnc2hlbGwnO1xuICAgIH1cblxuICAgIHJldHVybiBuYW1lO1xuICB9XG59XG4iXX0=