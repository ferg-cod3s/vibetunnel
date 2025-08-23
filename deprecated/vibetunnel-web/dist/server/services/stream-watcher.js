"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamWatcher = void 0;
const chalk_1 = __importDefault(require("chalk"));
const fs = __importStar(require("fs"));
const logger_js_1 = require("../utils/logger.js");
const pruning_detector_js_1 = require("../utils/pruning-detector.js");
const git_watcher_js_1 = require("./git-watcher.js");
const logger = (0, logger_js_1.createLogger)('stream-watcher');
// Constants
const HEADER_READ_BUFFER_SIZE = 4096;
// Type guard functions
function isOutputEvent(event) {
    return (Array.isArray(event) && event.length === 3 && event[1] === 'o' && typeof event[0] === 'number');
}
function isResizeEvent(event) {
    return (Array.isArray(event) && event.length === 3 && event[1] === 'r' && typeof event[0] === 'number');
}
function isExitEvent(event) {
    return Array.isArray(event) && event[0] === 'exit';
}
class StreamWatcher {
    constructor(sessionManager) {
        this.activeWatchers = new Map();
        this.sessionManager = sessionManager;
        // Clean up notification listeners on exit
        process.on('beforeExit', () => {
            this.cleanup();
        });
        logger.debug('stream watcher initialized');
    }
    /**
     * Process a clear sequence event and update tracking variables
     */
    processClearSequence(event, eventIndex, fileOffset, currentResize, eventLine) {
        const prunePoint = (0, pruning_detector_js_1.findLastPrunePoint)(event[2]);
        if (!prunePoint)
            return null;
        // Calculate precise offset using shared utility
        const lastClearOffset = (0, pruning_detector_js_1.calculatePruningPositionInFile)(fileOffset, eventLine, prunePoint.position);
        // Use shared logging function
        (0, pruning_detector_js_1.logPruningDetection)(prunePoint.sequence, lastClearOffset, '(retroactive scan)');
        logger.debug(`found at event index ${eventIndex}, ` +
            `current resize: ${currentResize ? currentResize[2] : 'none'}`);
        return {
            lastClearIndex: eventIndex,
            lastClearOffset,
            lastResizeBeforeClear: currentResize,
        };
    }
    /**
     * Parse a line of asciinema data and return the parsed event
     */
    parseAsciinemaLine(line) {
        if (!line.trim())
            return null;
        try {
            const parsed = JSON.parse(line);
            // Check if it's a header
            if (parsed.version && parsed.width && parsed.height) {
                return parsed;
            }
            // Check if it's an event
            if (Array.isArray(parsed)) {
                if (parsed[0] === 'exit') {
                    return parsed;
                }
                else if (parsed.length >= 3 && typeof parsed[0] === 'number') {
                    return parsed;
                }
            }
            return null;
        }
        catch (e) {
            logger.debug(`skipping invalid JSON line: ${e}`);
            return null;
        }
    }
    /**
     * Send an event to the client with proper formatting
     */
    sendEventToClient(client, event, makeInstant = false) {
        try {
            let dataToSend = event;
            // For existing content, set timestamp to 0
            if (makeInstant &&
                Array.isArray(event) &&
                event.length >= 3 &&
                typeof event[0] === 'number') {
                dataToSend = [0, event[1], event[2]];
            }
            client.response.write(`data: ${JSON.stringify(dataToSend)}\n\n`);
            // Handle exit events
            if (Array.isArray(event) && isExitEvent(event)) {
                logger.log(chalk_1.default.yellow(`session ${client.response.locals?.sessionId || 'unknown'} already ended, closing stream`));
                client.response.end();
            }
        }
        catch (error) {
            logger.debug(`client write failed (likely disconnected): ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Add a client to watch a stream file
     */
    addClient(sessionId, streamPath, response) {
        logger.debug(`adding client to session ${sessionId}`);
        const startTime = Date.now() / 1000;
        const client = { response, startTime };
        let watcherInfo = this.activeWatchers.get(sessionId);
        if (!watcherInfo) {
            // Create new watcher for this session
            logger.log(chalk_1.default.green(`creating new stream watcher for session ${sessionId}`));
            watcherInfo = {
                clients: new Set(),
                lastOffset: 0,
                lastSize: 0,
                lastMtime: 0,
                lineBuffer: '',
            };
            this.activeWatchers.set(sessionId, watcherInfo);
            // Send existing content first
            this.sendExistingContent(sessionId, streamPath, client);
            // Get current file size and stats
            if (fs.existsSync(streamPath)) {
                const stats = fs.statSync(streamPath);
                watcherInfo.lastOffset = stats.size;
                watcherInfo.lastSize = stats.size;
                watcherInfo.lastMtime = stats.mtimeMs;
                logger.debug(`initial file size: ${stats.size} bytes`);
            }
            else {
                logger.debug(`stream file does not exist yet: ${streamPath}`);
            }
            // Start watching for new content
            this.startWatching(sessionId, streamPath, watcherInfo);
            // Start git watching if this is a git repository
            this.startGitWatching(sessionId, response);
        }
        else {
            // Send existing content to new client
            this.sendExistingContent(sessionId, streamPath, client);
            // Add this client to git watcher
            git_watcher_js_1.gitWatcher.addClient(sessionId, response);
        }
        // Add client to set
        watcherInfo.clients.add(client);
        logger.log(chalk_1.default.blue(`client connected to stream ${sessionId} (${watcherInfo.clients.size} total)`));
    }
    /**
     * Remove a client
     */
    removeClient(sessionId, response) {
        const watcherInfo = this.activeWatchers.get(sessionId);
        if (!watcherInfo) {
            logger.debug(`no watcher found for session ${sessionId}`);
            return;
        }
        // Find and remove client
        let clientToRemove;
        for (const client of watcherInfo.clients) {
            if (client.response === response) {
                clientToRemove = client;
                break;
            }
        }
        if (clientToRemove) {
            watcherInfo.clients.delete(clientToRemove);
            logger.log(chalk_1.default.yellow(`client disconnected from stream ${sessionId} (${watcherInfo.clients.size} remaining)`));
            // Remove client from git watcher
            git_watcher_js_1.gitWatcher.removeClient(sessionId, response);
            // If no more clients, stop watching
            if (watcherInfo.clients.size === 0) {
                logger.log(chalk_1.default.yellow(`stopping watcher for session ${sessionId} (no clients)`));
                if (watcherInfo.watcher) {
                    watcherInfo.watcher.close();
                }
                this.activeWatchers.delete(sessionId);
                // Stop git watching when no clients remain
                git_watcher_js_1.gitWatcher.stopWatching(sessionId);
            }
        }
    }
    /**
     * Send existing content to a client
     */
    sendExistingContent(sessionId, streamPath, client) {
        try {
            // Load existing session info or use defaults, but don't save incomplete session data
            const sessionInfo = this.sessionManager.loadSessionInfo(sessionId);
            // Validate offset to ensure we don't read beyond file size
            let startOffset = sessionInfo?.lastClearOffset ?? 0;
            if (fs.existsSync(streamPath)) {
                const stats = fs.statSync(streamPath);
                startOffset = Math.min(startOffset, stats.size);
            }
            // Read header line separately (first line of file)
            // We need to track byte position separately from string length due to UTF-8 encoding
            let header = null;
            let fd = null;
            try {
                fd = fs.openSync(streamPath, 'r');
                const buf = Buffer.alloc(HEADER_READ_BUFFER_SIZE);
                let data = '';
                // Important: Use filePosition (bytes) not data.length (characters) for fs.readSync
                // UTF-8 strings have character count != byte count for multi-byte characters
                let filePosition = 0; // Track actual byte position in file
                let bytesRead = fs.readSync(fd, buf, 0, buf.length, filePosition);
                while (!data.includes('\n') && bytesRead > 0) {
                    data += buf.toString('utf8', 0, bytesRead);
                    // Increment by actual bytes read, not string characters
                    // This ensures correct file positioning for subsequent reads
                    filePosition += bytesRead;
                    if (!data.includes('\n')) {
                        // Use filePosition (byte offset) not data.length (character count)
                        bytesRead = fs.readSync(fd, buf, 0, buf.length, filePosition);
                    }
                }
                const idx = data.indexOf('\n');
                if (idx !== -1) {
                    header = JSON.parse(data.slice(0, idx));
                }
            }
            catch (e) {
                logger.debug(`failed to read asciinema header for session ${sessionId}: ${e}`);
            }
            finally {
                // Ensure file descriptor is always closed to prevent leaks
                // This executes even if an exception occurs during read operations
                if (fd !== null) {
                    try {
                        fs.closeSync(fd);
                    }
                    catch (closeError) {
                        logger.debug(`failed to close file descriptor: ${closeError}`);
                    }
                }
            }
            // Analyze the stream starting from stored offset to find the most recent clear sequence
            // This allows us to prune old terminal content and only send what's currently visible
            const analysisStream = fs.createReadStream(streamPath, {
                encoding: 'utf8',
                start: startOffset,
            });
            let lineBuffer = '';
            const events = [];
            let lastClearIndex = -1;
            let lastResizeBeforeClear = null;
            let currentResize = null;
            // Track byte offset in the file for accurate position tracking
            // This is crucial for UTF-8 encoded files where character count != byte count
            let fileOffset = startOffset;
            let lastClearOffset = startOffset;
            analysisStream.on('data', (chunk) => {
                lineBuffer += chunk.toString();
                let index = lineBuffer.indexOf('\n');
                while (index !== -1) {
                    const line = lineBuffer.slice(0, index);
                    lineBuffer = lineBuffer.slice(index + 1);
                    // Calculate byte length of the line plus newline character
                    // Buffer.byteLength correctly handles multi-byte UTF-8 characters
                    fileOffset += Buffer.byteLength(line, 'utf8') + 1;
                    if (line.trim()) {
                        try {
                            const parsed = JSON.parse(line);
                            if (parsed.version && parsed.width && parsed.height) {
                                header = parsed;
                            }
                            else if (Array.isArray(parsed)) {
                                // Check if it's an exit event first
                                if (parsed[0] === 'exit') {
                                    events.push(parsed);
                                }
                                else if (parsed.length >= 3 && typeof parsed[0] === 'number') {
                                    const event = parsed;
                                    // Track resize events
                                    if (isResizeEvent(event)) {
                                        currentResize = event;
                                    }
                                    // Check for clear sequence in output events
                                    if (isOutputEvent(event) && (0, pruning_detector_js_1.containsPruningSequence)(event[2])) {
                                        const clearResult = this.processClearSequence(event, events.length, fileOffset, currentResize, line);
                                        if (clearResult) {
                                            lastClearIndex = clearResult.lastClearIndex;
                                            lastClearOffset = clearResult.lastClearOffset;
                                            lastResizeBeforeClear = clearResult.lastResizeBeforeClear;
                                        }
                                    }
                                    events.push(event);
                                }
                            }
                        }
                        catch (e) {
                            logger.debug(`skipping invalid JSON line during analysis: ${e}`);
                        }
                    }
                    index = lineBuffer.indexOf('\n');
                }
            });
            analysisStream.on('end', () => {
                // Process any remaining line in analysis
                if (lineBuffer.trim()) {
                    try {
                        const parsed = JSON.parse(lineBuffer);
                        fileOffset += Buffer.byteLength(lineBuffer, 'utf8');
                        if (Array.isArray(parsed)) {
                            if (parsed[0] === 'exit') {
                                events.push(parsed);
                            }
                            else if (parsed.length >= 3 && typeof parsed[0] === 'number') {
                                const event = parsed;
                                if (isResizeEvent(event)) {
                                    currentResize = event;
                                }
                                if (isOutputEvent(event) && (0, pruning_detector_js_1.containsPruningSequence)(event[2])) {
                                    const clearResult = this.processClearSequence(event, events.length, fileOffset, currentResize, lineBuffer);
                                    if (clearResult) {
                                        lastClearIndex = clearResult.lastClearIndex;
                                        lastClearOffset = clearResult.lastClearOffset;
                                        lastResizeBeforeClear = clearResult.lastResizeBeforeClear;
                                    }
                                }
                                events.push(event);
                            }
                        }
                    }
                    catch (e) {
                        logger.debug(`skipping invalid JSON in line buffer during analysis: ${e}`);
                    }
                }
                // Now replay the stream with pruning
                let startIndex = 0;
                if (lastClearIndex >= 0) {
                    // Start from after the last clear
                    startIndex = lastClearIndex + 1;
                    logger.log(chalk_1.default.green(`pruning stream: skipping ${lastClearIndex + 1} events before last clear at offset ${lastClearOffset}`));
                    // Persist new clear offset to session only if session already exists
                    if (sessionInfo) {
                        sessionInfo.lastClearOffset = lastClearOffset;
                        this.sessionManager.saveSessionInfo(sessionId, sessionInfo);
                    }
                }
                // Send header first - update dimensions if we have a resize
                if (header) {
                    const headerToSend = { ...header };
                    if (lastClearIndex >= 0 && lastResizeBeforeClear) {
                        // Update header with last known dimensions before clear
                        const dimensions = lastResizeBeforeClear[2].split('x');
                        headerToSend.width = Number.parseInt(dimensions[0], 10);
                        headerToSend.height = Number.parseInt(dimensions[1], 10);
                    }
                    client.response.write(`data: ${JSON.stringify(headerToSend)}\n\n`);
                }
                // Send remaining events
                let exitEventFound = false;
                for (let i = startIndex; i < events.length; i++) {
                    const event = events[i];
                    if (isExitEvent(event)) {
                        exitEventFound = true;
                        client.response.write(`data: ${JSON.stringify(event)}\n\n`);
                    }
                    else if (isOutputEvent(event) || isResizeEvent(event)) {
                        // Set timestamp to 0 for existing content
                        const instantEvent = [0, event[1], event[2]];
                        client.response.write(`data: ${JSON.stringify(instantEvent)}\n\n`);
                    }
                }
                // If exit event found, close connection
                if (exitEventFound) {
                    logger.log(chalk_1.default.yellow(`session ${client.response.locals?.sessionId || 'unknown'} already ended, closing stream`));
                    client.response.end();
                }
            });
            analysisStream.on('error', (error) => {
                logger.error('failed to analyze stream for pruning:', error);
                // If stream fails, client will simply not receive existing content
                // This is extremely rare and would indicate a serious filesystem issue
            });
        }
        catch (error) {
            logger.error('failed to create read stream:', error);
        }
    }
    /**
     * Start watching a file for changes
     */
    startWatching(sessionId, streamPath, watcherInfo) {
        logger.log(chalk_1.default.green(`started watching stream file for session ${sessionId}`));
        // Use standard fs.watch with stat checking
        watcherInfo.watcher = fs.watch(streamPath, { persistent: true }, (eventType) => {
            if (eventType === 'change') {
                try {
                    // Check if file actually changed by comparing stats
                    const stats = fs.statSync(streamPath);
                    // Only process if size increased (append-only file)
                    if (stats.size > watcherInfo.lastSize || stats.mtimeMs > watcherInfo.lastMtime) {
                        const sizeDiff = stats.size - watcherInfo.lastSize;
                        if (sizeDiff > 0) {
                            logger.debug(`file grew by ${sizeDiff} bytes`);
                        }
                        watcherInfo.lastSize = stats.size;
                        watcherInfo.lastMtime = stats.mtimeMs;
                        // Read only new data
                        if (stats.size > watcherInfo.lastOffset) {
                            const fd = fs.openSync(streamPath, 'r');
                            const buffer = Buffer.alloc(stats.size - watcherInfo.lastOffset);
                            fs.readSync(fd, buffer, 0, buffer.length, watcherInfo.lastOffset);
                            fs.closeSync(fd);
                            // Update offset
                            watcherInfo.lastOffset = stats.size;
                            // Process new data
                            const newData = buffer.toString('utf8');
                            watcherInfo.lineBuffer += newData;
                            // Process complete lines
                            const lines = watcherInfo.lineBuffer.split('\n');
                            watcherInfo.lineBuffer = lines.pop() || '';
                            for (const line of lines) {
                                if (line.trim()) {
                                    this.broadcastLine(sessionId, line, watcherInfo);
                                }
                            }
                        }
                    }
                }
                catch (error) {
                    logger.error('failed to read file changes:', error);
                }
            }
        });
        watcherInfo.watcher.on('error', (error) => {
            logger.error(`file watcher error for session ${sessionId}:`, error);
        });
    }
    /**
     * Broadcast a line to all clients
     */
    broadcastLine(sessionId, line, watcherInfo) {
        const parsed = this.parseAsciinemaLine(line);
        if (!parsed) {
            // Handle non-JSON as raw output
            logger.debug(`broadcasting raw output line: ${line.substring(0, 50)}...`);
            const currentTime = Date.now() / 1000;
            for (const client of watcherInfo.clients) {
                const castEvent = [currentTime - client.startTime, 'o', line];
                this.sendEventToClient(client, castEvent);
            }
            return;
        }
        // Skip duplicate headers
        if (!Array.isArray(parsed)) {
            return;
        }
        // Handle exit events
        if (isExitEvent(parsed)) {
            logger.log(chalk_1.default.yellow(`session ${sessionId} ended with exit code ${parsed[1]}`));
            for (const client of watcherInfo.clients) {
                this.sendEventToClient(client, parsed);
            }
            return;
        }
        // Log resize broadcasts at debug level only
        if (isResizeEvent(parsed)) {
            logger.debug(`Broadcasting resize ${parsed[2]} to ${watcherInfo.clients.size} clients`);
        }
        // Calculate relative timestamp for each client
        const currentTime = Date.now() / 1000;
        for (const client of watcherInfo.clients) {
            const relativeEvent = [currentTime - client.startTime, parsed[1], parsed[2]];
            try {
                client.response.write(`data: ${JSON.stringify(relativeEvent)}\n\n`);
                if (client.response.flush)
                    client.response.flush();
            }
            catch (error) {
                logger.debug(`client write failed (likely disconnected): ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
    /**
     * Start git watching for a session if it's in a git repository
     */
    async startGitWatching(sessionId, response) {
        try {
            const sessionInfo = this.sessionManager.loadSessionInfo(sessionId);
            if (sessionInfo?.gitRepoPath && sessionInfo.workingDir) {
                logger.debug(`Starting git watcher for session ${sessionId} at ${sessionInfo.gitRepoPath}`);
                await git_watcher_js_1.gitWatcher.startWatching(sessionId, sessionInfo.workingDir, sessionInfo.gitRepoPath);
                git_watcher_js_1.gitWatcher.addClient(sessionId, response);
            }
        }
        catch (error) {
            logger.error(`Failed to start git watching for session ${sessionId}:`, error);
        }
    }
    /**
     * Clean up all watchers and listeners
     */
    cleanup() {
        const watcherCount = this.activeWatchers.size;
        if (watcherCount > 0) {
            logger.log(chalk_1.default.yellow(`cleaning up ${watcherCount} active watchers`));
            for (const [sessionId, watcherInfo] of this.activeWatchers) {
                if (watcherInfo.watcher) {
                    watcherInfo.watcher.close();
                }
                logger.debug(`closed watcher for session ${sessionId}`);
            }
            this.activeWatchers.clear();
        }
        // Clean up git watchers
        git_watcher_js_1.gitWatcher.cleanup();
    }
}
exports.StreamWatcher = StreamWatcher;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RyZWFtLXdhdGNoZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2VydmVyL3NlcnZpY2VzL3N0cmVhbS13YXRjaGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGtEQUEwQjtBQUUxQix1Q0FBeUI7QUFHekIsa0RBQWtEO0FBQ2xELHNFQUtzQztBQUN0QyxxREFBOEM7QUFFOUMsTUFBTSxNQUFNLEdBQUcsSUFBQSx3QkFBWSxFQUFDLGdCQUFnQixDQUFDLENBQUM7QUFFOUMsWUFBWTtBQUNaLE1BQU0sdUJBQXVCLEdBQUcsSUFBSSxDQUFDO0FBa0JyQyx1QkFBdUI7QUFDdkIsU0FBUyxhQUFhLENBQUMsS0FBcUI7SUFDMUMsT0FBTyxDQUNMLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsSUFBSSxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxRQUFRLENBQy9GLENBQUM7QUFDSixDQUFDO0FBRUQsU0FBUyxhQUFhLENBQUMsS0FBcUI7SUFDMUMsT0FBTyxDQUNMLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsSUFBSSxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxRQUFRLENBQy9GLENBQUM7QUFDSixDQUFDO0FBRUQsU0FBUyxXQUFXLENBQUMsS0FBcUI7SUFDeEMsT0FBTyxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxNQUFNLENBQUM7QUFDckQsQ0FBQztBQVdELE1BQWEsYUFBYTtJQUl4QixZQUFZLGNBQThC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O09BRUc7SUFDSyxPQUFPO1FBQ2IsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUM7UUFDOUMsSUFBSSxZQUFZLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDckIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxlQUFLLENBQUMsTUFBTSxDQUFDLGVBQWUsWUFBWSxrQkFBa0IsQ0FBQyxDQUFDLENBQUM7WUFDeEUsS0FBSyxNQUFNLENBQUMsU0FBUyxFQUFFLFdBQVcsQ0FBQyxJQUFJLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztnQkFDM0QsSUFBSSxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUM7b0JBQ3hCLFdBQVcsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQzlCLENBQUM7Z0JBQ0QsTUFBTSxDQUFDLEtBQUssQ0FBQyw4QkFBOEIsU0FBUyxFQUFFLENBQUMsQ0FBQztZQUMxRCxDQUFDO1lBQ0QsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUM5QixDQUFDO1FBQ0Qsd0JBQXdCO1FBQ3hCLDJCQUFVLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDdkIsQ0FBQztDQUNGO0FBdmxCRCxzQ0F1bEJDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGNoYWxrIGZyb20gJ2NoYWxrJztcbmltcG9ydCB0eXBlIHsgUmVzcG9uc2UgfSBmcm9tICdleHByZXNzJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCB0eXBlIHsgU2Vzc2lvbk1hbmFnZXIgfSBmcm9tICcuLi9wdHkvc2Vzc2lvbi1tYW5hZ2VyLmpzJztcbmltcG9ydCB0eXBlIHsgQXNjaWluZW1hSGVhZGVyIH0gZnJvbSAnLi4vcHR5L3R5cGVzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUxvZ2dlciB9IGZyb20gJy4uL3V0aWxzL2xvZ2dlci5qcyc7XG5pbXBvcnQge1xuICBjYWxjdWxhdGVQcnVuaW5nUG9zaXRpb25JbkZpbGUsXG4gIGNvbnRhaW5zUHJ1bmluZ1NlcXVlbmNlLFxuICBmaW5kTGFzdFBydW5lUG9pbnQsXG4gIGxvZ1BydW5pbmdEZXRlY3Rpb24sXG59IGZyb20gJy4uL3V0aWxzL3BydW5pbmctZGV0ZWN0b3IuanMnO1xuaW1wb3J0IHsgZ2l0V2F0Y2hlciB9IGZyb20gJy4vZ2l0LXdhdGNoZXIuanMnO1xuXG5jb25zdCBsb2dnZXIgPSBjcmVhdGVMb2dnZXIoJ3N0cmVhbS13YXRjaGVyJyk7XG5cbi8vIENvbnN0YW50c1xuY29uc3QgSEVBREVSX1JFQURfQlVGRkVSX1NJWkUgPSA0MDk2O1xuXG5pbnRlcmZhY2UgU3RyZWFtQ2xpZW50IHtcbiAgcmVzcG9uc2U6IFJlc3BvbnNlO1xuICBzdGFydFRpbWU6IG51bWJlcjtcbn1cblxuLy8gVHlwZSBmb3IgYXNjaWluZW1hIGV2ZW50IGFycmF5IGZvcm1hdFxudHlwZSBBc2NpaW5lbWFPdXRwdXRFdmVudCA9IFtudW1iZXIsICdvJywgc3RyaW5nXTtcbnR5cGUgQXNjaWluZW1hSW5wdXRFdmVudCA9IFtudW1iZXIsICdpJywgc3RyaW5nXTtcbnR5cGUgQXNjaWluZW1hUmVzaXplRXZlbnQgPSBbbnVtYmVyLCAncicsIHN0cmluZ107XG50eXBlIEFzY2lpbmVtYUV4aXRFdmVudCA9IFsnZXhpdCcsIG51bWJlciwgc3RyaW5nXTtcbnR5cGUgQXNjaWluZW1hRXZlbnQgPVxuICB8IEFzY2lpbmVtYU91dHB1dEV2ZW50XG4gIHwgQXNjaWluZW1hSW5wdXRFdmVudFxuICB8IEFzY2lpbmVtYVJlc2l6ZUV2ZW50XG4gIHwgQXNjaWluZW1hRXhpdEV2ZW50O1xuXG4vLyBUeXBlIGd1YXJkIGZ1bmN0aW9uc1xuZnVuY3Rpb24gaXNPdXRwdXRFdmVudChldmVudDogQXNjaWluZW1hRXZlbnQpOiBldmVudCBpcyBBc2NpaW5lbWFPdXRwdXRFdmVudCB7XG4gIHJldHVybiAoXG4gICAgQXJyYXkuaXNBcnJheShldmVudCkgJiYgZXZlbnQubGVuZ3RoID09PSAzICYmIGV2ZW50WzFdID09PSAnbycgJiYgdHlwZW9mIGV2ZW50WzBdID09PSAnbnVtYmVyJ1xuICApO1xufVxuXG5mdW5jdGlvbiBpc1Jlc2l6ZUV2ZW50KGV2ZW50OiBBc2NpaW5lbWFFdmVudCk6IGV2ZW50IGlzIEFzY2lpbmVtYVJlc2l6ZUV2ZW50IHtcbiAgcmV0dXJuIChcbiAgICBBcnJheS5pc0FycmF5KGV2ZW50KSAmJiBldmVudC5sZW5ndGggPT09IDMgJiYgZXZlbnRbMV0gPT09ICdyJyAmJiB0eXBlb2YgZXZlbnRbMF0gPT09ICdudW1iZXInXG4gICk7XG59XG5cbmZ1bmN0aW9uIGlzRXhpdEV2ZW50KGV2ZW50OiBBc2NpaW5lbWFFdmVudCk6IGV2ZW50IGlzIEFzY2lpbmVtYUV4aXRFdmVudCB7XG4gIHJldHVybiBBcnJheS5pc0FycmF5KGV2ZW50KSAmJiBldmVudFswXSA9PT0gJ2V4aXQnO1xufVxuXG5pbnRlcmZhY2UgV2F0Y2hlckluZm8ge1xuICBjbGllbnRzOiBTZXQ8U3RyZWFtQ2xpZW50PjtcbiAgd2F0Y2hlcj86IGZzLkZTV2F0Y2hlcjtcbiAgbGFzdE9mZnNldDogbnVtYmVyO1xuICBsYXN0U2l6ZTogbnVtYmVyO1xuICBsYXN0TXRpbWU6IG51bWJlcjtcbiAgbGluZUJ1ZmZlcjogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgU3RyZWFtV2F0Y2hlciB7XG4gIHByaXZhdGUgYWN0aXZlV2F0Y2hlcnM6IE1hcDxzdHJpbmcsIFdhdGNoZXJJbmZvPiA9IG5ldyBNYXAoKTtcbiAgcHJpdmF0ZSBzZXNzaW9uTWFuYWdlcjogU2Vzc2lvbk1hbmFnZXI7XG5cbiAgY29uc3RydWN0b3Ioc2Vzc2lvbk1hbmFnZXI6IFNlc3Npb25NYW5hZ2VyKSB7XG4gICAgdGhpcy5zZXNzaW9uTWFuYWdlciA9IHNlc3Npb25NYW5hZ2VyO1xuICAgIC8vIENsZWFuIHVwIG5vdGlmaWNhdGlvbiBsaXN0ZW5lcnMgb24gZXhpdFxuICAgIHByb2Nlc3Mub24oJ2JlZm9yZUV4aXQnLCAoKSA9PiB7XG4gICAgICB0aGlzLmNsZWFudXAoKTtcbiAgICB9KTtcbiAgICBsb2dnZXIuZGVidWcoJ3N0cmVhbSB3YXRjaGVyIGluaXRpYWxpemVkJyk7XG4gIH1cblxuICAvKipcbiAgICogUHJvY2VzcyBhIGNsZWFyIHNlcXVlbmNlIGV2ZW50IGFuZCB1cGRhdGUgdHJhY2tpbmcgdmFyaWFibGVzXG4gICAqL1xuICBwcml2YXRlIHByb2Nlc3NDbGVhclNlcXVlbmNlKFxuICAgIGV2ZW50OiBBc2NpaW5lbWFPdXRwdXRFdmVudCxcbiAgICBldmVudEluZGV4OiBudW1iZXIsXG4gICAgZmlsZU9mZnNldDogbnVtYmVyLFxuICAgIGN1cnJlbnRSZXNpemU6IEFzY2lpbmVtYVJlc2l6ZUV2ZW50IHwgbnVsbCxcbiAgICBldmVudExpbmU6IHN0cmluZ1xuICApOiB7XG4gICAgbGFzdENsZWFySW5kZXg6IG51bWJlcjtcbiAgICBsYXN0Q2xlYXJPZmZzZXQ6IG51bWJlcjtcbiAgICBsYXN0UmVzaXplQmVmb3JlQ2xlYXI6IEFzY2lpbmVtYVJlc2l6ZUV2ZW50IHwgbnVsbDtcbiAgfSB8IG51bGwge1xuICAgIGNvbnN0IHBydW5lUG9pbnQgPSBmaW5kTGFzdFBydW5lUG9pbnQoZXZlbnRbMl0pO1xuICAgIGlmICghcHJ1bmVQb2ludCkgcmV0dXJuIG51bGw7XG5cbiAgICAvLyBDYWxjdWxhdGUgcHJlY2lzZSBvZmZzZXQgdXNpbmcgc2hhcmVkIHV0aWxpdHlcbiAgICBjb25zdCBsYXN0Q2xlYXJPZmZzZXQgPSBjYWxjdWxhdGVQcnVuaW5nUG9zaXRpb25JbkZpbGUoXG4gICAgICBmaWxlT2Zmc2V0LFxuICAgICAgZXZlbnRMaW5lLFxuICAgICAgcHJ1bmVQb2ludC5wb3NpdGlvblxuICAgICk7XG5cbiAgICAvLyBVc2Ugc2hhcmVkIGxvZ2dpbmcgZnVuY3Rpb25cbiAgICBsb2dQcnVuaW5nRGV0ZWN0aW9uKHBydW5lUG9pbnQuc2VxdWVuY2UsIGxhc3RDbGVhck9mZnNldCwgJyhyZXRyb2FjdGl2ZSBzY2FuKScpO1xuXG4gICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgYGZvdW5kIGF0IGV2ZW50IGluZGV4ICR7ZXZlbnRJbmRleH0sIGAgK1xuICAgICAgICBgY3VycmVudCByZXNpemU6ICR7Y3VycmVudFJlc2l6ZSA/IGN1cnJlbnRSZXNpemVbMl0gOiAnbm9uZSd9YFxuICAgICk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgbGFzdENsZWFySW5kZXg6IGV2ZW50SW5kZXgsXG4gICAgICBsYXN0Q2xlYXJPZmZzZXQsXG4gICAgICBsYXN0UmVzaXplQmVmb3JlQ2xlYXI6IGN1cnJlbnRSZXNpemUsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBQYXJzZSBhIGxpbmUgb2YgYXNjaWluZW1hIGRhdGEgYW5kIHJldHVybiB0aGUgcGFyc2VkIGV2ZW50XG4gICAqL1xuICBwcml2YXRlIHBhcnNlQXNjaWluZW1hTGluZShsaW5lOiBzdHJpbmcpOiBBc2NpaW5lbWFFdmVudCB8IEFzY2lpbmVtYUhlYWRlciB8IG51bGwge1xuICAgIGlmICghbGluZS50cmltKCkpIHJldHVybiBudWxsO1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UobGluZSk7XG5cbiAgICAgIC8vIENoZWNrIGlmIGl0J3MgYSBoZWFkZXJcbiAgICAgIGlmIChwYXJzZWQudmVyc2lvbiAmJiBwYXJzZWQud2lkdGggJiYgcGFyc2VkLmhlaWdodCkge1xuICAgICAgICByZXR1cm4gcGFyc2VkIGFzIEFzY2lpbmVtYUhlYWRlcjtcbiAgICAgIH1cblxuICAgICAgLy8gQ2hlY2sgaWYgaXQncyBhbiBldmVudFxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkocGFyc2VkKSkge1xuICAgICAgICBpZiAocGFyc2VkWzBdID09PSAnZXhpdCcpIHtcbiAgICAgICAgICByZXR1cm4gcGFyc2VkIGFzIEFzY2lpbmVtYUV4aXRFdmVudDtcbiAgICAgICAgfSBlbHNlIGlmIChwYXJzZWQubGVuZ3RoID49IDMgJiYgdHlwZW9mIHBhcnNlZFswXSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICByZXR1cm4gcGFyc2VkIGFzIEFzY2lpbmVtYUV2ZW50O1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBudWxsO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ2dlci5kZWJ1Zyhgc2tpcHBpbmcgaW52YWxpZCBKU09OIGxpbmU6ICR7ZX1gKTtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTZW5kIGFuIGV2ZW50IHRvIHRoZSBjbGllbnQgd2l0aCBwcm9wZXIgZm9ybWF0dGluZ1xuICAgKi9cbiAgcHJpdmF0ZSBzZW5kRXZlbnRUb0NsaWVudChcbiAgICBjbGllbnQ6IFN0cmVhbUNsaWVudCxcbiAgICBldmVudDogQXNjaWluZW1hRXZlbnQgfCBBc2NpaW5lbWFIZWFkZXIsXG4gICAgbWFrZUluc3RhbnQ6IGJvb2xlYW4gPSBmYWxzZVxuICApOiB2b2lkIHtcbiAgICB0cnkge1xuICAgICAgbGV0IGRhdGFUb1NlbmQ6IEFzY2lpbmVtYUV2ZW50IHwgQXNjaWluZW1hSGVhZGVyID0gZXZlbnQ7XG5cbiAgICAgIC8vIEZvciBleGlzdGluZyBjb250ZW50LCBzZXQgdGltZXN0YW1wIHRvIDBcbiAgICAgIGlmIChcbiAgICAgICAgbWFrZUluc3RhbnQgJiZcbiAgICAgICAgQXJyYXkuaXNBcnJheShldmVudCkgJiZcbiAgICAgICAgZXZlbnQubGVuZ3RoID49IDMgJiZcbiAgICAgICAgdHlwZW9mIGV2ZW50WzBdID09PSAnbnVtYmVyJ1xuICAgICAgKSB7XG4gICAgICAgIGRhdGFUb1NlbmQgPSBbMCwgZXZlbnRbMV0sIGV2ZW50WzJdXTtcbiAgICAgIH1cblxuICAgICAgY2xpZW50LnJlc3BvbnNlLndyaXRlKGBkYXRhOiAke0pTT04uc3RyaW5naWZ5KGRhdGFUb1NlbmQpfVxcblxcbmApO1xuXG4gICAgICAvLyBIYW5kbGUgZXhpdCBldmVudHNcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KGV2ZW50KSAmJiBpc0V4aXRFdmVudChldmVudCkpIHtcbiAgICAgICAgbG9nZ2VyLmxvZyhcbiAgICAgICAgICBjaGFsay55ZWxsb3coXG4gICAgICAgICAgICBgc2Vzc2lvbiAke2NsaWVudC5yZXNwb25zZS5sb2NhbHM/LnNlc3Npb25JZCB8fCAndW5rbm93bid9IGFscmVhZHkgZW5kZWQsIGNsb3Npbmcgc3RyZWFtYFxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgICAgY2xpZW50LnJlc3BvbnNlLmVuZCgpO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgIGBjbGllbnQgd3JpdGUgZmFpbGVkIChsaWtlbHkgZGlzY29ubmVjdGVkKTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQWRkIGEgY2xpZW50IHRvIHdhdGNoIGEgc3RyZWFtIGZpbGVcbiAgICovXG4gIGFkZENsaWVudChzZXNzaW9uSWQ6IHN0cmluZywgc3RyZWFtUGF0aDogc3RyaW5nLCByZXNwb25zZTogUmVzcG9uc2UpOiB2b2lkIHtcbiAgICBsb2dnZXIuZGVidWcoYGFkZGluZyBjbGllbnQgdG8gc2Vzc2lvbiAke3Nlc3Npb25JZH1gKTtcbiAgICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpIC8gMTAwMDtcbiAgICBjb25zdCBjbGllbnQ6IFN0cmVhbUNsaWVudCA9IHsgcmVzcG9uc2UsIHN0YXJ0VGltZSB9O1xuXG4gICAgbGV0IHdhdGNoZXJJbmZvID0gdGhpcy5hY3RpdmVXYXRjaGVycy5nZXQoc2Vzc2lvbklkKTtcblxuICAgIGlmICghd2F0Y2hlckluZm8pIHtcbiAgICAgIC8vIENyZWF0ZSBuZXcgd2F0Y2hlciBmb3IgdGhpcyBzZXNzaW9uXG4gICAgICBsb2dnZXIubG9nKGNoYWxrLmdyZWVuKGBjcmVhdGluZyBuZXcgc3RyZWFtIHdhdGNoZXIgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9YCkpO1xuICAgICAgd2F0Y2hlckluZm8gPSB7XG4gICAgICAgIGNsaWVudHM6IG5ldyBTZXQoKSxcbiAgICAgICAgbGFzdE9mZnNldDogMCxcbiAgICAgICAgbGFzdFNpemU6IDAsXG4gICAgICAgIGxhc3RNdGltZTogMCxcbiAgICAgICAgbGluZUJ1ZmZlcjogJycsXG4gICAgICB9O1xuICAgICAgdGhpcy5hY3RpdmVXYXRjaGVycy5zZXQoc2Vzc2lvbklkLCB3YXRjaGVySW5mbyk7XG5cbiAgICAgIC8vIFNlbmQgZXhpc3RpbmcgY29udGVudCBmaXJzdFxuICAgICAgdGhpcy5zZW5kRXhpc3RpbmdDb250ZW50KHNlc3Npb25JZCwgc3RyZWFtUGF0aCwgY2xpZW50KTtcblxuICAgICAgLy8gR2V0IGN1cnJlbnQgZmlsZSBzaXplIGFuZCBzdGF0c1xuICAgICAgaWYgKGZzLmV4aXN0c1N5bmMoc3RyZWFtUGF0aCkpIHtcbiAgICAgICAgY29uc3Qgc3RhdHMgPSBmcy5zdGF0U3luYyhzdHJlYW1QYXRoKTtcbiAgICAgICAgd2F0Y2hlckluZm8ubGFzdE9mZnNldCA9IHN0YXRzLnNpemU7XG4gICAgICAgIHdhdGNoZXJJbmZvLmxhc3RTaXplID0gc3RhdHMuc2l6ZTtcbiAgICAgICAgd2F0Y2hlckluZm8ubGFzdE10aW1lID0gc3RhdHMubXRpbWVNcztcbiAgICAgICAgbG9nZ2VyLmRlYnVnKGBpbml0aWFsIGZpbGUgc2l6ZTogJHtzdGF0cy5zaXplfSBieXRlc2ApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKGBzdHJlYW0gZmlsZSBkb2VzIG5vdCBleGlzdCB5ZXQ6ICR7c3RyZWFtUGF0aH1gKTtcbiAgICAgIH1cblxuICAgICAgLy8gU3RhcnQgd2F0Y2hpbmcgZm9yIG5ldyBjb250ZW50XG4gICAgICB0aGlzLnN0YXJ0V2F0Y2hpbmcoc2Vzc2lvbklkLCBzdHJlYW1QYXRoLCB3YXRjaGVySW5mbyk7XG5cbiAgICAgIC8vIFN0YXJ0IGdpdCB3YXRjaGluZyBpZiB0aGlzIGlzIGEgZ2l0IHJlcG9zaXRvcnlcbiAgICAgIHRoaXMuc3RhcnRHaXRXYXRjaGluZyhzZXNzaW9uSWQsIHJlc3BvbnNlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gU2VuZCBleGlzdGluZyBjb250ZW50IHRvIG5ldyBjbGllbnRcbiAgICAgIHRoaXMuc2VuZEV4aXN0aW5nQ29udGVudChzZXNzaW9uSWQsIHN0cmVhbVBhdGgsIGNsaWVudCk7XG5cbiAgICAgIC8vIEFkZCB0aGlzIGNsaWVudCB0byBnaXQgd2F0Y2hlclxuICAgICAgZ2l0V2F0Y2hlci5hZGRDbGllbnQoc2Vzc2lvbklkLCByZXNwb25zZSk7XG4gICAgfVxuXG4gICAgLy8gQWRkIGNsaWVudCB0byBzZXRcbiAgICB3YXRjaGVySW5mby5jbGllbnRzLmFkZChjbGllbnQpO1xuICAgIGxvZ2dlci5sb2coXG4gICAgICBjaGFsay5ibHVlKGBjbGllbnQgY29ubmVjdGVkIHRvIHN0cmVhbSAke3Nlc3Npb25JZH0gKCR7d2F0Y2hlckluZm8uY2xpZW50cy5zaXplfSB0b3RhbClgKVxuICAgICk7XG4gIH1cblxuICAvKipcbiAgICogUmVtb3ZlIGEgY2xpZW50XG4gICAqL1xuICByZW1vdmVDbGllbnQoc2Vzc2lvbklkOiBzdHJpbmcsIHJlc3BvbnNlOiBSZXNwb25zZSk6IHZvaWQge1xuICAgIGNvbnN0IHdhdGNoZXJJbmZvID0gdGhpcy5hY3RpdmVXYXRjaGVycy5nZXQoc2Vzc2lvbklkKTtcbiAgICBpZiAoIXdhdGNoZXJJbmZvKSB7XG4gICAgICBsb2dnZXIuZGVidWcoYG5vIHdhdGNoZXIgZm91bmQgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9YCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gRmluZCBhbmQgcmVtb3ZlIGNsaWVudFxuICAgIGxldCBjbGllbnRUb1JlbW92ZTogU3RyZWFtQ2xpZW50IHwgdW5kZWZpbmVkO1xuICAgIGZvciAoY29uc3QgY2xpZW50IG9mIHdhdGNoZXJJbmZvLmNsaWVudHMpIHtcbiAgICAgIGlmIChjbGllbnQucmVzcG9uc2UgPT09IHJlc3BvbnNlKSB7XG4gICAgICAgIGNsaWVudFRvUmVtb3ZlID0gY2xpZW50O1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoY2xpZW50VG9SZW1vdmUpIHtcbiAgICAgIHdhdGNoZXJJbmZvLmNsaWVudHMuZGVsZXRlKGNsaWVudFRvUmVtb3ZlKTtcbiAgICAgIGxvZ2dlci5sb2coXG4gICAgICAgIGNoYWxrLnllbGxvdyhcbiAgICAgICAgICBgY2xpZW50IGRpc2Nvbm5lY3RlZCBmcm9tIHN0cmVhbSAke3Nlc3Npb25JZH0gKCR7d2F0Y2hlckluZm8uY2xpZW50cy5zaXplfSByZW1haW5pbmcpYFxuICAgICAgICApXG4gICAgICApO1xuXG4gICAgICAvLyBSZW1vdmUgY2xpZW50IGZyb20gZ2l0IHdhdGNoZXJcbiAgICAgIGdpdFdhdGNoZXIucmVtb3ZlQ2xpZW50KHNlc3Npb25JZCwgcmVzcG9uc2UpO1xuXG4gICAgICAvLyBJZiBubyBtb3JlIGNsaWVudHMsIHN0b3Agd2F0Y2hpbmdcbiAgICAgIGlmICh3YXRjaGVySW5mby5jbGllbnRzLnNpemUgPT09IDApIHtcbiAgICAgICAgbG9nZ2VyLmxvZyhjaGFsay55ZWxsb3coYHN0b3BwaW5nIHdhdGNoZXIgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9IChubyBjbGllbnRzKWApKTtcbiAgICAgICAgaWYgKHdhdGNoZXJJbmZvLndhdGNoZXIpIHtcbiAgICAgICAgICB3YXRjaGVySW5mby53YXRjaGVyLmNsb3NlKCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5hY3RpdmVXYXRjaGVycy5kZWxldGUoc2Vzc2lvbklkKTtcblxuICAgICAgICAvLyBTdG9wIGdpdCB3YXRjaGluZyB3aGVuIG5vIGNsaWVudHMgcmVtYWluXG4gICAgICAgIGdpdFdhdGNoZXIuc3RvcFdhdGNoaW5nKHNlc3Npb25JZCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFNlbmQgZXhpc3RpbmcgY29udGVudCB0byBhIGNsaWVudFxuICAgKi9cbiAgcHJpdmF0ZSBzZW5kRXhpc3RpbmdDb250ZW50KHNlc3Npb25JZDogc3RyaW5nLCBzdHJlYW1QYXRoOiBzdHJpbmcsIGNsaWVudDogU3RyZWFtQ2xpZW50KTogdm9pZCB7XG4gICAgdHJ5IHtcbiAgICAgIC8vIExvYWQgZXhpc3Rpbmcgc2Vzc2lvbiBpbmZvIG9yIHVzZSBkZWZhdWx0cywgYnV0IGRvbid0IHNhdmUgaW5jb21wbGV0ZSBzZXNzaW9uIGRhdGFcbiAgICAgIGNvbnN0IHNlc3Npb25JbmZvID0gdGhpcy5zZXNzaW9uTWFuYWdlci5sb2FkU2Vzc2lvbkluZm8oc2Vzc2lvbklkKTtcblxuICAgICAgLy8gVmFsaWRhdGUgb2Zmc2V0IHRvIGVuc3VyZSB3ZSBkb24ndCByZWFkIGJleW9uZCBmaWxlIHNpemVcbiAgICAgIGxldCBzdGFydE9mZnNldCA9IHNlc3Npb25JbmZvPy5sYXN0Q2xlYXJPZmZzZXQgPz8gMDtcbiAgICAgIGlmIChmcy5leGlzdHNTeW5jKHN0cmVhbVBhdGgpKSB7XG4gICAgICAgIGNvbnN0IHN0YXRzID0gZnMuc3RhdFN5bmMoc3RyZWFtUGF0aCk7XG4gICAgICAgIHN0YXJ0T2Zmc2V0ID0gTWF0aC5taW4oc3RhcnRPZmZzZXQsIHN0YXRzLnNpemUpO1xuICAgICAgfVxuXG4gICAgICAvLyBSZWFkIGhlYWRlciBsaW5lIHNlcGFyYXRlbHkgKGZpcnN0IGxpbmUgb2YgZmlsZSlcbiAgICAgIC8vIFdlIG5lZWQgdG8gdHJhY2sgYnl0ZSBwb3NpdGlvbiBzZXBhcmF0ZWx5IGZyb20gc3RyaW5nIGxlbmd0aCBkdWUgdG8gVVRGLTggZW5jb2RpbmdcbiAgICAgIGxldCBoZWFkZXI6IEFzY2lpbmVtYUhlYWRlciB8IG51bGwgPSBudWxsO1xuICAgICAgbGV0IGZkOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbiAgICAgIHRyeSB7XG4gICAgICAgIGZkID0gZnMub3BlblN5bmMoc3RyZWFtUGF0aCwgJ3InKTtcbiAgICAgICAgY29uc3QgYnVmID0gQnVmZmVyLmFsbG9jKEhFQURFUl9SRUFEX0JVRkZFUl9TSVpFKTtcbiAgICAgICAgbGV0IGRhdGEgPSAnJztcblxuICAgICAgICAvLyBJbXBvcnRhbnQ6IFVzZSBmaWxlUG9zaXRpb24gKGJ5dGVzKSBub3QgZGF0YS5sZW5ndGggKGNoYXJhY3RlcnMpIGZvciBmcy5yZWFkU3luY1xuICAgICAgICAvLyBVVEYtOCBzdHJpbmdzIGhhdmUgY2hhcmFjdGVyIGNvdW50ICE9IGJ5dGUgY291bnQgZm9yIG11bHRpLWJ5dGUgY2hhcmFjdGVyc1xuICAgICAgICBsZXQgZmlsZVBvc2l0aW9uID0gMDsgLy8gVHJhY2sgYWN0dWFsIGJ5dGUgcG9zaXRpb24gaW4gZmlsZVxuICAgICAgICBsZXQgYnl0ZXNSZWFkID0gZnMucmVhZFN5bmMoZmQsIGJ1ZiwgMCwgYnVmLmxlbmd0aCwgZmlsZVBvc2l0aW9uKTtcblxuICAgICAgICB3aGlsZSAoIWRhdGEuaW5jbHVkZXMoJ1xcbicpICYmIGJ5dGVzUmVhZCA+IDApIHtcbiAgICAgICAgICBkYXRhICs9IGJ1Zi50b1N0cmluZygndXRmOCcsIDAsIGJ5dGVzUmVhZCk7XG5cbiAgICAgICAgICAvLyBJbmNyZW1lbnQgYnkgYWN0dWFsIGJ5dGVzIHJlYWQsIG5vdCBzdHJpbmcgY2hhcmFjdGVyc1xuICAgICAgICAgIC8vIFRoaXMgZW5zdXJlcyBjb3JyZWN0IGZpbGUgcG9zaXRpb25pbmcgZm9yIHN1YnNlcXVlbnQgcmVhZHNcbiAgICAgICAgICBmaWxlUG9zaXRpb24gKz0gYnl0ZXNSZWFkO1xuXG4gICAgICAgICAgaWYgKCFkYXRhLmluY2x1ZGVzKCdcXG4nKSkge1xuICAgICAgICAgICAgLy8gVXNlIGZpbGVQb3NpdGlvbiAoYnl0ZSBvZmZzZXQpIG5vdCBkYXRhLmxlbmd0aCAoY2hhcmFjdGVyIGNvdW50KVxuICAgICAgICAgICAgYnl0ZXNSZWFkID0gZnMucmVhZFN5bmMoZmQsIGJ1ZiwgMCwgYnVmLmxlbmd0aCwgZmlsZVBvc2l0aW9uKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBpZHggPSBkYXRhLmluZGV4T2YoJ1xcbicpO1xuICAgICAgICBpZiAoaWR4ICE9PSAtMSkge1xuICAgICAgICAgIGhlYWRlciA9IEpTT04ucGFyc2UoZGF0YS5zbGljZSgwLCBpZHgpKTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dnZXIuZGVidWcoYGZhaWxlZCB0byByZWFkIGFzY2lpbmVtYSBoZWFkZXIgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9OiAke2V9YCk7XG4gICAgICB9IGZpbmFsbHkge1xuICAgICAgICAvLyBFbnN1cmUgZmlsZSBkZXNjcmlwdG9yIGlzIGFsd2F5cyBjbG9zZWQgdG8gcHJldmVudCBsZWFrc1xuICAgICAgICAvLyBUaGlzIGV4ZWN1dGVzIGV2ZW4gaWYgYW4gZXhjZXB0aW9uIG9jY3VycyBkdXJpbmcgcmVhZCBvcGVyYXRpb25zXG4gICAgICAgIGlmIChmZCAhPT0gbnVsbCkge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBmcy5jbG9zZVN5bmMoZmQpO1xuICAgICAgICAgIH0gY2F0Y2ggKGNsb3NlRXJyb3IpIHtcbiAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgZmFpbGVkIHRvIGNsb3NlIGZpbGUgZGVzY3JpcHRvcjogJHtjbG9zZUVycm9yfWApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBBbmFseXplIHRoZSBzdHJlYW0gc3RhcnRpbmcgZnJvbSBzdG9yZWQgb2Zmc2V0IHRvIGZpbmQgdGhlIG1vc3QgcmVjZW50IGNsZWFyIHNlcXVlbmNlXG4gICAgICAvLyBUaGlzIGFsbG93cyB1cyB0byBwcnVuZSBvbGQgdGVybWluYWwgY29udGVudCBhbmQgb25seSBzZW5kIHdoYXQncyBjdXJyZW50bHkgdmlzaWJsZVxuICAgICAgY29uc3QgYW5hbHlzaXNTdHJlYW0gPSBmcy5jcmVhdGVSZWFkU3RyZWFtKHN0cmVhbVBhdGgsIHtcbiAgICAgICAgZW5jb2Rpbmc6ICd1dGY4JyxcbiAgICAgICAgc3RhcnQ6IHN0YXJ0T2Zmc2V0LFxuICAgICAgfSk7XG4gICAgICBsZXQgbGluZUJ1ZmZlciA9ICcnO1xuICAgICAgY29uc3QgZXZlbnRzOiBBc2NpaW5lbWFFdmVudFtdID0gW107XG4gICAgICBsZXQgbGFzdENsZWFySW5kZXggPSAtMTtcbiAgICAgIGxldCBsYXN0UmVzaXplQmVmb3JlQ2xlYXI6IEFzY2lpbmVtYVJlc2l6ZUV2ZW50IHwgbnVsbCA9IG51bGw7XG4gICAgICBsZXQgY3VycmVudFJlc2l6ZTogQXNjaWluZW1hUmVzaXplRXZlbnQgfCBudWxsID0gbnVsbDtcblxuICAgICAgLy8gVHJhY2sgYnl0ZSBvZmZzZXQgaW4gdGhlIGZpbGUgZm9yIGFjY3VyYXRlIHBvc2l0aW9uIHRyYWNraW5nXG4gICAgICAvLyBUaGlzIGlzIGNydWNpYWwgZm9yIFVURi04IGVuY29kZWQgZmlsZXMgd2hlcmUgY2hhcmFjdGVyIGNvdW50ICE9IGJ5dGUgY291bnRcbiAgICAgIGxldCBmaWxlT2Zmc2V0ID0gc3RhcnRPZmZzZXQ7XG4gICAgICBsZXQgbGFzdENsZWFyT2Zmc2V0ID0gc3RhcnRPZmZzZXQ7XG5cbiAgICAgIGFuYWx5c2lzU3RyZWFtLm9uKCdkYXRhJywgKGNodW5rOiBzdHJpbmcgfCBCdWZmZXIpID0+IHtcbiAgICAgICAgbGluZUJ1ZmZlciArPSBjaHVuay50b1N0cmluZygpO1xuICAgICAgICBsZXQgaW5kZXggPSBsaW5lQnVmZmVyLmluZGV4T2YoJ1xcbicpO1xuICAgICAgICB3aGlsZSAoaW5kZXggIT09IC0xKSB7XG4gICAgICAgICAgY29uc3QgbGluZSA9IGxpbmVCdWZmZXIuc2xpY2UoMCwgaW5kZXgpO1xuICAgICAgICAgIGxpbmVCdWZmZXIgPSBsaW5lQnVmZmVyLnNsaWNlKGluZGV4ICsgMSk7XG5cbiAgICAgICAgICAvLyBDYWxjdWxhdGUgYnl0ZSBsZW5ndGggb2YgdGhlIGxpbmUgcGx1cyBuZXdsaW5lIGNoYXJhY3RlclxuICAgICAgICAgIC8vIEJ1ZmZlci5ieXRlTGVuZ3RoIGNvcnJlY3RseSBoYW5kbGVzIG11bHRpLWJ5dGUgVVRGLTggY2hhcmFjdGVyc1xuICAgICAgICAgIGZpbGVPZmZzZXQgKz0gQnVmZmVyLmJ5dGVMZW5ndGgobGluZSwgJ3V0ZjgnKSArIDE7XG5cbiAgICAgICAgICBpZiAobGluZS50cmltKCkpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UobGluZSk7XG4gICAgICAgICAgICAgIGlmIChwYXJzZWQudmVyc2lvbiAmJiBwYXJzZWQud2lkdGggJiYgcGFyc2VkLmhlaWdodCkge1xuICAgICAgICAgICAgICAgIGhlYWRlciA9IHBhcnNlZDtcbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHBhcnNlZCkpIHtcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiBpdCdzIGFuIGV4aXQgZXZlbnQgZmlyc3RcbiAgICAgICAgICAgICAgICBpZiAocGFyc2VkWzBdID09PSAnZXhpdCcpIHtcbiAgICAgICAgICAgICAgICAgIGV2ZW50cy5wdXNoKHBhcnNlZCBhcyBBc2NpaW5lbWFFeGl0RXZlbnQpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocGFyc2VkLmxlbmd0aCA+PSAzICYmIHR5cGVvZiBwYXJzZWRbMF0gPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICAgICAgICBjb25zdCBldmVudCA9IHBhcnNlZCBhcyBBc2NpaW5lbWFFdmVudDtcblxuICAgICAgICAgICAgICAgICAgLy8gVHJhY2sgcmVzaXplIGV2ZW50c1xuICAgICAgICAgICAgICAgICAgaWYgKGlzUmVzaXplRXZlbnQoZXZlbnQpKSB7XG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnRSZXNpemUgPSBldmVudDtcbiAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIGNsZWFyIHNlcXVlbmNlIGluIG91dHB1dCBldmVudHNcbiAgICAgICAgICAgICAgICAgIGlmIChpc091dHB1dEV2ZW50KGV2ZW50KSAmJiBjb250YWluc1BydW5pbmdTZXF1ZW5jZShldmVudFsyXSkpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2xlYXJSZXN1bHQgPSB0aGlzLnByb2Nlc3NDbGVhclNlcXVlbmNlKFxuICAgICAgICAgICAgICAgICAgICAgIGV2ZW50IGFzIEFzY2lpbmVtYU91dHB1dEV2ZW50LFxuICAgICAgICAgICAgICAgICAgICAgIGV2ZW50cy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgICAgZmlsZU9mZnNldCxcbiAgICAgICAgICAgICAgICAgICAgICBjdXJyZW50UmVzaXplLFxuICAgICAgICAgICAgICAgICAgICAgIGxpbmVcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNsZWFyUmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgbGFzdENsZWFySW5kZXggPSBjbGVhclJlc3VsdC5sYXN0Q2xlYXJJbmRleDtcbiAgICAgICAgICAgICAgICAgICAgICBsYXN0Q2xlYXJPZmZzZXQgPSBjbGVhclJlc3VsdC5sYXN0Q2xlYXJPZmZzZXQ7XG4gICAgICAgICAgICAgICAgICAgICAgbGFzdFJlc2l6ZUJlZm9yZUNsZWFyID0gY2xlYXJSZXN1bHQubGFzdFJlc2l6ZUJlZm9yZUNsZWFyO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgIGV2ZW50cy5wdXNoKGV2ZW50KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKGBza2lwcGluZyBpbnZhbGlkIEpTT04gbGluZSBkdXJpbmcgYW5hbHlzaXM6ICR7ZX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaW5kZXggPSBsaW5lQnVmZmVyLmluZGV4T2YoJ1xcbicpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgYW5hbHlzaXNTdHJlYW0ub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgLy8gUHJvY2VzcyBhbnkgcmVtYWluaW5nIGxpbmUgaW4gYW5hbHlzaXNcbiAgICAgICAgaWYgKGxpbmVCdWZmZXIudHJpbSgpKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UobGluZUJ1ZmZlcik7XG4gICAgICAgICAgICBmaWxlT2Zmc2V0ICs9IEJ1ZmZlci5ieXRlTGVuZ3RoKGxpbmVCdWZmZXIsICd1dGY4Jyk7XG4gICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShwYXJzZWQpKSB7XG4gICAgICAgICAgICAgIGlmIChwYXJzZWRbMF0gPT09ICdleGl0Jykge1xuICAgICAgICAgICAgICAgIGV2ZW50cy5wdXNoKHBhcnNlZCBhcyBBc2NpaW5lbWFFeGl0RXZlbnQpO1xuICAgICAgICAgICAgICB9IGVsc2UgaWYgKHBhcnNlZC5sZW5ndGggPj0gMyAmJiB0eXBlb2YgcGFyc2VkWzBdID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGV2ZW50ID0gcGFyc2VkIGFzIEFzY2lpbmVtYUV2ZW50O1xuXG4gICAgICAgICAgICAgICAgaWYgKGlzUmVzaXplRXZlbnQoZXZlbnQpKSB7XG4gICAgICAgICAgICAgICAgICBjdXJyZW50UmVzaXplID0gZXZlbnQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChpc091dHB1dEV2ZW50KGV2ZW50KSAmJiBjb250YWluc1BydW5pbmdTZXF1ZW5jZShldmVudFsyXSkpIHtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IGNsZWFyUmVzdWx0ID0gdGhpcy5wcm9jZXNzQ2xlYXJTZXF1ZW5jZShcbiAgICAgICAgICAgICAgICAgICAgZXZlbnQgYXMgQXNjaWluZW1hT3V0cHV0RXZlbnQsXG4gICAgICAgICAgICAgICAgICAgIGV2ZW50cy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIGZpbGVPZmZzZXQsXG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnRSZXNpemUsXG4gICAgICAgICAgICAgICAgICAgIGxpbmVCdWZmZXJcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICBpZiAoY2xlYXJSZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgbGFzdENsZWFySW5kZXggPSBjbGVhclJlc3VsdC5sYXN0Q2xlYXJJbmRleDtcbiAgICAgICAgICAgICAgICAgICAgbGFzdENsZWFyT2Zmc2V0ID0gY2xlYXJSZXN1bHQubGFzdENsZWFyT2Zmc2V0O1xuICAgICAgICAgICAgICAgICAgICBsYXN0UmVzaXplQmVmb3JlQ2xlYXIgPSBjbGVhclJlc3VsdC5sYXN0UmVzaXplQmVmb3JlQ2xlYXI7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGV2ZW50cy5wdXNoKGV2ZW50KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGxvZ2dlci5kZWJ1Zyhgc2tpcHBpbmcgaW52YWxpZCBKU09OIGluIGxpbmUgYnVmZmVyIGR1cmluZyBhbmFseXNpczogJHtlfWApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE5vdyByZXBsYXkgdGhlIHN0cmVhbSB3aXRoIHBydW5pbmdcbiAgICAgICAgbGV0IHN0YXJ0SW5kZXggPSAwO1xuXG4gICAgICAgIGlmIChsYXN0Q2xlYXJJbmRleCA+PSAwKSB7XG4gICAgICAgICAgLy8gU3RhcnQgZnJvbSBhZnRlciB0aGUgbGFzdCBjbGVhclxuICAgICAgICAgIHN0YXJ0SW5kZXggPSBsYXN0Q2xlYXJJbmRleCArIDE7XG4gICAgICAgICAgbG9nZ2VyLmxvZyhcbiAgICAgICAgICAgIGNoYWxrLmdyZWVuKFxuICAgICAgICAgICAgICBgcHJ1bmluZyBzdHJlYW06IHNraXBwaW5nICR7bGFzdENsZWFySW5kZXggKyAxfSBldmVudHMgYmVmb3JlIGxhc3QgY2xlYXIgYXQgb2Zmc2V0ICR7bGFzdENsZWFyT2Zmc2V0fWBcbiAgICAgICAgICAgIClcbiAgICAgICAgICApO1xuXG4gICAgICAgICAgLy8gUGVyc2lzdCBuZXcgY2xlYXIgb2Zmc2V0IHRvIHNlc3Npb24gb25seSBpZiBzZXNzaW9uIGFscmVhZHkgZXhpc3RzXG4gICAgICAgICAgaWYgKHNlc3Npb25JbmZvKSB7XG4gICAgICAgICAgICBzZXNzaW9uSW5mby5sYXN0Q2xlYXJPZmZzZXQgPSBsYXN0Q2xlYXJPZmZzZXQ7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb25NYW5hZ2VyLnNhdmVTZXNzaW9uSW5mbyhzZXNzaW9uSWQsIHNlc3Npb25JbmZvKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTZW5kIGhlYWRlciBmaXJzdCAtIHVwZGF0ZSBkaW1lbnNpb25zIGlmIHdlIGhhdmUgYSByZXNpemVcbiAgICAgICAgaWYgKGhlYWRlcikge1xuICAgICAgICAgIGNvbnN0IGhlYWRlclRvU2VuZCA9IHsgLi4uaGVhZGVyIH07XG4gICAgICAgICAgaWYgKGxhc3RDbGVhckluZGV4ID49IDAgJiYgbGFzdFJlc2l6ZUJlZm9yZUNsZWFyKSB7XG4gICAgICAgICAgICAvLyBVcGRhdGUgaGVhZGVyIHdpdGggbGFzdCBrbm93biBkaW1lbnNpb25zIGJlZm9yZSBjbGVhclxuICAgICAgICAgICAgY29uc3QgZGltZW5zaW9ucyA9IGxhc3RSZXNpemVCZWZvcmVDbGVhclsyXS5zcGxpdCgneCcpO1xuICAgICAgICAgICAgaGVhZGVyVG9TZW5kLndpZHRoID0gTnVtYmVyLnBhcnNlSW50KGRpbWVuc2lvbnNbMF0sIDEwKTtcbiAgICAgICAgICAgIGhlYWRlclRvU2VuZC5oZWlnaHQgPSBOdW1iZXIucGFyc2VJbnQoZGltZW5zaW9uc1sxXSwgMTApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjbGllbnQucmVzcG9uc2Uud3JpdGUoYGRhdGE6ICR7SlNPTi5zdHJpbmdpZnkoaGVhZGVyVG9TZW5kKX1cXG5cXG5gKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNlbmQgcmVtYWluaW5nIGV2ZW50c1xuICAgICAgICBsZXQgZXhpdEV2ZW50Rm91bmQgPSBmYWxzZTtcbiAgICAgICAgZm9yIChsZXQgaSA9IHN0YXJ0SW5kZXg7IGkgPCBldmVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBjb25zdCBldmVudCA9IGV2ZW50c1tpXTtcbiAgICAgICAgICBpZiAoaXNFeGl0RXZlbnQoZXZlbnQpKSB7XG4gICAgICAgICAgICBleGl0RXZlbnRGb3VuZCA9IHRydWU7XG4gICAgICAgICAgICBjbGllbnQucmVzcG9uc2Uud3JpdGUoYGRhdGE6ICR7SlNPTi5zdHJpbmdpZnkoZXZlbnQpfVxcblxcbmApO1xuICAgICAgICAgIH0gZWxzZSBpZiAoaXNPdXRwdXRFdmVudChldmVudCkgfHwgaXNSZXNpemVFdmVudChldmVudCkpIHtcbiAgICAgICAgICAgIC8vIFNldCB0aW1lc3RhbXAgdG8gMCBmb3IgZXhpc3RpbmcgY29udGVudFxuICAgICAgICAgICAgY29uc3QgaW5zdGFudEV2ZW50OiBBc2NpaW5lbWFFdmVudCA9IFswLCBldmVudFsxXSwgZXZlbnRbMl1dO1xuICAgICAgICAgICAgY2xpZW50LnJlc3BvbnNlLndyaXRlKGBkYXRhOiAke0pTT04uc3RyaW5naWZ5KGluc3RhbnRFdmVudCl9XFxuXFxuYCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgZXhpdCBldmVudCBmb3VuZCwgY2xvc2UgY29ubmVjdGlvblxuICAgICAgICBpZiAoZXhpdEV2ZW50Rm91bmQpIHtcbiAgICAgICAgICBsb2dnZXIubG9nKFxuICAgICAgICAgICAgY2hhbGsueWVsbG93KFxuICAgICAgICAgICAgICBgc2Vzc2lvbiAke2NsaWVudC5yZXNwb25zZS5sb2NhbHM/LnNlc3Npb25JZCB8fCAndW5rbm93bid9IGFscmVhZHkgZW5kZWQsIGNsb3Npbmcgc3RyZWFtYFxuICAgICAgICAgICAgKVxuICAgICAgICAgICk7XG4gICAgICAgICAgY2xpZW50LnJlc3BvbnNlLmVuZCgpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgYW5hbHlzaXNTdHJlYW0ub24oJ2Vycm9yJywgKGVycm9yKSA9PiB7XG4gICAgICAgIGxvZ2dlci5lcnJvcignZmFpbGVkIHRvIGFuYWx5emUgc3RyZWFtIGZvciBwcnVuaW5nOicsIGVycm9yKTtcbiAgICAgICAgLy8gSWYgc3RyZWFtIGZhaWxzLCBjbGllbnQgd2lsbCBzaW1wbHkgbm90IHJlY2VpdmUgZXhpc3RpbmcgY29udGVudFxuICAgICAgICAvLyBUaGlzIGlzIGV4dHJlbWVseSByYXJlIGFuZCB3b3VsZCBpbmRpY2F0ZSBhIHNlcmlvdXMgZmlsZXN5c3RlbSBpc3N1ZVxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignZmFpbGVkIHRvIGNyZWF0ZSByZWFkIHN0cmVhbTonLCBlcnJvcik7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFN0YXJ0IHdhdGNoaW5nIGEgZmlsZSBmb3IgY2hhbmdlc1xuICAgKi9cbiAgcHJpdmF0ZSBzdGFydFdhdGNoaW5nKHNlc3Npb25JZDogc3RyaW5nLCBzdHJlYW1QYXRoOiBzdHJpbmcsIHdhdGNoZXJJbmZvOiBXYXRjaGVySW5mbyk6IHZvaWQge1xuICAgIGxvZ2dlci5sb2coY2hhbGsuZ3JlZW4oYHN0YXJ0ZWQgd2F0Y2hpbmcgc3RyZWFtIGZpbGUgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9YCkpO1xuXG4gICAgLy8gVXNlIHN0YW5kYXJkIGZzLndhdGNoIHdpdGggc3RhdCBjaGVja2luZ1xuICAgIHdhdGNoZXJJbmZvLndhdGNoZXIgPSBmcy53YXRjaChzdHJlYW1QYXRoLCB7IHBlcnNpc3RlbnQ6IHRydWUgfSwgKGV2ZW50VHlwZSkgPT4ge1xuICAgICAgaWYgKGV2ZW50VHlwZSA9PT0gJ2NoYW5nZScpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAvLyBDaGVjayBpZiBmaWxlIGFjdHVhbGx5IGNoYW5nZWQgYnkgY29tcGFyaW5nIHN0YXRzXG4gICAgICAgICAgY29uc3Qgc3RhdHMgPSBmcy5zdGF0U3luYyhzdHJlYW1QYXRoKTtcblxuICAgICAgICAgIC8vIE9ubHkgcHJvY2VzcyBpZiBzaXplIGluY3JlYXNlZCAoYXBwZW5kLW9ubHkgZmlsZSlcbiAgICAgICAgICBpZiAoc3RhdHMuc2l6ZSA+IHdhdGNoZXJJbmZvLmxhc3RTaXplIHx8IHN0YXRzLm10aW1lTXMgPiB3YXRjaGVySW5mby5sYXN0TXRpbWUpIHtcbiAgICAgICAgICAgIGNvbnN0IHNpemVEaWZmID0gc3RhdHMuc2l6ZSAtIHdhdGNoZXJJbmZvLmxhc3RTaXplO1xuICAgICAgICAgICAgaWYgKHNpemVEaWZmID4gMCkge1xuICAgICAgICAgICAgICBsb2dnZXIuZGVidWcoYGZpbGUgZ3JldyBieSAke3NpemVEaWZmfSBieXRlc2ApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgd2F0Y2hlckluZm8ubGFzdFNpemUgPSBzdGF0cy5zaXplO1xuICAgICAgICAgICAgd2F0Y2hlckluZm8ubGFzdE10aW1lID0gc3RhdHMubXRpbWVNcztcblxuICAgICAgICAgICAgLy8gUmVhZCBvbmx5IG5ldyBkYXRhXG4gICAgICAgICAgICBpZiAoc3RhdHMuc2l6ZSA+IHdhdGNoZXJJbmZvLmxhc3RPZmZzZXQpIHtcbiAgICAgICAgICAgICAgY29uc3QgZmQgPSBmcy5vcGVuU3luYyhzdHJlYW1QYXRoLCAncicpO1xuICAgICAgICAgICAgICBjb25zdCBidWZmZXIgPSBCdWZmZXIuYWxsb2Moc3RhdHMuc2l6ZSAtIHdhdGNoZXJJbmZvLmxhc3RPZmZzZXQpO1xuICAgICAgICAgICAgICBmcy5yZWFkU3luYyhmZCwgYnVmZmVyLCAwLCBidWZmZXIubGVuZ3RoLCB3YXRjaGVySW5mby5sYXN0T2Zmc2V0KTtcbiAgICAgICAgICAgICAgZnMuY2xvc2VTeW5jKGZkKTtcblxuICAgICAgICAgICAgICAvLyBVcGRhdGUgb2Zmc2V0XG4gICAgICAgICAgICAgIHdhdGNoZXJJbmZvLmxhc3RPZmZzZXQgPSBzdGF0cy5zaXplO1xuXG4gICAgICAgICAgICAgIC8vIFByb2Nlc3MgbmV3IGRhdGFcbiAgICAgICAgICAgICAgY29uc3QgbmV3RGF0YSA9IGJ1ZmZlci50b1N0cmluZygndXRmOCcpO1xuICAgICAgICAgICAgICB3YXRjaGVySW5mby5saW5lQnVmZmVyICs9IG5ld0RhdGE7XG5cbiAgICAgICAgICAgICAgLy8gUHJvY2VzcyBjb21wbGV0ZSBsaW5lc1xuICAgICAgICAgICAgICBjb25zdCBsaW5lcyA9IHdhdGNoZXJJbmZvLmxpbmVCdWZmZXIuc3BsaXQoJ1xcbicpO1xuICAgICAgICAgICAgICB3YXRjaGVySW5mby5saW5lQnVmZmVyID0gbGluZXMucG9wKCkgfHwgJyc7XG5cbiAgICAgICAgICAgICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICAgICAgICAgICAgaWYgKGxpbmUudHJpbSgpKSB7XG4gICAgICAgICAgICAgICAgICB0aGlzLmJyb2FkY2FzdExpbmUoc2Vzc2lvbklkLCBsaW5lLCB3YXRjaGVySW5mbyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGxvZ2dlci5lcnJvcignZmFpbGVkIHRvIHJlYWQgZmlsZSBjaGFuZ2VzOicsIGVycm9yKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgd2F0Y2hlckluZm8ud2F0Y2hlci5vbignZXJyb3InLCAoZXJyb3IpID0+IHtcbiAgICAgIGxvZ2dlci5lcnJvcihgZmlsZSB3YXRjaGVyIGVycm9yIGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfTpgLCBlcnJvcik7XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQnJvYWRjYXN0IGEgbGluZSB0byBhbGwgY2xpZW50c1xuICAgKi9cbiAgcHJpdmF0ZSBicm9hZGNhc3RMaW5lKHNlc3Npb25JZDogc3RyaW5nLCBsaW5lOiBzdHJpbmcsIHdhdGNoZXJJbmZvOiBXYXRjaGVySW5mbyk6IHZvaWQge1xuICAgIGNvbnN0IHBhcnNlZCA9IHRoaXMucGFyc2VBc2NpaW5lbWFMaW5lKGxpbmUpO1xuXG4gICAgaWYgKCFwYXJzZWQpIHtcbiAgICAgIC8vIEhhbmRsZSBub24tSlNPTiBhcyByYXcgb3V0cHV0XG4gICAgICBsb2dnZXIuZGVidWcoYGJyb2FkY2FzdGluZyByYXcgb3V0cHV0IGxpbmU6ICR7bGluZS5zdWJzdHJpbmcoMCwgNTApfS4uLmApO1xuICAgICAgY29uc3QgY3VycmVudFRpbWUgPSBEYXRlLm5vdygpIC8gMTAwMDtcbiAgICAgIGZvciAoY29uc3QgY2xpZW50IG9mIHdhdGNoZXJJbmZvLmNsaWVudHMpIHtcbiAgICAgICAgY29uc3QgY2FzdEV2ZW50OiBBc2NpaW5lbWFPdXRwdXRFdmVudCA9IFtjdXJyZW50VGltZSAtIGNsaWVudC5zdGFydFRpbWUsICdvJywgbGluZV07XG4gICAgICAgIHRoaXMuc2VuZEV2ZW50VG9DbGllbnQoY2xpZW50LCBjYXN0RXZlbnQpO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFNraXAgZHVwbGljYXRlIGhlYWRlcnNcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkocGFyc2VkKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIEhhbmRsZSBleGl0IGV2ZW50c1xuICAgIGlmIChpc0V4aXRFdmVudChwYXJzZWQpKSB7XG4gICAgICBsb2dnZXIubG9nKGNoYWxrLnllbGxvdyhgc2Vzc2lvbiAke3Nlc3Npb25JZH0gZW5kZWQgd2l0aCBleGl0IGNvZGUgJHtwYXJzZWRbMV19YCkpO1xuICAgICAgZm9yIChjb25zdCBjbGllbnQgb2Ygd2F0Y2hlckluZm8uY2xpZW50cykge1xuICAgICAgICB0aGlzLnNlbmRFdmVudFRvQ2xpZW50KGNsaWVudCwgcGFyc2VkKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBMb2cgcmVzaXplIGJyb2FkY2FzdHMgYXQgZGVidWcgbGV2ZWwgb25seVxuICAgIGlmIChpc1Jlc2l6ZUV2ZW50KHBhcnNlZCkpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhgQnJvYWRjYXN0aW5nIHJlc2l6ZSAke3BhcnNlZFsyXX0gdG8gJHt3YXRjaGVySW5mby5jbGllbnRzLnNpemV9IGNsaWVudHNgKTtcbiAgICB9XG5cbiAgICAvLyBDYWxjdWxhdGUgcmVsYXRpdmUgdGltZXN0YW1wIGZvciBlYWNoIGNsaWVudFxuICAgIGNvbnN0IGN1cnJlbnRUaW1lID0gRGF0ZS5ub3coKSAvIDEwMDA7XG4gICAgZm9yIChjb25zdCBjbGllbnQgb2Ygd2F0Y2hlckluZm8uY2xpZW50cykge1xuICAgICAgY29uc3QgcmVsYXRpdmVFdmVudDogQXNjaWluZW1hRXZlbnQgPSBbY3VycmVudFRpbWUgLSBjbGllbnQuc3RhcnRUaW1lLCBwYXJzZWRbMV0sIHBhcnNlZFsyXV07XG4gICAgICB0cnkge1xuICAgICAgICBjbGllbnQucmVzcG9uc2Uud3JpdGUoYGRhdGE6ICR7SlNPTi5zdHJpbmdpZnkocmVsYXRpdmVFdmVudCl9XFxuXFxuYCk7XG4gICAgICAgIGlmIChjbGllbnQucmVzcG9uc2UuZmx1c2gpIGNsaWVudC5yZXNwb25zZS5mbHVzaCgpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICAgIGBjbGllbnQgd3JpdGUgZmFpbGVkIChsaWtlbHkgZGlzY29ubmVjdGVkKTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTdGFydCBnaXQgd2F0Y2hpbmcgZm9yIGEgc2Vzc2lvbiBpZiBpdCdzIGluIGEgZ2l0IHJlcG9zaXRvcnlcbiAgICovXG4gIHByaXZhdGUgYXN5bmMgc3RhcnRHaXRXYXRjaGluZyhzZXNzaW9uSWQ6IHN0cmluZywgcmVzcG9uc2U6IFJlc3BvbnNlKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHNlc3Npb25JbmZvID0gdGhpcy5zZXNzaW9uTWFuYWdlci5sb2FkU2Vzc2lvbkluZm8oc2Vzc2lvbklkKTtcbiAgICAgIGlmIChzZXNzaW9uSW5mbz8uZ2l0UmVwb1BhdGggJiYgc2Vzc2lvbkluZm8ud29ya2luZ0Rpcikge1xuICAgICAgICBsb2dnZXIuZGVidWcoYFN0YXJ0aW5nIGdpdCB3YXRjaGVyIGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfSBhdCAke3Nlc3Npb25JbmZvLmdpdFJlcG9QYXRofWApO1xuICAgICAgICBhd2FpdCBnaXRXYXRjaGVyLnN0YXJ0V2F0Y2hpbmcoc2Vzc2lvbklkLCBzZXNzaW9uSW5mby53b3JraW5nRGlyLCBzZXNzaW9uSW5mby5naXRSZXBvUGF0aCk7XG4gICAgICAgIGdpdFdhdGNoZXIuYWRkQ2xpZW50KHNlc3Npb25JZCwgcmVzcG9uc2UpO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoYEZhaWxlZCB0byBzdGFydCBnaXQgd2F0Y2hpbmcgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9OmAsIGVycm9yKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQ2xlYW4gdXAgYWxsIHdhdGNoZXJzIGFuZCBsaXN0ZW5lcnNcbiAgICovXG4gIHByaXZhdGUgY2xlYW51cCgpOiB2b2lkIHtcbiAgICBjb25zdCB3YXRjaGVyQ291bnQgPSB0aGlzLmFjdGl2ZVdhdGNoZXJzLnNpemU7XG4gICAgaWYgKHdhdGNoZXJDb3VudCA+IDApIHtcbiAgICAgIGxvZ2dlci5sb2coY2hhbGsueWVsbG93KGBjbGVhbmluZyB1cCAke3dhdGNoZXJDb3VudH0gYWN0aXZlIHdhdGNoZXJzYCkpO1xuICAgICAgZm9yIChjb25zdCBbc2Vzc2lvbklkLCB3YXRjaGVySW5mb10gb2YgdGhpcy5hY3RpdmVXYXRjaGVycykge1xuICAgICAgICBpZiAod2F0Y2hlckluZm8ud2F0Y2hlcikge1xuICAgICAgICAgIHdhdGNoZXJJbmZvLndhdGNoZXIuY2xvc2UoKTtcbiAgICAgICAgfVxuICAgICAgICBsb2dnZXIuZGVidWcoYGNsb3NlZCB3YXRjaGVyIGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfWApO1xuICAgICAgfVxuICAgICAgdGhpcy5hY3RpdmVXYXRjaGVycy5jbGVhcigpO1xuICAgIH1cbiAgICAvLyBDbGVhbiB1cCBnaXQgd2F0Y2hlcnNcbiAgICBnaXRXYXRjaGVyLmNsZWFudXAoKTtcbiAgfVxufVxuIl19