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
exports.VERBOSITY_MAP = exports.VerbosityLevel = void 0;
exports.setLogFilePath = setLogFilePath;
exports.isVerbosityLevel = isVerbosityLevel;
exports.parseVerbosityLevel = parseVerbosityLevel;
exports.initLogger = initLogger;
exports.flushLogger = flushLogger;
exports.closeLogger = closeLogger;
exports.setDebugMode = setDebugMode;
exports.setVerbosityLevel = setVerbosityLevel;
exports.getVerbosityLevel = getVerbosityLevel;
exports.isDebugEnabled = isDebugEnabled;
exports.isVerbose = isVerbose;
exports.logFromModule = logFromModule;
exports.createLogger = createLogger;
const chalk_1 = __importDefault(require("chalk"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
// Log file path
const LOG_DIR = path.join(os.homedir(), '.vibetunnel');
let LOG_FILE = path.join(LOG_DIR, 'log.txt');
/**
 * Set custom log file path
 */
function setLogFilePath(filePath) {
    // Close existing file handle if open
    if (logFileHandle) {
        logFileHandle.end();
        logFileHandle = null;
    }
    LOG_FILE = filePath;
    // Ensure directory exists
    const dir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    // Re-open log file at new location
    try {
        logFileHandle = fs.createWriteStream(LOG_FILE, { flags: 'a' });
    }
    catch (error) {
        console.error('Failed to open log file at new location:', error);
    }
}
// Verbosity levels
var VerbosityLevel;
(function (VerbosityLevel) {
    VerbosityLevel[VerbosityLevel["SILENT"] = 0] = "SILENT";
    VerbosityLevel[VerbosityLevel["ERROR"] = 1] = "ERROR";
    VerbosityLevel[VerbosityLevel["WARN"] = 2] = "WARN";
    VerbosityLevel[VerbosityLevel["INFO"] = 3] = "INFO";
    VerbosityLevel[VerbosityLevel["VERBOSE"] = 4] = "VERBOSE";
    VerbosityLevel[VerbosityLevel["DEBUG"] = 5] = "DEBUG";
})(VerbosityLevel || (exports.VerbosityLevel = VerbosityLevel = {}));
/**
 * Type-safe mapping of string names to verbosity levels
 */
exports.VERBOSITY_MAP = {
    silent: VerbosityLevel.SILENT,
    error: VerbosityLevel.ERROR,
    warn: VerbosityLevel.WARN,
    info: VerbosityLevel.INFO,
    verbose: VerbosityLevel.VERBOSE,
    debug: VerbosityLevel.DEBUG,
};
// Current verbosity level
let verbosityLevel = VerbosityLevel.ERROR;
// Debug mode flag (kept for backward compatibility)
// biome-ignore lint/correctness/noUnusedVariables: Used for backward compatibility
let debugMode = false;
/**
 * Type guard to check if a string is a valid VerbosityLevel key
 */
function isVerbosityLevel(value) {
    return value.toLowerCase() in exports.VERBOSITY_MAP;
}
/**
 * Parse a string to VerbosityLevel, returns undefined if invalid
 */
function parseVerbosityLevel(value) {
    const normalized = value.toLowerCase();
    return exports.VERBOSITY_MAP[normalized];
}
// File handle for log file
let logFileHandle = null;
// ANSI color codes for stripping from file output
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences require control characters
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;
/**
 * Initialize the logger - creates log directory and file
 */
function initLogger(debug = false, verbosity) {
    debugMode = debug;
    // Set verbosity level
    if (verbosity !== undefined) {
        verbosityLevel = verbosity;
    }
    else if (debug) {
        // If debug mode is enabled, set verbosity to DEBUG
        verbosityLevel = VerbosityLevel.DEBUG;
    }
    // If already initialized, just update debug mode and return
    if (logFileHandle) {
        return;
    }
    try {
        // Ensure log directory exists
        if (!fs.existsSync(LOG_DIR)) {
            fs.mkdirSync(LOG_DIR, { recursive: true });
        }
        // Delete old log file if it exists
        try {
            if (fs.existsSync(LOG_FILE)) {
                fs.unlinkSync(LOG_FILE);
            }
        }
        catch {
            // Ignore unlink errors - file might not exist or be locked
            // Don't log here as logger isn't fully initialized yet
        }
        // Create new log file write stream
        logFileHandle = fs.createWriteStream(LOG_FILE, { flags: 'a' });
    }
    catch (error) {
        // Don't throw, just log to console
        console.error('Failed to initialize log file:', error);
    }
}
/**
 * Flush the log file buffer
 */
function flushLogger() {
    return new Promise((resolve) => {
        if (logFileHandle && !logFileHandle.destroyed) {
            // Force a write of any buffered data
            logFileHandle.write('', () => {
                resolve();
            });
        }
        else {
            resolve();
        }
    });
}
/**
 * Close the logger
 */
function closeLogger() {
    if (logFileHandle) {
        logFileHandle.end();
        logFileHandle = null;
    }
}
/**
 * Format log message with timestamp
 */
function formatMessage(level, module, args) {
    const timestamp = new Date().toISOString();
    // Format arguments
    const message = args
        .map((arg) => {
        if (typeof arg === 'object') {
            try {
                // Use JSON.stringify with 2-space indent for objects
                return JSON.stringify(arg, null, 2);
            }
            catch {
                return String(arg);
            }
        }
        return String(arg);
    })
        .join(' ');
    // Console format with colors
    let consoleFormat;
    const moduleColor = chalk_1.default.cyan(`[${module}]`);
    const timestampColor = chalk_1.default.gray(timestamp);
    switch (level) {
        case 'ERROR':
            consoleFormat = `${timestampColor} ${chalk_1.default.red(level)} ${moduleColor} ${chalk_1.default.red(message)}`;
            break;
        case 'WARN':
            consoleFormat = `${timestampColor} ${chalk_1.default.yellow(level)}  ${moduleColor} ${chalk_1.default.yellow(message)}`;
            break;
        case 'DEBUG':
            consoleFormat = `${timestampColor} ${chalk_1.default.magenta(level)} ${moduleColor} ${chalk_1.default.gray(message)}`;
            break;
        default: // LOG
            consoleFormat = `${timestampColor} ${chalk_1.default.green(level)}   ${moduleColor} ${message}`;
    }
    // File format (no colors)
    const fileFormat = `${timestamp} ${level.padEnd(5)} [${module}] ${message}`;
    return { console: consoleFormat, file: fileFormat };
}
/**
 * Write to log file
 */
function writeToFile(message) {
    if (logFileHandle) {
        try {
            // Strip ANSI color codes from message
            const cleanMessage = message.replace(ANSI_PATTERN, '');
            logFileHandle.write(`${cleanMessage}\n`);
        }
        catch {
            // Silently ignore file write errors
        }
    }
}
/**
 * Enable or disable debug mode
 */
function setDebugMode(enabled) {
    debugMode = enabled;
    // If enabling debug mode, also set verbosity to DEBUG
    if (enabled) {
        verbosityLevel = VerbosityLevel.DEBUG;
    }
}
/**
 * Set verbosity level
 */
function setVerbosityLevel(level) {
    verbosityLevel = level;
    // Update debug mode flag for backward compatibility
    debugMode = level >= VerbosityLevel.DEBUG;
}
/**
 * Get current verbosity level
 */
function getVerbosityLevel() {
    return verbosityLevel;
}
/**
 * Check if debug logging is enabled
 */
function isDebugEnabled() {
    return verbosityLevel >= VerbosityLevel.DEBUG;
}
/**
 * Check if verbose logging is enabled
 */
function isVerbose() {
    return verbosityLevel >= VerbosityLevel.VERBOSE;
}
/**
 * Check if a log level should be output based on current verbosity
 */
function shouldLog(level) {
    switch (level) {
        case 'ERROR':
            return verbosityLevel >= VerbosityLevel.ERROR;
        case 'WARN':
            return verbosityLevel >= VerbosityLevel.WARN;
        case 'LOG':
            return verbosityLevel >= VerbosityLevel.INFO;
        case 'DEBUG':
            return verbosityLevel >= VerbosityLevel.DEBUG;
        default:
            return true;
    }
}
/**
 * Log from a specific module (used by client-side API)
 */
function logFromModule(level, module, args) {
    const { console: consoleMsg, file: fileMsg } = formatMessage(level, module, args);
    // Always write to file
    writeToFile(fileMsg);
    // Check if we should output to console based on verbosity
    if (!shouldLog(level))
        return;
    // Log to console
    switch (level) {
        case 'ERROR':
            console.error(consoleMsg);
            break;
        case 'WARN':
            console.warn(consoleMsg);
            break;
        default:
            console.log(consoleMsg);
    }
}
/**
 * Create a logger for a specific module
 * This is the main factory function that should be used
 */
function createLogger(moduleName) {
    // Add [SRV] prefix to server-originated logs unless it already has a prefix
    const prefixedModuleName = moduleName.startsWith('[') ? moduleName : `[SRV] ${moduleName}`;
    return {
        /**
         * @deprecated Use info() instead for clarity
         */
        log: (...args) => {
            const { console: consoleMsg, file: fileMsg } = formatMessage('LOG', prefixedModuleName, args);
            writeToFile(fileMsg); // Always write to file
            if (shouldLog('LOG')) {
                console.log(consoleMsg);
            }
        },
        info: (...args) => {
            const { console: consoleMsg, file: fileMsg } = formatMessage('LOG', prefixedModuleName, args);
            writeToFile(fileMsg); // Always write to file
            if (shouldLog('LOG')) {
                console.log(consoleMsg);
            }
        },
        warn: (...args) => {
            const { console: consoleMsg, file: fileMsg } = formatMessage('WARN', prefixedModuleName, args);
            writeToFile(fileMsg); // Always write to file
            if (shouldLog('WARN')) {
                console.warn(consoleMsg);
            }
        },
        error: (...args) => {
            const { console: consoleMsg, file: fileMsg } = formatMessage('ERROR', prefixedModuleName, args);
            writeToFile(fileMsg); // Always write to file
            if (shouldLog('ERROR')) {
                console.error(consoleMsg);
            }
        },
        debug: (...args) => {
            const { console: consoleMsg, file: fileMsg } = formatMessage('DEBUG', prefixedModuleName, args);
            writeToFile(fileMsg); // Always write to file
            if (shouldLog('DEBUG')) {
                console.log(consoleMsg);
            }
        },
        setDebugMode: (enabled) => setDebugMode(enabled),
        setVerbosity: (level) => setVerbosityLevel(level),
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9nZ2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NlcnZlci91dGlscy9sb2dnZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBWUEsd0NBcUJDO0FBa0NELDRDQUVDO0FBS0Qsa0RBR0M7QUFZRCxnQ0FzQ0M7QUFLRCxrQ0FXQztBQUtELGtDQUtDO0FBc0VELG9DQU1DO0FBS0QsOENBSUM7QUFLRCw4Q0FFQztBQUtELHdDQUVDO0FBS0QsOEJBRUM7QUF1QkQsc0NBb0JDO0FBTUQsb0NBMERDO0FBOVdELGtEQUEwQjtBQUMxQix1Q0FBeUI7QUFDekIsdUNBQXlCO0FBQ3pCLDJDQUE2QjtBQUU3QixnQkFBZ0I7QUFDaEIsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLEVBQUUsYUFBYSxDQUFDLENBQUM7QUFDdkQsSUFBSSxRQUFRLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsU0FBUyxDQUFDLENBQUM7QUFFN0M7O0dBRUc7QUFDSCxTQUFnQixjQUFjLENBQUMsUUFBZ0I7SUFDN0MscUNBQXFDO0lBQ3JDLElBQUksYUFBYSxFQUFFLENBQUM7UUFDbEIsYUFBYSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3BCLGFBQWEsR0FBRyxJQUFJLENBQUM7SUFDdkIsQ0FBQztJQUVELFFBQVEsR0FBRyxRQUFRLENBQUM7SUFFcEIsMEJBQTBCO0lBQzFCLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDbkMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUN4QixFQUFFLENBQUMsU0FBUyxDQUFDLEdBQUcsRUFBRSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBQ3pDLENBQUM7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QUFDSixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGNoYWxrIGZyb20gJ2NoYWxrJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIG9zIGZyb20gJ29zJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5cbi8vIExvZyBmaWxlIHBhdGhcbmNvbnN0IExPR19ESVIgPSBwYXRoLmpvaW4ob3MuaG9tZWRpcigpLCAnLnZpYmV0dW5uZWwnKTtcbmxldCBMT0dfRklMRSA9IHBhdGguam9pbihMT0dfRElSLCAnbG9nLnR4dCcpO1xuXG4vKipcbiAqIFNldCBjdXN0b20gbG9nIGZpbGUgcGF0aFxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0TG9nRmlsZVBhdGgoZmlsZVBhdGg6IHN0cmluZyk6IHZvaWQge1xuICAvLyBDbG9zZSBleGlzdGluZyBmaWxlIGhhbmRsZSBpZiBvcGVuXG4gIGlmIChsb2dGaWxlSGFuZGxlKSB7XG4gICAgbG9nRmlsZUhhbmRsZS5lbmQoKTtcbiAgICBsb2dGaWxlSGFuZGxlID0gbnVsbDtcbiAgfVxuXG4gIExPR19GSUxFID0gZmlsZVBhdGg7XG5cbiAgLy8gRW5zdXJlIGRpcmVjdG9yeSBleGlzdHNcbiAgY29uc3QgZGlyID0gcGF0aC5kaXJuYW1lKExPR19GSUxFKTtcbiAgaWYgKCFmcy5leGlzdHNTeW5jKGRpcikpIHtcbiAgICBmcy5ta2RpclN5bmMoZGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgfVxuXG4gIC8vIFJlLW9wZW4gbG9nIGZpbGUgYXQgbmV3IGxvY2F0aW9uXG4gIHRyeSB7XG4gICAgbG9nRmlsZUhhbmRsZSA9IGZzLmNyZWF0ZVdyaXRlU3RyZWFtKExPR19GSUxFLCB7IGZsYWdzOiAnYScgfSk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIG9wZW4gbG9nIGZpbGUgYXQgbmV3IGxvY2F0aW9uOicsIGVycm9yKTtcbiAgfVxufVxuXG4vLyBWZXJib3NpdHkgbGV2ZWxzXG5leHBvcnQgZW51bSBWZXJib3NpdHlMZXZlbCB7XG4gIFNJTEVOVCA9IDAsIC8vIE5vIGNvbnNvbGUgb3V0cHV0IChsb2dzIHRvIGZpbGUgb25seSlcbiAgRVJST1IgPSAxLCAvLyBFcnJvcnMgb25seSAoZGVmYXVsdClcbiAgV0FSTiA9IDIsIC8vIEVycm9ycyBhbmQgd2FybmluZ3NcbiAgSU5GTyA9IDMsIC8vIEVycm9ycywgd2FybmluZ3MsIGFuZCBpbmZvXG4gIFZFUkJPU0UgPSA0LCAvLyBBbGwgZXhjZXB0IGRlYnVnXG4gIERFQlVHID0gNSwgLy8gRXZlcnl0aGluZ1xufVxuXG4vKipcbiAqIFR5cGUtc2FmZSBtYXBwaW5nIG9mIHN0cmluZyBuYW1lcyB0byB2ZXJib3NpdHkgbGV2ZWxzXG4gKi9cbmV4cG9ydCBjb25zdCBWRVJCT1NJVFlfTUFQOiBSZWNvcmQ8c3RyaW5nLCBWZXJib3NpdHlMZXZlbD4gPSB7XG4gIHNpbGVudDogVmVyYm9zaXR5TGV2ZWwuU0lMRU5ULFxuICBlcnJvcjogVmVyYm9zaXR5TGV2ZWwuRVJST1IsXG4gIHdhcm46IFZlcmJvc2l0eUxldmVsLldBUk4sXG4gIGluZm86IFZlcmJvc2l0eUxldmVsLklORk8sXG4gIHZlcmJvc2U6IFZlcmJvc2l0eUxldmVsLlZFUkJPU0UsXG4gIGRlYnVnOiBWZXJib3NpdHlMZXZlbC5ERUJVRyxcbn0gYXMgY29uc3Q7XG5cbi8vIEN1cnJlbnQgdmVyYm9zaXR5IGxldmVsXG5sZXQgdmVyYm9zaXR5TGV2ZWw6IFZlcmJvc2l0eUxldmVsID0gVmVyYm9zaXR5TGV2ZWwuRVJST1I7XG5cbi8vIERlYnVnIG1vZGUgZmxhZyAoa2VwdCBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eSlcbi8vIGJpb21lLWlnbm9yZSBsaW50L2NvcnJlY3RuZXNzL25vVW51c2VkVmFyaWFibGVzOiBVc2VkIGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5XG5sZXQgZGVidWdNb2RlID0gZmFsc2U7XG5cbi8qKlxuICogVHlwZSBndWFyZCB0byBjaGVjayBpZiBhIHN0cmluZyBpcyBhIHZhbGlkIFZlcmJvc2l0eUxldmVsIGtleVxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNWZXJib3NpdHlMZXZlbCh2YWx1ZTogc3RyaW5nKTogdmFsdWUgaXMga2V5b2YgdHlwZW9mIFZFUkJPU0lUWV9NQVAge1xuICByZXR1cm4gdmFsdWUudG9Mb3dlckNhc2UoKSBpbiBWRVJCT1NJVFlfTUFQO1xufVxuXG4vKipcbiAqIFBhcnNlIGEgc3RyaW5nIHRvIFZlcmJvc2l0eUxldmVsLCByZXR1cm5zIHVuZGVmaW5lZCBpZiBpbnZhbGlkXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVZlcmJvc2l0eUxldmVsKHZhbHVlOiBzdHJpbmcpOiBWZXJib3NpdHlMZXZlbCB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IG5vcm1hbGl6ZWQgPSB2YWx1ZS50b0xvd2VyQ2FzZSgpO1xuICByZXR1cm4gVkVSQk9TSVRZX01BUFtub3JtYWxpemVkXTtcbn1cblxuLy8gRmlsZSBoYW5kbGUgZm9yIGxvZyBmaWxlXG5sZXQgbG9nRmlsZUhhbmRsZTogZnMuV3JpdGVTdHJlYW0gfCBudWxsID0gbnVsbDtcblxuLy8gQU5TSSBjb2xvciBjb2RlcyBmb3Igc3RyaXBwaW5nIGZyb20gZmlsZSBvdXRwdXRcbi8vIGJpb21lLWlnbm9yZSBsaW50L3N1c3BpY2lvdXMvbm9Db250cm9sQ2hhcmFjdGVyc0luUmVnZXg6IEFOU0kgZXNjYXBlIHNlcXVlbmNlcyByZXF1aXJlIGNvbnRyb2wgY2hhcmFjdGVyc1xuY29uc3QgQU5TSV9QQVRURVJOID0gL1xceDFiXFxbWzAtOTtdKm0vZztcblxuLyoqXG4gKiBJbml0aWFsaXplIHRoZSBsb2dnZXIgLSBjcmVhdGVzIGxvZyBkaXJlY3RvcnkgYW5kIGZpbGVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGluaXRMb2dnZXIoZGVidWc6IGJvb2xlYW4gPSBmYWxzZSwgdmVyYm9zaXR5PzogVmVyYm9zaXR5TGV2ZWwpOiB2b2lkIHtcbiAgZGVidWdNb2RlID0gZGVidWc7XG5cbiAgLy8gU2V0IHZlcmJvc2l0eSBsZXZlbFxuICBpZiAodmVyYm9zaXR5ICE9PSB1bmRlZmluZWQpIHtcbiAgICB2ZXJib3NpdHlMZXZlbCA9IHZlcmJvc2l0eTtcbiAgfSBlbHNlIGlmIChkZWJ1Zykge1xuICAgIC8vIElmIGRlYnVnIG1vZGUgaXMgZW5hYmxlZCwgc2V0IHZlcmJvc2l0eSB0byBERUJVR1xuICAgIHZlcmJvc2l0eUxldmVsID0gVmVyYm9zaXR5TGV2ZWwuREVCVUc7XG4gIH1cblxuICAvLyBJZiBhbHJlYWR5IGluaXRpYWxpemVkLCBqdXN0IHVwZGF0ZSBkZWJ1ZyBtb2RlIGFuZCByZXR1cm5cbiAgaWYgKGxvZ0ZpbGVIYW5kbGUpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB0cnkge1xuICAgIC8vIEVuc3VyZSBsb2cgZGlyZWN0b3J5IGV4aXN0c1xuICAgIGlmICghZnMuZXhpc3RzU3luYyhMT0dfRElSKSkge1xuICAgICAgZnMubWtkaXJTeW5jKExPR19ESVIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIH1cblxuICAgIC8vIERlbGV0ZSBvbGQgbG9nIGZpbGUgaWYgaXQgZXhpc3RzXG4gICAgdHJ5IHtcbiAgICAgIGlmIChmcy5leGlzdHNTeW5jKExPR19GSUxFKSkge1xuICAgICAgICBmcy51bmxpbmtTeW5jKExPR19GSUxFKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIElnbm9yZSB1bmxpbmsgZXJyb3JzIC0gZmlsZSBtaWdodCBub3QgZXhpc3Qgb3IgYmUgbG9ja2VkXG4gICAgICAvLyBEb24ndCBsb2cgaGVyZSBhcyBsb2dnZXIgaXNuJ3QgZnVsbHkgaW5pdGlhbGl6ZWQgeWV0XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIG5ldyBsb2cgZmlsZSB3cml0ZSBzdHJlYW1cbiAgICBsb2dGaWxlSGFuZGxlID0gZnMuY3JlYXRlV3JpdGVTdHJlYW0oTE9HX0ZJTEUsIHsgZmxhZ3M6ICdhJyB9KTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAvLyBEb24ndCB0aHJvdywganVzdCBsb2cgdG8gY29uc29sZVxuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBpbml0aWFsaXplIGxvZyBmaWxlOicsIGVycm9yKTtcbiAgfVxufVxuXG4vKipcbiAqIEZsdXNoIHRoZSBsb2cgZmlsZSBidWZmZXJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZsdXNoTG9nZ2VyKCk6IFByb21pc2U8dm9pZD4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBpZiAobG9nRmlsZUhhbmRsZSAmJiAhbG9nRmlsZUhhbmRsZS5kZXN0cm95ZWQpIHtcbiAgICAgIC8vIEZvcmNlIGEgd3JpdGUgb2YgYW55IGJ1ZmZlcmVkIGRhdGFcbiAgICAgIGxvZ0ZpbGVIYW5kbGUud3JpdGUoJycsICgpID0+IHtcbiAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc29sdmUoKTtcbiAgICB9XG4gIH0pO1xufVxuXG4vKipcbiAqIENsb3NlIHRoZSBsb2dnZXJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNsb3NlTG9nZ2VyKCk6IHZvaWQge1xuICBpZiAobG9nRmlsZUhhbmRsZSkge1xuICAgIGxvZ0ZpbGVIYW5kbGUuZW5kKCk7XG4gICAgbG9nRmlsZUhhbmRsZSA9IG51bGw7XG4gIH1cbn1cblxuLyoqXG4gKiBGb3JtYXQgbG9nIG1lc3NhZ2Ugd2l0aCB0aW1lc3RhbXBcbiAqL1xuZnVuY3Rpb24gZm9ybWF0TWVzc2FnZShcbiAgbGV2ZWw6IHN0cmluZyxcbiAgbW9kdWxlOiBzdHJpbmcsXG4gIGFyZ3M6IHVua25vd25bXVxuKTogeyBjb25zb2xlOiBzdHJpbmc7IGZpbGU6IHN0cmluZyB9IHtcbiAgY29uc3QgdGltZXN0YW1wID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuXG4gIC8vIEZvcm1hdCBhcmd1bWVudHNcbiAgY29uc3QgbWVzc2FnZSA9IGFyZ3NcbiAgICAubWFwKChhcmcpID0+IHtcbiAgICAgIGlmICh0eXBlb2YgYXJnID09PSAnb2JqZWN0Jykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIC8vIFVzZSBKU09OLnN0cmluZ2lmeSB3aXRoIDItc3BhY2UgaW5kZW50IGZvciBvYmplY3RzXG4gICAgICAgICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KGFyZywgbnVsbCwgMik7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIHJldHVybiBTdHJpbmcoYXJnKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIFN0cmluZyhhcmcpO1xuICAgIH0pXG4gICAgLmpvaW4oJyAnKTtcblxuICAvLyBDb25zb2xlIGZvcm1hdCB3aXRoIGNvbG9yc1xuICBsZXQgY29uc29sZUZvcm1hdDogc3RyaW5nO1xuICBjb25zdCBtb2R1bGVDb2xvciA9IGNoYWxrLmN5YW4oYFske21vZHVsZX1dYCk7XG4gIGNvbnN0IHRpbWVzdGFtcENvbG9yID0gY2hhbGsuZ3JheSh0aW1lc3RhbXApO1xuXG4gIHN3aXRjaCAobGV2ZWwpIHtcbiAgICBjYXNlICdFUlJPUic6XG4gICAgICBjb25zb2xlRm9ybWF0ID0gYCR7dGltZXN0YW1wQ29sb3J9ICR7Y2hhbGsucmVkKGxldmVsKX0gJHttb2R1bGVDb2xvcn0gJHtjaGFsay5yZWQobWVzc2FnZSl9YDtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ1dBUk4nOlxuICAgICAgY29uc29sZUZvcm1hdCA9IGAke3RpbWVzdGFtcENvbG9yfSAke2NoYWxrLnllbGxvdyhsZXZlbCl9ICAke21vZHVsZUNvbG9yfSAke2NoYWxrLnllbGxvdyhtZXNzYWdlKX1gO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnREVCVUcnOlxuICAgICAgY29uc29sZUZvcm1hdCA9IGAke3RpbWVzdGFtcENvbG9yfSAke2NoYWxrLm1hZ2VudGEobGV2ZWwpfSAke21vZHVsZUNvbG9yfSAke2NoYWxrLmdyYXkobWVzc2FnZSl9YDtcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6IC8vIExPR1xuICAgICAgY29uc29sZUZvcm1hdCA9IGAke3RpbWVzdGFtcENvbG9yfSAke2NoYWxrLmdyZWVuKGxldmVsKX0gICAke21vZHVsZUNvbG9yfSAke21lc3NhZ2V9YDtcbiAgfVxuXG4gIC8vIEZpbGUgZm9ybWF0IChubyBjb2xvcnMpXG4gIGNvbnN0IGZpbGVGb3JtYXQgPSBgJHt0aW1lc3RhbXB9ICR7bGV2ZWwucGFkRW5kKDUpfSBbJHttb2R1bGV9XSAke21lc3NhZ2V9YDtcblxuICByZXR1cm4geyBjb25zb2xlOiBjb25zb2xlRm9ybWF0LCBmaWxlOiBmaWxlRm9ybWF0IH07XG59XG5cbi8qKlxuICogV3JpdGUgdG8gbG9nIGZpbGVcbiAqL1xuZnVuY3Rpb24gd3JpdGVUb0ZpbGUobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG4gIGlmIChsb2dGaWxlSGFuZGxlKSB7XG4gICAgdHJ5IHtcbiAgICAgIC8vIFN0cmlwIEFOU0kgY29sb3IgY29kZXMgZnJvbSBtZXNzYWdlXG4gICAgICBjb25zdCBjbGVhbk1lc3NhZ2UgPSBtZXNzYWdlLnJlcGxhY2UoQU5TSV9QQVRURVJOLCAnJyk7XG4gICAgICBsb2dGaWxlSGFuZGxlLndyaXRlKGAke2NsZWFuTWVzc2FnZX1cXG5gKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIFNpbGVudGx5IGlnbm9yZSBmaWxlIHdyaXRlIGVycm9yc1xuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIEVuYWJsZSBvciBkaXNhYmxlIGRlYnVnIG1vZGVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNldERlYnVnTW9kZShlbmFibGVkOiBib29sZWFuKTogdm9pZCB7XG4gIGRlYnVnTW9kZSA9IGVuYWJsZWQ7XG4gIC8vIElmIGVuYWJsaW5nIGRlYnVnIG1vZGUsIGFsc28gc2V0IHZlcmJvc2l0eSB0byBERUJVR1xuICBpZiAoZW5hYmxlZCkge1xuICAgIHZlcmJvc2l0eUxldmVsID0gVmVyYm9zaXR5TGV2ZWwuREVCVUc7XG4gIH1cbn1cblxuLyoqXG4gKiBTZXQgdmVyYm9zaXR5IGxldmVsXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXRWZXJib3NpdHlMZXZlbChsZXZlbDogVmVyYm9zaXR5TGV2ZWwpOiB2b2lkIHtcbiAgdmVyYm9zaXR5TGV2ZWwgPSBsZXZlbDtcbiAgLy8gVXBkYXRlIGRlYnVnIG1vZGUgZmxhZyBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuICBkZWJ1Z01vZGUgPSBsZXZlbCA+PSBWZXJib3NpdHlMZXZlbC5ERUJVRztcbn1cblxuLyoqXG4gKiBHZXQgY3VycmVudCB2ZXJib3NpdHkgbGV2ZWxcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFZlcmJvc2l0eUxldmVsKCk6IFZlcmJvc2l0eUxldmVsIHtcbiAgcmV0dXJuIHZlcmJvc2l0eUxldmVsO1xufVxuXG4vKipcbiAqIENoZWNrIGlmIGRlYnVnIGxvZ2dpbmcgaXMgZW5hYmxlZFxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNEZWJ1Z0VuYWJsZWQoKTogYm9vbGVhbiB7XG4gIHJldHVybiB2ZXJib3NpdHlMZXZlbCA+PSBWZXJib3NpdHlMZXZlbC5ERUJVRztcbn1cblxuLyoqXG4gKiBDaGVjayBpZiB2ZXJib3NlIGxvZ2dpbmcgaXMgZW5hYmxlZFxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNWZXJib3NlKCk6IGJvb2xlYW4ge1xuICByZXR1cm4gdmVyYm9zaXR5TGV2ZWwgPj0gVmVyYm9zaXR5TGV2ZWwuVkVSQk9TRTtcbn1cblxuLyoqXG4gKiBDaGVjayBpZiBhIGxvZyBsZXZlbCBzaG91bGQgYmUgb3V0cHV0IGJhc2VkIG9uIGN1cnJlbnQgdmVyYm9zaXR5XG4gKi9cbmZ1bmN0aW9uIHNob3VsZExvZyhsZXZlbDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHN3aXRjaCAobGV2ZWwpIHtcbiAgICBjYXNlICdFUlJPUic6XG4gICAgICByZXR1cm4gdmVyYm9zaXR5TGV2ZWwgPj0gVmVyYm9zaXR5TGV2ZWwuRVJST1I7XG4gICAgY2FzZSAnV0FSTic6XG4gICAgICByZXR1cm4gdmVyYm9zaXR5TGV2ZWwgPj0gVmVyYm9zaXR5TGV2ZWwuV0FSTjtcbiAgICBjYXNlICdMT0cnOlxuICAgICAgcmV0dXJuIHZlcmJvc2l0eUxldmVsID49IFZlcmJvc2l0eUxldmVsLklORk87XG4gICAgY2FzZSAnREVCVUcnOlxuICAgICAgcmV0dXJuIHZlcmJvc2l0eUxldmVsID49IFZlcmJvc2l0eUxldmVsLkRFQlVHO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgfVxufVxuXG4vKipcbiAqIExvZyBmcm9tIGEgc3BlY2lmaWMgbW9kdWxlICh1c2VkIGJ5IGNsaWVudC1zaWRlIEFQSSlcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGxvZ0Zyb21Nb2R1bGUobGV2ZWw6IHN0cmluZywgbW9kdWxlOiBzdHJpbmcsIGFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuICBjb25zdCB7IGNvbnNvbGU6IGNvbnNvbGVNc2csIGZpbGU6IGZpbGVNc2cgfSA9IGZvcm1hdE1lc3NhZ2UobGV2ZWwsIG1vZHVsZSwgYXJncyk7XG5cbiAgLy8gQWx3YXlzIHdyaXRlIHRvIGZpbGVcbiAgd3JpdGVUb0ZpbGUoZmlsZU1zZyk7XG5cbiAgLy8gQ2hlY2sgaWYgd2Ugc2hvdWxkIG91dHB1dCB0byBjb25zb2xlIGJhc2VkIG9uIHZlcmJvc2l0eVxuICBpZiAoIXNob3VsZExvZyhsZXZlbCkpIHJldHVybjtcblxuICAvLyBMb2cgdG8gY29uc29sZVxuICBzd2l0Y2ggKGxldmVsKSB7XG4gICAgY2FzZSAnRVJST1InOlxuICAgICAgY29uc29sZS5lcnJvcihjb25zb2xlTXNnKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ1dBUk4nOlxuICAgICAgY29uc29sZS53YXJuKGNvbnNvbGVNc2cpO1xuICAgICAgYnJlYWs7XG4gICAgZGVmYXVsdDpcbiAgICAgIGNvbnNvbGUubG9nKGNvbnNvbGVNc2cpO1xuICB9XG59XG5cbi8qKlxuICogQ3JlYXRlIGEgbG9nZ2VyIGZvciBhIHNwZWNpZmljIG1vZHVsZVxuICogVGhpcyBpcyB0aGUgbWFpbiBmYWN0b3J5IGZ1bmN0aW9uIHRoYXQgc2hvdWxkIGJlIHVzZWRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUxvZ2dlcihtb2R1bGVOYW1lOiBzdHJpbmcpIHtcbiAgLy8gQWRkIFtTUlZdIHByZWZpeCB0byBzZXJ2ZXItb3JpZ2luYXRlZCBsb2dzIHVubGVzcyBpdCBhbHJlYWR5IGhhcyBhIHByZWZpeFxuICBjb25zdCBwcmVmaXhlZE1vZHVsZU5hbWUgPSBtb2R1bGVOYW1lLnN0YXJ0c1dpdGgoJ1snKSA/IG1vZHVsZU5hbWUgOiBgW1NSVl0gJHttb2R1bGVOYW1lfWA7XG5cbiAgcmV0dXJuIHtcbiAgICAvKipcbiAgICAgKiBAZGVwcmVjYXRlZCBVc2UgaW5mbygpIGluc3RlYWQgZm9yIGNsYXJpdHlcbiAgICAgKi9cbiAgICBsb2c6ICguLi5hcmdzOiB1bmtub3duW10pID0+IHtcbiAgICAgIGNvbnN0IHsgY29uc29sZTogY29uc29sZU1zZywgZmlsZTogZmlsZU1zZyB9ID0gZm9ybWF0TWVzc2FnZSgnTE9HJywgcHJlZml4ZWRNb2R1bGVOYW1lLCBhcmdzKTtcbiAgICAgIHdyaXRlVG9GaWxlKGZpbGVNc2cpOyAvLyBBbHdheXMgd3JpdGUgdG8gZmlsZVxuICAgICAgaWYgKHNob3VsZExvZygnTE9HJykpIHtcbiAgICAgICAgY29uc29sZS5sb2coY29uc29sZU1zZyk7XG4gICAgICB9XG4gICAgfSxcbiAgICBpbmZvOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiB7XG4gICAgICBjb25zdCB7IGNvbnNvbGU6IGNvbnNvbGVNc2csIGZpbGU6IGZpbGVNc2cgfSA9IGZvcm1hdE1lc3NhZ2UoJ0xPRycsIHByZWZpeGVkTW9kdWxlTmFtZSwgYXJncyk7XG4gICAgICB3cml0ZVRvRmlsZShmaWxlTXNnKTsgLy8gQWx3YXlzIHdyaXRlIHRvIGZpbGVcbiAgICAgIGlmIChzaG91bGRMb2coJ0xPRycpKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGNvbnNvbGVNc2cpO1xuICAgICAgfVxuICAgIH0sXG4gICAgd2FybjogKC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuICAgICAgY29uc3QgeyBjb25zb2xlOiBjb25zb2xlTXNnLCBmaWxlOiBmaWxlTXNnIH0gPSBmb3JtYXRNZXNzYWdlKFxuICAgICAgICAnV0FSTicsXG4gICAgICAgIHByZWZpeGVkTW9kdWxlTmFtZSxcbiAgICAgICAgYXJnc1xuICAgICAgKTtcbiAgICAgIHdyaXRlVG9GaWxlKGZpbGVNc2cpOyAvLyBBbHdheXMgd3JpdGUgdG8gZmlsZVxuICAgICAgaWYgKHNob3VsZExvZygnV0FSTicpKSB7XG4gICAgICAgIGNvbnNvbGUud2Fybihjb25zb2xlTXNnKTtcbiAgICAgIH1cbiAgICB9LFxuICAgIGVycm9yOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiB7XG4gICAgICBjb25zdCB7IGNvbnNvbGU6IGNvbnNvbGVNc2csIGZpbGU6IGZpbGVNc2cgfSA9IGZvcm1hdE1lc3NhZ2UoXG4gICAgICAgICdFUlJPUicsXG4gICAgICAgIHByZWZpeGVkTW9kdWxlTmFtZSxcbiAgICAgICAgYXJnc1xuICAgICAgKTtcbiAgICAgIHdyaXRlVG9GaWxlKGZpbGVNc2cpOyAvLyBBbHdheXMgd3JpdGUgdG8gZmlsZVxuICAgICAgaWYgKHNob3VsZExvZygnRVJST1InKSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKGNvbnNvbGVNc2cpO1xuICAgICAgfVxuICAgIH0sXG4gICAgZGVidWc6ICguLi5hcmdzOiB1bmtub3duW10pID0+IHtcbiAgICAgIGNvbnN0IHsgY29uc29sZTogY29uc29sZU1zZywgZmlsZTogZmlsZU1zZyB9ID0gZm9ybWF0TWVzc2FnZShcbiAgICAgICAgJ0RFQlVHJyxcbiAgICAgICAgcHJlZml4ZWRNb2R1bGVOYW1lLFxuICAgICAgICBhcmdzXG4gICAgICApO1xuICAgICAgd3JpdGVUb0ZpbGUoZmlsZU1zZyk7IC8vIEFsd2F5cyB3cml0ZSB0byBmaWxlXG4gICAgICBpZiAoc2hvdWxkTG9nKCdERUJVRycpKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGNvbnNvbGVNc2cpO1xuICAgICAgfVxuICAgIH0sXG4gICAgc2V0RGVidWdNb2RlOiAoZW5hYmxlZDogYm9vbGVhbikgPT4gc2V0RGVidWdNb2RlKGVuYWJsZWQpLFxuICAgIHNldFZlcmJvc2l0eTogKGxldmVsOiBWZXJib3NpdHlMZXZlbCkgPT4gc2V0VmVyYm9zaXR5TGV2ZWwobGV2ZWwpLFxuICB9O1xufVxuIl19