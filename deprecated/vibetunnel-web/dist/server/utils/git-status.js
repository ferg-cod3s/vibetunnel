"use strict";
/**
 * Shared Git Status Utilities
 *
 * Provides a single implementation for parsing git status output
 * to avoid duplication across the codebase.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDetailedGitStatus = getDetailedGitStatus;
const child_process_1 = require("child_process");
const util_1 = require("util");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
/**
 * Get detailed git status including file counts and ahead/behind info
 * @param workingDir The directory to check git status in
 * @returns Git status counts or null if not a git repository
 */
async function getDetailedGitStatus(workingDir) {
    try {
        const { stdout: statusOutput } = await execFileAsync('git', ['status', '--porcelain=v1', '--branch'], {
            cwd: workingDir,
            timeout: 5000,
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        });
        const lines = statusOutput.trim().split('\n');
        const branchLine = lines[0];
        let aheadCount = 0;
        let behindCount = 0;
        let modifiedCount = 0;
        let addedCount = 0;
        let stagedCount = 0;
        let deletedCount = 0;
        // Parse branch line for ahead/behind info
        if (branchLine?.startsWith('##')) {
            const aheadMatch = branchLine.match(/\[ahead (\d+)/);
            const behindMatch = branchLine.match(/behind (\d+)/);
            if (aheadMatch) {
                aheadCount = Number.parseInt(aheadMatch[1], 10);
            }
            if (behindMatch) {
                behindCount = Number.parseInt(behindMatch[1], 10);
            }
        }
        // Parse file statuses
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line || line.length < 2)
                continue;
            const indexStatus = line[0];
            const workingStatus = line[1];
            // Staged files (changes in index)
            if (indexStatus !== ' ' && indexStatus !== '?') {
                stagedCount++;
            }
            // Working directory changes
            if (workingStatus === 'M') {
                modifiedCount++;
            }
            else if (workingStatus === 'D' && indexStatus === ' ') {
                // Deleted in working tree but not staged
                deletedCount++;
            }
            // Added files (untracked)
            if (indexStatus === '?' && workingStatus === '?') {
                addedCount++;
            }
        }
        return {
            modified: modifiedCount,
            added: addedCount,
            staged: stagedCount,
            deleted: deletedCount,
            ahead: aheadCount,
            behind: behindCount,
        };
    }
    catch (_error) {
        // Not a git repository or git command failed
        return {
            modified: 0,
            added: 0,
            staged: 0,
            deleted: 0,
            ahead: 0,
            behind: 0,
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0LXN0YXR1cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zZXJ2ZXIvdXRpbHMvZ2l0LXN0YXR1cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7O0dBS0c7O0FBcUJILG9EQWlGQztBQXBHRCxpREFBeUM7QUFDekMsK0JBQWlDO0FBRWpDLE1BQU0sYUFBYSxHQUFHLElBQUEsZ0JBQVMsRUFBQyx3QkFBUSxDQUFDLENBQUM7QUFXMUM7Ozs7R0FJRztBQUNJLEtBQUssVUFBVSxvQkFBb0IsQ0FBQyxVQUFrQjtJQUMzRCxJQUFJLENBQUM7UUFDSCxNQUFNLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBRSxHQUFHLE1BQU0sYUFBYSxDQUNsRCxLQUFLLEVBQ0wsQ0FBQyxRQUFRLEVBQUUsZ0JBQWdCLEVBQUUsVUFBVSxDQUFDLEVBQ3hDO1lBQ0UsR0FBRyxFQUFFLFVBQVU7WUFDZixPQUFPLEVBQUUsSUFBSTtZQUNiLEdBQUcsRUFBRSxFQUFFLEdBQUcsT0FBTyxDQUFDLEdBQUcsRUFBRSxtQkFBbUIsRUFBRSxHQUFHLEVBQUU7U0FDbEQsQ0FDRixDQUFDO1FBRUYsTUFBTSxLQUFLLEdBQUcsWUFBWSxDQUFDLElBQUksRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM5QyxNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFNUIsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO1FBQ25CLElBQUksV0FBVyxHQUFHLENBQUMsQ0FBQztRQUNwQixJQUFJLGFBQWEsR0FBRyxDQUFDLENBQUM7UUFDdEIsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO1FBQ25CLElBQUksV0FBVyxHQUFHLENBQUMsQ0FBQztRQUNwQixJQUFJLFlBQVksR0FBRyxDQUFDLENBQUM7UUFFckIsMENBQTBDO1FBQzFDLElBQUksVUFBVSxFQUFFLFVBQVUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ2pDLE1BQU0sVUFBVSxHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDckQsTUFBTSxXQUFXLEdBQUcsVUFBVSxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUVyRCxJQUFJLFVBQVUsRUFBRSxDQUFDO2dCQUNmLFVBQVUsR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUNsRCxDQUFDO1lBQ0QsSUFBSSxXQUFXLEVBQUUsQ0FBQztnQkFDaEIsV0FBVyxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ3BELENBQUM7UUFDSCxDQUFDO1FBRUQsc0JBQXNCO1FBQ3RCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDdEMsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3RCLElBQUksQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDO2dCQUFFLFNBQVM7WUFFdkMsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzVCLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUU5QixrQ0FBa0M7WUFDbEMsSUFBSSxXQUFXLEtBQUssR0FBRyxJQUFJLFdBQVcsS0FBSyxHQUFHLEVBQUUsQ0FBQztnQkFDL0MsV0FBVyxFQUFFLENBQUM7WUFDaEIsQ0FBQztZQUVELDRCQUE0QjtZQUM1QixJQUFJLGFBQWEsS0FBSyxHQUFHLEVBQUUsQ0FBQztnQkFDMUIsYUFBYSxFQUFFLENBQUM7WUFDbEIsQ0FBQztpQkFBTSxJQUFJLGFBQWEsS0FBSyxHQUFHLElBQUksV0FBVyxLQUFLLEdBQUcsRUFBRSxDQUFDO2dCQUN4RCx5Q0FBeUM7Z0JBQ3pDLFlBQVksRUFBRSxDQUFDO1lBQ2pCLENBQUM7WUFFRCwwQkFBMEI7WUFDMUIsSUFBSSxXQUFXLEtBQUssR0FBRyxJQUFJLGFBQWEsS0FBSyxHQUFHLEVBQUUsQ0FBQztnQkFDakQsVUFBVSxFQUFFLENBQUM7WUFDZixDQUFDO1FBQ0gsQ0FBQztRQUVELE9BQU87WUFDTCxRQUFRLEVBQUUsYUFBYTtZQUN2QixLQUFLLEVBQUUsVUFBVTtZQUNqQixNQUFNLEVBQUUsV0FBVztZQUNuQixPQUFPLEVBQUUsWUFBWTtZQUNyQixLQUFLLEVBQUUsVUFBVTtZQUNqQixNQUFNLEVBQUUsV0FBVztTQUNwQixDQUFDO0lBQ0osQ0FBQztJQUFDLE9BQU8sTUFBTSxFQUFFLENBQUM7UUFDaEIsNkNBQTZDO1FBQzdDLE9BQU87WUFDTCxRQUFRLEVBQUUsQ0FBQztZQUNYLEtBQUssRUFBRSxDQUFDO1lBQ1IsTUFBTSxFQUFFLENBQUM7WUFDVCxPQUFPLEVBQUUsQ0FBQztZQUNWLEtBQUssRUFBRSxDQUFDO1lBQ1IsTUFBTSxFQUFFLENBQUM7U0FDVixDQUFDO0lBQ0osQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFNoYXJlZCBHaXQgU3RhdHVzIFV0aWxpdGllc1xuICpcbiAqIFByb3ZpZGVzIGEgc2luZ2xlIGltcGxlbWVudGF0aW9uIGZvciBwYXJzaW5nIGdpdCBzdGF0dXMgb3V0cHV0XG4gKiB0byBhdm9pZCBkdXBsaWNhdGlvbiBhY3Jvc3MgdGhlIGNvZGViYXNlLlxuICovXG5cbmltcG9ydCB7IGV4ZWNGaWxlIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgeyBwcm9taXNpZnkgfSBmcm9tICd1dGlsJztcblxuY29uc3QgZXhlY0ZpbGVBc3luYyA9IHByb21pc2lmeShleGVjRmlsZSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgR2l0U3RhdHVzQ291bnRzIHtcbiAgbW9kaWZpZWQ6IG51bWJlcjtcbiAgYWRkZWQ6IG51bWJlcjtcbiAgc3RhZ2VkOiBudW1iZXI7XG4gIGRlbGV0ZWQ6IG51bWJlcjtcbiAgYWhlYWQ6IG51bWJlcjtcbiAgYmVoaW5kOiBudW1iZXI7XG59XG5cbi8qKlxuICogR2V0IGRldGFpbGVkIGdpdCBzdGF0dXMgaW5jbHVkaW5nIGZpbGUgY291bnRzIGFuZCBhaGVhZC9iZWhpbmQgaW5mb1xuICogQHBhcmFtIHdvcmtpbmdEaXIgVGhlIGRpcmVjdG9yeSB0byBjaGVjayBnaXQgc3RhdHVzIGluXG4gKiBAcmV0dXJucyBHaXQgc3RhdHVzIGNvdW50cyBvciBudWxsIGlmIG5vdCBhIGdpdCByZXBvc2l0b3J5XG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXREZXRhaWxlZEdpdFN0YXR1cyh3b3JraW5nRGlyOiBzdHJpbmcpOiBQcm9taXNlPEdpdFN0YXR1c0NvdW50cz4ge1xuICB0cnkge1xuICAgIGNvbnN0IHsgc3Rkb3V0OiBzdGF0dXNPdXRwdXQgfSA9IGF3YWl0IGV4ZWNGaWxlQXN5bmMoXG4gICAgICAnZ2l0JyxcbiAgICAgIFsnc3RhdHVzJywgJy0tcG9yY2VsYWluPXYxJywgJy0tYnJhbmNoJ10sXG4gICAgICB7XG4gICAgICAgIGN3ZDogd29ya2luZ0RpcixcbiAgICAgICAgdGltZW91dDogNTAwMCxcbiAgICAgICAgZW52OiB7IC4uLnByb2Nlc3MuZW52LCBHSVRfVEVSTUlOQUxfUFJPTVBUOiAnMCcgfSxcbiAgICAgIH1cbiAgICApO1xuXG4gICAgY29uc3QgbGluZXMgPSBzdGF0dXNPdXRwdXQudHJpbSgpLnNwbGl0KCdcXG4nKTtcbiAgICBjb25zdCBicmFuY2hMaW5lID0gbGluZXNbMF07XG5cbiAgICBsZXQgYWhlYWRDb3VudCA9IDA7XG4gICAgbGV0IGJlaGluZENvdW50ID0gMDtcbiAgICBsZXQgbW9kaWZpZWRDb3VudCA9IDA7XG4gICAgbGV0IGFkZGVkQ291bnQgPSAwO1xuICAgIGxldCBzdGFnZWRDb3VudCA9IDA7XG4gICAgbGV0IGRlbGV0ZWRDb3VudCA9IDA7XG5cbiAgICAvLyBQYXJzZSBicmFuY2ggbGluZSBmb3IgYWhlYWQvYmVoaW5kIGluZm9cbiAgICBpZiAoYnJhbmNoTGluZT8uc3RhcnRzV2l0aCgnIyMnKSkge1xuICAgICAgY29uc3QgYWhlYWRNYXRjaCA9IGJyYW5jaExpbmUubWF0Y2goL1xcW2FoZWFkIChcXGQrKS8pO1xuICAgICAgY29uc3QgYmVoaW5kTWF0Y2ggPSBicmFuY2hMaW5lLm1hdGNoKC9iZWhpbmQgKFxcZCspLyk7XG5cbiAgICAgIGlmIChhaGVhZE1hdGNoKSB7XG4gICAgICAgIGFoZWFkQ291bnQgPSBOdW1iZXIucGFyc2VJbnQoYWhlYWRNYXRjaFsxXSwgMTApO1xuICAgICAgfVxuICAgICAgaWYgKGJlaGluZE1hdGNoKSB7XG4gICAgICAgIGJlaGluZENvdW50ID0gTnVtYmVyLnBhcnNlSW50KGJlaGluZE1hdGNoWzFdLCAxMCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUGFyc2UgZmlsZSBzdGF0dXNlc1xuICAgIGZvciAobGV0IGkgPSAxOyBpIDwgbGluZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IGxpbmUgPSBsaW5lc1tpXTtcbiAgICAgIGlmICghbGluZSB8fCBsaW5lLmxlbmd0aCA8IDIpIGNvbnRpbnVlO1xuXG4gICAgICBjb25zdCBpbmRleFN0YXR1cyA9IGxpbmVbMF07XG4gICAgICBjb25zdCB3b3JraW5nU3RhdHVzID0gbGluZVsxXTtcblxuICAgICAgLy8gU3RhZ2VkIGZpbGVzIChjaGFuZ2VzIGluIGluZGV4KVxuICAgICAgaWYgKGluZGV4U3RhdHVzICE9PSAnICcgJiYgaW5kZXhTdGF0dXMgIT09ICc/Jykge1xuICAgICAgICBzdGFnZWRDb3VudCsrO1xuICAgICAgfVxuXG4gICAgICAvLyBXb3JraW5nIGRpcmVjdG9yeSBjaGFuZ2VzXG4gICAgICBpZiAod29ya2luZ1N0YXR1cyA9PT0gJ00nKSB7XG4gICAgICAgIG1vZGlmaWVkQ291bnQrKztcbiAgICAgIH0gZWxzZSBpZiAod29ya2luZ1N0YXR1cyA9PT0gJ0QnICYmIGluZGV4U3RhdHVzID09PSAnICcpIHtcbiAgICAgICAgLy8gRGVsZXRlZCBpbiB3b3JraW5nIHRyZWUgYnV0IG5vdCBzdGFnZWRcbiAgICAgICAgZGVsZXRlZENvdW50Kys7XG4gICAgICB9XG5cbiAgICAgIC8vIEFkZGVkIGZpbGVzICh1bnRyYWNrZWQpXG4gICAgICBpZiAoaW5kZXhTdGF0dXMgPT09ICc/JyAmJiB3b3JraW5nU3RhdHVzID09PSAnPycpIHtcbiAgICAgICAgYWRkZWRDb3VudCsrO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBtb2RpZmllZDogbW9kaWZpZWRDb3VudCxcbiAgICAgIGFkZGVkOiBhZGRlZENvdW50LFxuICAgICAgc3RhZ2VkOiBzdGFnZWRDb3VudCxcbiAgICAgIGRlbGV0ZWQ6IGRlbGV0ZWRDb3VudCxcbiAgICAgIGFoZWFkOiBhaGVhZENvdW50LFxuICAgICAgYmVoaW5kOiBiZWhpbmRDb3VudCxcbiAgICB9O1xuICB9IGNhdGNoIChfZXJyb3IpIHtcbiAgICAvLyBOb3QgYSBnaXQgcmVwb3NpdG9yeSBvciBnaXQgY29tbWFuZCBmYWlsZWRcbiAgICByZXR1cm4ge1xuICAgICAgbW9kaWZpZWQ6IDAsXG4gICAgICBhZGRlZDogMCxcbiAgICAgIHN0YWdlZDogMCxcbiAgICAgIGRlbGV0ZWQ6IDAsXG4gICAgICBhaGVhZDogMCxcbiAgICAgIGJlaGluZDogMCxcbiAgICB9O1xuICB9XG59XG4iXX0=