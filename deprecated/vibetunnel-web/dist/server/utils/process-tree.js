"use strict";
/**
 * Process tree utilities for detecting parent processes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProcessTree = getProcessTree;
exports.isClaudeInProcessTree = isClaudeInProcessTree;
exports.getClaudeCommandFromTree = getClaudeCommandFromTree;
const child_process_1 = require("child_process");
const logger_js_1 = require("./logger.js");
const logger = (0, logger_js_1.createLogger)('process-tree');
/**
 * Get the process tree starting from current process up to root
 * Returns array of process info from current to root
 */
function getProcessTree() {
    const tree = [];
    let currentPid = process.pid;
    // Safety limit to prevent infinite loops
    const maxDepth = 20;
    let depth = 0;
    while (currentPid > 0 && depth < maxDepth) {
        try {
            // Use ps to get process info
            // Format: PID PPID COMMAND
            const output = (0, child_process_1.execSync)(`ps -p ${currentPid} -o pid,ppid,command`, {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'], // Suppress stderr
            });
            const lines = output.trim().split('\n');
            if (lines.length < 2)
                break; // No data line after header
            const dataLine = lines[1].trim();
            const parts = dataLine.split(/\s+/);
            if (parts.length < 3)
                break;
            const pid = Number.parseInt(parts[0], 10);
            const ppid = Number.parseInt(parts[1], 10);
            // Command is everything after ppid
            const command = parts.slice(2).join(' ');
            tree.push({ pid, ppid, command });
            // Move to parent
            currentPid = ppid;
            depth++;
            // Stop at init process
            if (ppid === 0 || ppid === 1)
                break;
        }
        catch (error) {
            // Process might have disappeared or ps failed
            logger.debug(`Failed to get info for PID ${currentPid}:`, error);
            break;
        }
    }
    return tree;
}
/**
 * Check if any process in the tree matches Claude patterns
 * Returns true if Claude is detected in the process tree
 */
function isClaudeInProcessTree() {
    try {
        const tree = getProcessTree();
        // Patterns that indicate Claude is running
        const claudePatterns = [
            /\bclaude\b/i, // Direct claude command
            /\bcly\b/i, // cly wrapper
            /claude-wrapper/i, // Claude wrapper script
            /node.*claude/i, // Node running claude
            /tsx.*claude/i, // tsx running claude
            /bun.*claude/i, // bun running claude
            /npx.*claude/i, // npx claude
            /claude-code/i, // claude-code command
        ];
        for (const proc of tree) {
            const matched = claudePatterns.some((pattern) => pattern.test(proc.command));
            if (matched) {
                logger.debug(`Claude detected in process tree: PID ${proc.pid}, Command: ${proc.command}`);
                return true;
            }
        }
        // Log tree for debugging if VIBETUNNEL_CLAUDE_DEBUG is set
        if (process.env.VIBETUNNEL_CLAUDE_DEBUG === 'true') {
            logger.debug('Process tree:');
            tree.forEach((proc, index) => {
                logger.debug(`  ${' '.repeat(index * 2)}[${proc.pid}] ${proc.command}`);
            });
        }
        return false;
    }
    catch (error) {
        logger.debug('Failed to check process tree:', error);
        // Fall back to false if we can't check
        return false;
    }
}
/**
 * Get the Claude command from the process tree if available
 * Returns the full command line of the Claude process or null
 */
function getClaudeCommandFromTree() {
    try {
        const tree = getProcessTree();
        // Find the first Claude process
        const claudePatterns = [/\bclaude\b/i, /\bcly\b/i, /claude-wrapper/i, /claude-code/i];
        for (const proc of tree) {
            const matched = claudePatterns.some((pattern) => pattern.test(proc.command));
            if (matched) {
                return proc.command;
            }
        }
        return null;
    }
    catch (error) {
        logger.debug('Failed to get Claude command from tree:', error);
        return null;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzcy10cmVlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NlcnZlci91dGlscy9wcm9jZXNzLXRyZWUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOztHQUVHOztBQWlCSCx3Q0E4Q0M7QUFNRCxzREFzQ0M7QUFNRCw0REFtQkM7QUFsSUQsaURBQXlDO0FBQ3pDLDJDQUEyQztBQUUzQyxNQUFNLE1BQU0sR0FBRyxJQUFBLHdCQUFZLEVBQUMsY0FBYyxDQUFDLENBQUM7QUFRNUM7OztHQUdHO0FBQ0gsU0FBZ0IsY0FBYztJQUM1QixNQUFNLElBQUksR0FBa0IsRUFBRSxDQUFDO0lBQy9CLElBQUksVUFBVSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUM7SUFFN0IseUNBQXlDO0lBQ3pDLE1BQU0sUUFBUSxHQUFHLEVBQUUsQ0FBQztJQUNwQixJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7SUFFZCxPQUFPLFVBQVUsR0FBRyxDQUFDLElBQUksS0FBSyxHQUFHLFFBQVEsRUFBRSxDQUFDO1FBQzFDLElBQUksQ0FBQztZQUNILDZCQUE2QjtZQUM3QiwyQkFBMkI7WUFDM0IsTUFBTSxNQUFNLEdBQUcsSUFBQSx3QkFBUSxFQUFDLFNBQVMsVUFBVSxzQkFBc0IsRUFBRTtnQkFDakUsUUFBUSxFQUFFLE1BQU07Z0JBQ2hCLEtBQUssRUFBRSxDQUFDLFFBQVEsRUFBRSxNQUFNLEVBQUUsUUFBUSxDQUFDLEVBQUUsa0JBQWtCO2FBQ3hELENBQUMsQ0FBQztZQUVILE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDeEMsSUFBSSxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUM7Z0JBQUUsTUFBTSxDQUFDLDRCQUE0QjtZQUV6RCxNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDakMsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUVwQyxJQUFJLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQztnQkFBRSxNQUFNO1lBRTVCLE1BQU0sR0FBRyxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQzFDLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQzNDLG1DQUFtQztZQUNuQyxNQUFNLE9BQU8sR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUV6QyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDO1lBRWxDLGlCQUFpQjtZQUNqQixVQUFVLEdBQUcsSUFBSSxDQUFDO1lBQ2xCLEtBQUssRUFBRSxDQUFDO1lBRVIsdUJBQXVCO1lBQ3ZCLElBQUksSUFBSSxLQUFLLENBQUMsSUFBSSxJQUFJLEtBQUssQ0FBQztnQkFBRSxNQUFNO1FBQ3RDLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsOENBQThDO1lBQzlDLE1BQU0sQ0FBQyxLQUFLLENBQUMsOEJBQThCLFVBQVUsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ2pFLE1BQU07UUFDUixDQUFDO0lBQ0gsQ0FBQztJQUVELE9BQU8sSUFBSSxDQUFDO0FBQ2QsQ0FBQztBQUVEOzs7R0FHRztBQUNILFNBQWdCLHFCQUFxQjtJQUNuQyxJQUFJLENBQUM7UUFDSCxNQUFNLElBQUksR0FBRyxjQUFjLEVBQUUsQ0FBQztRQUU5QiwyQ0FBMkM7UUFDM0MsTUFBTSxjQUFjLEdBQUc7WUFDckIsYUFBYSxFQUFFLHdCQUF3QjtZQUN2QyxVQUFVLEVBQUUsY0FBYztZQUMxQixpQkFBaUIsRUFBRSx3QkFBd0I7WUFDM0MsZUFBZSxFQUFFLHNCQUFzQjtZQUN2QyxjQUFjLEVBQUUscUJBQXFCO1lBQ3JDLGNBQWMsRUFBRSxxQkFBcUI7WUFDckMsY0FBYyxFQUFFLGFBQWE7WUFDN0IsY0FBYyxFQUFFLHNCQUFzQjtTQUN2QyxDQUFDO1FBRUYsS0FBSyxNQUFNLElBQUksSUFBSSxJQUFJLEVBQUUsQ0FBQztZQUN4QixNQUFNLE9BQU8sR0FBRyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQzdFLElBQUksT0FBTyxFQUFFLENBQUM7Z0JBQ1osTUFBTSxDQUFDLEtBQUssQ0FBQyx3Q0FBd0MsSUFBSSxDQUFDLEdBQUcsY0FBYyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztnQkFDM0YsT0FBTyxJQUFJLENBQUM7WUFDZCxDQUFDO1FBQ0gsQ0FBQztRQUVELDJEQUEyRDtRQUMzRCxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUJBQXVCLEtBQUssTUFBTSxFQUFFLENBQUM7WUFDbkQsTUFBTSxDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUM5QixJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxFQUFFO2dCQUMzQixNQUFNLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLEdBQUcsS0FBSyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztZQUMxRSxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCxPQUFPLEtBQUssQ0FBQztJQUNmLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsTUFBTSxDQUFDLEtBQUssQ0FBQywrQkFBK0IsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNyRCx1Q0FBdUM7UUFDdkMsT0FBTyxLQUFLLENBQUM7SUFDZixDQUFDO0FBQ0gsQ0FBQztBQUVEOzs7R0FHRztBQUNILFNBQWdCLHdCQUF3QjtJQUN0QyxJQUFJLENBQUM7UUFDSCxNQUFNLElBQUksR0FBRyxjQUFjLEVBQUUsQ0FBQztRQUU5QixnQ0FBZ0M7UUFDaEMsTUFBTSxjQUFjLEdBQUcsQ0FBQyxhQUFhLEVBQUUsVUFBVSxFQUFFLGlCQUFpQixFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBRXRGLEtBQUssTUFBTSxJQUFJLElBQUksSUFBSSxFQUFFLENBQUM7WUFDeEIsTUFBTSxPQUFPLEdBQUcsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUM3RSxJQUFJLE9BQU8sRUFBRSxDQUFDO2dCQUNaLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQztZQUN0QixDQUFDO1FBQ0gsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixNQUFNLENBQUMsS0FBSyxDQUFDLHlDQUF5QyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQy9ELE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFByb2Nlc3MgdHJlZSB1dGlsaXRpZXMgZm9yIGRldGVjdGluZyBwYXJlbnQgcHJvY2Vzc2VzXG4gKi9cblxuaW1wb3J0IHsgZXhlY1N5bmMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IGNyZWF0ZUxvZ2dlciB9IGZyb20gJy4vbG9nZ2VyLmpzJztcblxuY29uc3QgbG9nZ2VyID0gY3JlYXRlTG9nZ2VyKCdwcm9jZXNzLXRyZWUnKTtcblxuaW50ZXJmYWNlIFByb2Nlc3NJbmZvIHtcbiAgcGlkOiBudW1iZXI7XG4gIHBwaWQ6IG51bWJlcjtcbiAgY29tbWFuZDogc3RyaW5nO1xufVxuXG4vKipcbiAqIEdldCB0aGUgcHJvY2VzcyB0cmVlIHN0YXJ0aW5nIGZyb20gY3VycmVudCBwcm9jZXNzIHVwIHRvIHJvb3RcbiAqIFJldHVybnMgYXJyYXkgb2YgcHJvY2VzcyBpbmZvIGZyb20gY3VycmVudCB0byByb290XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRQcm9jZXNzVHJlZSgpOiBQcm9jZXNzSW5mb1tdIHtcbiAgY29uc3QgdHJlZTogUHJvY2Vzc0luZm9bXSA9IFtdO1xuICBsZXQgY3VycmVudFBpZCA9IHByb2Nlc3MucGlkO1xuXG4gIC8vIFNhZmV0eSBsaW1pdCB0byBwcmV2ZW50IGluZmluaXRlIGxvb3BzXG4gIGNvbnN0IG1heERlcHRoID0gMjA7XG4gIGxldCBkZXB0aCA9IDA7XG5cbiAgd2hpbGUgKGN1cnJlbnRQaWQgPiAwICYmIGRlcHRoIDwgbWF4RGVwdGgpIHtcbiAgICB0cnkge1xuICAgICAgLy8gVXNlIHBzIHRvIGdldCBwcm9jZXNzIGluZm9cbiAgICAgIC8vIEZvcm1hdDogUElEIFBQSUQgQ09NTUFORFxuICAgICAgY29uc3Qgb3V0cHV0ID0gZXhlY1N5bmMoYHBzIC1wICR7Y3VycmVudFBpZH0gLW8gcGlkLHBwaWQsY29tbWFuZGAsIHtcbiAgICAgICAgZW5jb2Rpbmc6ICd1dGY4JyxcbiAgICAgICAgc3RkaW86IFsnaWdub3JlJywgJ3BpcGUnLCAnaWdub3JlJ10sIC8vIFN1cHByZXNzIHN0ZGVyclxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IGxpbmVzID0gb3V0cHV0LnRyaW0oKS5zcGxpdCgnXFxuJyk7XG4gICAgICBpZiAobGluZXMubGVuZ3RoIDwgMikgYnJlYWs7IC8vIE5vIGRhdGEgbGluZSBhZnRlciBoZWFkZXJcblxuICAgICAgY29uc3QgZGF0YUxpbmUgPSBsaW5lc1sxXS50cmltKCk7XG4gICAgICBjb25zdCBwYXJ0cyA9IGRhdGFMaW5lLnNwbGl0KC9cXHMrLyk7XG5cbiAgICAgIGlmIChwYXJ0cy5sZW5ndGggPCAzKSBicmVhaztcblxuICAgICAgY29uc3QgcGlkID0gTnVtYmVyLnBhcnNlSW50KHBhcnRzWzBdLCAxMCk7XG4gICAgICBjb25zdCBwcGlkID0gTnVtYmVyLnBhcnNlSW50KHBhcnRzWzFdLCAxMCk7XG4gICAgICAvLyBDb21tYW5kIGlzIGV2ZXJ5dGhpbmcgYWZ0ZXIgcHBpZFxuICAgICAgY29uc3QgY29tbWFuZCA9IHBhcnRzLnNsaWNlKDIpLmpvaW4oJyAnKTtcblxuICAgICAgdHJlZS5wdXNoKHsgcGlkLCBwcGlkLCBjb21tYW5kIH0pO1xuXG4gICAgICAvLyBNb3ZlIHRvIHBhcmVudFxuICAgICAgY3VycmVudFBpZCA9IHBwaWQ7XG4gICAgICBkZXB0aCsrO1xuXG4gICAgICAvLyBTdG9wIGF0IGluaXQgcHJvY2Vzc1xuICAgICAgaWYgKHBwaWQgPT09IDAgfHwgcHBpZCA9PT0gMSkgYnJlYWs7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIC8vIFByb2Nlc3MgbWlnaHQgaGF2ZSBkaXNhcHBlYXJlZCBvciBwcyBmYWlsZWRcbiAgICAgIGxvZ2dlci5kZWJ1ZyhgRmFpbGVkIHRvIGdldCBpbmZvIGZvciBQSUQgJHtjdXJyZW50UGlkfTpgLCBlcnJvcik7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdHJlZTtcbn1cblxuLyoqXG4gKiBDaGVjayBpZiBhbnkgcHJvY2VzcyBpbiB0aGUgdHJlZSBtYXRjaGVzIENsYXVkZSBwYXR0ZXJuc1xuICogUmV0dXJucyB0cnVlIGlmIENsYXVkZSBpcyBkZXRlY3RlZCBpbiB0aGUgcHJvY2VzcyB0cmVlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0NsYXVkZUluUHJvY2Vzc1RyZWUoKTogYm9vbGVhbiB7XG4gIHRyeSB7XG4gICAgY29uc3QgdHJlZSA9IGdldFByb2Nlc3NUcmVlKCk7XG5cbiAgICAvLyBQYXR0ZXJucyB0aGF0IGluZGljYXRlIENsYXVkZSBpcyBydW5uaW5nXG4gICAgY29uc3QgY2xhdWRlUGF0dGVybnMgPSBbXG4gICAgICAvXFxiY2xhdWRlXFxiL2ksIC8vIERpcmVjdCBjbGF1ZGUgY29tbWFuZFxuICAgICAgL1xcYmNseVxcYi9pLCAvLyBjbHkgd3JhcHBlclxuICAgICAgL2NsYXVkZS13cmFwcGVyL2ksIC8vIENsYXVkZSB3cmFwcGVyIHNjcmlwdFxuICAgICAgL25vZGUuKmNsYXVkZS9pLCAvLyBOb2RlIHJ1bm5pbmcgY2xhdWRlXG4gICAgICAvdHN4LipjbGF1ZGUvaSwgLy8gdHN4IHJ1bm5pbmcgY2xhdWRlXG4gICAgICAvYnVuLipjbGF1ZGUvaSwgLy8gYnVuIHJ1bm5pbmcgY2xhdWRlXG4gICAgICAvbnB4LipjbGF1ZGUvaSwgLy8gbnB4IGNsYXVkZVxuICAgICAgL2NsYXVkZS1jb2RlL2ksIC8vIGNsYXVkZS1jb2RlIGNvbW1hbmRcbiAgICBdO1xuXG4gICAgZm9yIChjb25zdCBwcm9jIG9mIHRyZWUpIHtcbiAgICAgIGNvbnN0IG1hdGNoZWQgPSBjbGF1ZGVQYXR0ZXJucy5zb21lKChwYXR0ZXJuKSA9PiBwYXR0ZXJuLnRlc3QocHJvYy5jb21tYW5kKSk7XG4gICAgICBpZiAobWF0Y2hlZCkge1xuICAgICAgICBsb2dnZXIuZGVidWcoYENsYXVkZSBkZXRlY3RlZCBpbiBwcm9jZXNzIHRyZWU6IFBJRCAke3Byb2MucGlkfSwgQ29tbWFuZDogJHtwcm9jLmNvbW1hbmR9YCk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIExvZyB0cmVlIGZvciBkZWJ1Z2dpbmcgaWYgVklCRVRVTk5FTF9DTEFVREVfREVCVUcgaXMgc2V0XG4gICAgaWYgKHByb2Nlc3MuZW52LlZJQkVUVU5ORUxfQ0xBVURFX0RFQlVHID09PSAndHJ1ZScpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZygnUHJvY2VzcyB0cmVlOicpO1xuICAgICAgdHJlZS5mb3JFYWNoKChwcm9jLCBpbmRleCkgPT4ge1xuICAgICAgICBsb2dnZXIuZGVidWcoYCAgJHsnICcucmVwZWF0KGluZGV4ICogMil9WyR7cHJvYy5waWR9XSAke3Byb2MuY29tbWFuZH1gKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBmYWxzZTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBsb2dnZXIuZGVidWcoJ0ZhaWxlZCB0byBjaGVjayBwcm9jZXNzIHRyZWU6JywgZXJyb3IpO1xuICAgIC8vIEZhbGwgYmFjayB0byBmYWxzZSBpZiB3ZSBjYW4ndCBjaGVja1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuXG4vKipcbiAqIEdldCB0aGUgQ2xhdWRlIGNvbW1hbmQgZnJvbSB0aGUgcHJvY2VzcyB0cmVlIGlmIGF2YWlsYWJsZVxuICogUmV0dXJucyB0aGUgZnVsbCBjb21tYW5kIGxpbmUgb2YgdGhlIENsYXVkZSBwcm9jZXNzIG9yIG51bGxcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldENsYXVkZUNvbW1hbmRGcm9tVHJlZSgpOiBzdHJpbmcgfCBudWxsIHtcbiAgdHJ5IHtcbiAgICBjb25zdCB0cmVlID0gZ2V0UHJvY2Vzc1RyZWUoKTtcblxuICAgIC8vIEZpbmQgdGhlIGZpcnN0IENsYXVkZSBwcm9jZXNzXG4gICAgY29uc3QgY2xhdWRlUGF0dGVybnMgPSBbL1xcYmNsYXVkZVxcYi9pLCAvXFxiY2x5XFxiL2ksIC9jbGF1ZGUtd3JhcHBlci9pLCAvY2xhdWRlLWNvZGUvaV07XG5cbiAgICBmb3IgKGNvbnN0IHByb2Mgb2YgdHJlZSkge1xuICAgICAgY29uc3QgbWF0Y2hlZCA9IGNsYXVkZVBhdHRlcm5zLnNvbWUoKHBhdHRlcm4pID0+IHBhdHRlcm4udGVzdChwcm9jLmNvbW1hbmQpKTtcbiAgICAgIGlmIChtYXRjaGVkKSB7XG4gICAgICAgIHJldHVybiBwcm9jLmNvbW1hbmQ7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIG51bGw7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgbG9nZ2VyLmRlYnVnKCdGYWlsZWQgdG8gZ2V0IENsYXVkZSBjb21tYW5kIGZyb20gdHJlZTonLCBlcnJvcik7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cbiJdfQ==