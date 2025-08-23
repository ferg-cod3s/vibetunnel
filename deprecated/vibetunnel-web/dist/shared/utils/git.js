"use strict";
/**
 * Git-related utility functions shared between client and server
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBaseRepoName = getBaseRepoName;
/**
 * Extract the base repository name from a path, handling common worktree patterns
 * @param repoPath Full path to the repository or worktree
 * @returns Base repository name without worktree suffixes
 *
 * Examples:
 * - /path/to/vibetunnel-treetest -> vibetunnel
 * - /path/to/myrepo-worktree -> myrepo
 * - /path/to/project-wt-feature -> project
 * - /path/to/normalrepo -> normalrepo
 */
function getBaseRepoName(repoPath) {
    // Handle root path edge case
    if (repoPath === '/') {
        return '';
    }
    // Extract the last part of the path
    const parts = repoPath.split('/');
    const lastPart = parts[parts.length - 1] || repoPath;
    // Handle common worktree patterns
    const worktreePatterns = [
        /-tree(?:test)?$/i, // -treetest, -tree
        /-worktree$/i, // -worktree
        /-wt-\w+$/i, // -wt-feature
        /-work$/i, // -work
        /-temp$/i, // -temp
        /-branch-\w+$/i, // -branch-feature
        /-\w+$/i, // Any single-word suffix (catches -notifications, -feature, etc.)
    ];
    for (const pattern of worktreePatterns) {
        if (pattern.test(lastPart)) {
            const baseName = lastPart.replace(pattern, '');
            // Only return the base name if it's not empty and looks reasonable
            if (baseName && baseName.length >= 2) {
                return baseName;
            }
        }
    }
    return lastPart;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NoYXJlZC91dGlscy9naXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOztHQUVHOztBQWFILDBDQWdDQztBQTNDRDs7Ozs7Ozs7OztHQVVHO0FBQ0gsU0FBZ0IsZUFBZSxDQUFDLFFBQWdCO0lBQzlDLDZCQUE2QjtJQUM3QixJQUFJLFFBQVEsS0FBSyxHQUFHLEVBQUUsQ0FBQztRQUNyQixPQUFPLEVBQUUsQ0FBQztJQUNaLENBQUM7SUFFRCxvQ0FBb0M7SUFDcEMsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNsQyxNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsSUFBSSxRQUFRLENBQUM7SUFFckQsa0NBQWtDO0lBQ2xDLE1BQU0sZ0JBQWdCLEdBQUc7UUFDdkIsa0JBQWtCLEVBQUUsbUJBQW1CO1FBQ3ZDLGFBQWEsRUFBRSxZQUFZO1FBQzNCLFdBQVcsRUFBRSxjQUFjO1FBQzNCLFNBQVMsRUFBRSxRQUFRO1FBQ25CLFNBQVMsRUFBRSxRQUFRO1FBQ25CLGVBQWUsRUFBRSxrQkFBa0I7UUFDbkMsUUFBUSxFQUFFLGtFQUFrRTtLQUM3RSxDQUFDO0lBRUYsS0FBSyxNQUFNLE9BQU8sSUFBSSxnQkFBZ0IsRUFBRSxDQUFDO1FBQ3ZDLElBQUksT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQzNCLE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQy9DLG1FQUFtRTtZQUNuRSxJQUFJLFFBQVEsSUFBSSxRQUFRLENBQUMsTUFBTSxJQUFJLENBQUMsRUFBRSxDQUFDO2dCQUNyQyxPQUFPLFFBQVEsQ0FBQztZQUNsQixDQUFDO1FBQ0gsQ0FBQztJQUNILENBQUM7SUFFRCxPQUFPLFFBQVEsQ0FBQztBQUNsQixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBHaXQtcmVsYXRlZCB1dGlsaXR5IGZ1bmN0aW9ucyBzaGFyZWQgYmV0d2VlbiBjbGllbnQgYW5kIHNlcnZlclxuICovXG5cbi8qKlxuICogRXh0cmFjdCB0aGUgYmFzZSByZXBvc2l0b3J5IG5hbWUgZnJvbSBhIHBhdGgsIGhhbmRsaW5nIGNvbW1vbiB3b3JrdHJlZSBwYXR0ZXJuc1xuICogQHBhcmFtIHJlcG9QYXRoIEZ1bGwgcGF0aCB0byB0aGUgcmVwb3NpdG9yeSBvciB3b3JrdHJlZVxuICogQHJldHVybnMgQmFzZSByZXBvc2l0b3J5IG5hbWUgd2l0aG91dCB3b3JrdHJlZSBzdWZmaXhlc1xuICpcbiAqIEV4YW1wbGVzOlxuICogLSAvcGF0aC90by92aWJldHVubmVsLXRyZWV0ZXN0IC0+IHZpYmV0dW5uZWxcbiAqIC0gL3BhdGgvdG8vbXlyZXBvLXdvcmt0cmVlIC0+IG15cmVwb1xuICogLSAvcGF0aC90by9wcm9qZWN0LXd0LWZlYXR1cmUgLT4gcHJvamVjdFxuICogLSAvcGF0aC90by9ub3JtYWxyZXBvIC0+IG5vcm1hbHJlcG9cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldEJhc2VSZXBvTmFtZShyZXBvUGF0aDogc3RyaW5nKTogc3RyaW5nIHtcbiAgLy8gSGFuZGxlIHJvb3QgcGF0aCBlZGdlIGNhc2VcbiAgaWYgKHJlcG9QYXRoID09PSAnLycpIHtcbiAgICByZXR1cm4gJyc7XG4gIH1cblxuICAvLyBFeHRyYWN0IHRoZSBsYXN0IHBhcnQgb2YgdGhlIHBhdGhcbiAgY29uc3QgcGFydHMgPSByZXBvUGF0aC5zcGxpdCgnLycpO1xuICBjb25zdCBsYXN0UGFydCA9IHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdIHx8IHJlcG9QYXRoO1xuXG4gIC8vIEhhbmRsZSBjb21tb24gd29ya3RyZWUgcGF0dGVybnNcbiAgY29uc3Qgd29ya3RyZWVQYXR0ZXJucyA9IFtcbiAgICAvLXRyZWUoPzp0ZXN0KT8kL2ksIC8vIC10cmVldGVzdCwgLXRyZWVcbiAgICAvLXdvcmt0cmVlJC9pLCAvLyAtd29ya3RyZWVcbiAgICAvLXd0LVxcdyskL2ksIC8vIC13dC1mZWF0dXJlXG4gICAgLy13b3JrJC9pLCAvLyAtd29ya1xuICAgIC8tdGVtcCQvaSwgLy8gLXRlbXBcbiAgICAvLWJyYW5jaC1cXHcrJC9pLCAvLyAtYnJhbmNoLWZlYXR1cmVcbiAgICAvLVxcdyskL2ksIC8vIEFueSBzaW5nbGUtd29yZCBzdWZmaXggKGNhdGNoZXMgLW5vdGlmaWNhdGlvbnMsIC1mZWF0dXJlLCBldGMuKVxuICBdO1xuXG4gIGZvciAoY29uc3QgcGF0dGVybiBvZiB3b3JrdHJlZVBhdHRlcm5zKSB7XG4gICAgaWYgKHBhdHRlcm4udGVzdChsYXN0UGFydCkpIHtcbiAgICAgIGNvbnN0IGJhc2VOYW1lID0gbGFzdFBhcnQucmVwbGFjZShwYXR0ZXJuLCAnJyk7XG4gICAgICAvLyBPbmx5IHJldHVybiB0aGUgYmFzZSBuYW1lIGlmIGl0J3Mgbm90IGVtcHR5IGFuZCBsb29rcyByZWFzb25hYmxlXG4gICAgICBpZiAoYmFzZU5hbWUgJiYgYmFzZU5hbWUubGVuZ3RoID49IDIpIHtcbiAgICAgICAgcmV0dXJuIGJhc2VOYW1lO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBsYXN0UGFydDtcbn1cbiJdfQ==