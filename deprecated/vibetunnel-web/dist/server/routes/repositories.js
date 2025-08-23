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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRepositoryRoutes = createRepositoryRoutes;
const child_process_1 = require("child_process");
const express_1 = require("express");
const fs = __importStar(require("fs/promises"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const util_1 = require("util");
const constants_js_1 = require("../../shared/constants.js");
const logger_js_1 = require("../utils/logger.js");
const path_utils_js_1 = require("../utils/path-utils.js");
const logger = (0, logger_js_1.createLogger)('repositories');
const execAsync = (0, util_1.promisify)(child_process_1.exec);
/**
 * Create routes for repository discovery functionality
 */
function createRepositoryRoutes() {
    const router = (0, express_1.Router)();
    // List branches for a repository
    router.get('/repositories/branches', async (req, res) => {
        try {
            const repoPath = req.query.path;
            if (!repoPath || typeof repoPath !== 'string') {
                return res.status(400).json({
                    error: 'Missing or invalid path parameter',
                });
            }
            const expandedPath = (0, path_utils_js_1.resolveAbsolutePath)(repoPath);
            logger.debug(`[GET /repositories/branches] Listing branches for: ${expandedPath}`);
            // Get all branches (local and remote)
            const branches = await listBranches(expandedPath);
            res.json(branches);
        }
        catch (error) {
            logger.error('[GET /repositories/branches] Error listing branches:', error);
            res.status(500).json({ error: 'Failed to list branches' });
        }
    });
    // Discover repositories endpoint
    router.get('/repositories/discover', async (req, res) => {
        try {
            const basePath = req.query.path || constants_js_1.DEFAULT_REPOSITORY_BASE_PATH;
            const maxDepth = Number.parseInt(req.query.maxDepth) || 3;
            logger.debug(`[GET /repositories/discover] Discovering repositories in: ${basePath}`);
            const expandedPath = (0, path_utils_js_1.resolveAbsolutePath)(basePath);
            logger.debug(`[GET /repositories/discover] Expanded path: ${expandedPath}`);
            // Check if the path exists
            try {
                await fs.access(expandedPath, fs.constants.R_OK);
                logger.debug(`[GET /repositories/discover] Path exists and is readable: ${expandedPath}`);
            }
            catch (error) {
                logger.error(`[GET /repositories/discover] Cannot access path: ${expandedPath}`, error);
            }
            const repositories = await discoverRepositories({
                basePath: expandedPath,
                maxDepth,
            });
            logger.debug(`[GET /repositories/discover] Found ${repositories.length} repositories`);
            res.json(repositories);
        }
        catch (error) {
            logger.error('[GET /repositories/discover] Error discovering repositories:', error);
            res.status(500).json({ error: 'Failed to discover repositories' });
        }
    });
    return router;
}
/**
 * Discover git repositories in the specified base path
 */
async function discoverRepositories(options) {
    const { basePath, maxDepth = 3 } = options;
    const repositories = [];
    logger.debug(`Starting repository discovery in ${basePath} with maxDepth=${maxDepth}`);
    async function scanDirectory(dirPath, depth) {
        if (depth > maxDepth) {
            return;
        }
        try {
            // Check if directory is accessible
            await fs.access(dirPath, fs.constants.R_OK);
            // First check if the current directory itself is a git repository
            // Only check at depth 0 to match Mac app behavior
            if (depth === 0) {
                const currentGitPath = path.join(dirPath, '.git');
                try {
                    await fs.access(currentGitPath, fs.constants.F_OK);
                    // Current directory is a git repository
                    const repository = await createDiscoveredRepository(dirPath);
                    repositories.push(repository);
                    logger.debug(`Found git repository at base path: ${dirPath}`);
                    // Don't scan subdirectories of a git repository
                    return;
                }
                catch {
                    // Current directory is not a git repository, continue scanning
                }
            }
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory())
                    continue;
                // Skip hidden directories except .git
                if (entry.name.startsWith('.') && entry.name !== '.git')
                    continue;
                const fullPath = path.join(dirPath, entry.name);
                // Check if this subdirectory is a git repository
                const gitPath = path.join(fullPath, '.git');
                try {
                    await fs.access(gitPath, fs.constants.F_OK);
                    // If .git exists (either as a file or directory), this is a git repository
                    const repository = await createDiscoveredRepository(fullPath);
                    repositories.push(repository);
                    logger.debug(`Found git repository: ${fullPath}`);
                    // Don't scan subdirectories of a git repository
                }
                catch {
                    // .git doesn't exist, scan subdirectories
                    await scanDirectory(fullPath, depth + 1);
                }
            }
        }
        catch (error) {
            logger.debug(`Cannot access directory ${dirPath}:`, error);
        }
    }
    await scanDirectory(basePath, 0);
    // Sort by folder name
    repositories.sort((a, b) => a.folderName.localeCompare(b.folderName));
    return repositories;
}
/**
 * List all branches (local and remote) for a repository
 */
async function listBranches(repoPath) {
    const branches = [];
    try {
        // Get current branch
        let currentBranch;
        try {
            const { stdout } = await execAsync('git branch --show-current', { cwd: repoPath });
            currentBranch = stdout.trim();
        }
        catch {
            logger.debug('Failed to get current branch, repository might be in detached HEAD state');
        }
        // Get all local branches
        const { stdout: localBranchesOutput } = await execAsync('git branch', { cwd: repoPath });
        const localBranches = localBranchesOutput
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .map((line) => {
            const isCurrent = line.startsWith('*');
            const name = line.replace(/^\*?\s+/, '');
            return {
                name,
                current: isCurrent || name === currentBranch,
                remote: false,
            };
        });
        branches.push(...localBranches);
        // Get all remote branches
        try {
            const { stdout: remoteBranchesOutput } = await execAsync('git branch -r', { cwd: repoPath });
            const remoteBranches = remoteBranchesOutput
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line.length > 0 && !line.includes('->')) // Skip HEAD pointers
                .map((line) => {
                const name = line.replace(/^\s+/, '');
                return {
                    name,
                    current: false,
                    remote: true,
                };
            });
            branches.push(...remoteBranches);
        }
        catch {
            logger.debug('No remote branches found');
        }
        // Get worktree information
        try {
            const { stdout: worktreeOutput } = await execAsync('git worktree list --porcelain', {
                cwd: repoPath,
            });
            const worktrees = parseWorktreeList(worktreeOutput);
            // Add worktree information to branches
            for (const worktree of worktrees) {
                const branch = branches.find((b) => b.name === worktree.branch ||
                    b.name === `refs/heads/${worktree.branch}` ||
                    b.name.replace(/^origin\//, '') === worktree.branch);
                if (branch) {
                    branch.worktree = worktree.path;
                }
            }
        }
        catch {
            logger.debug('Failed to get worktree information');
        }
        // Sort branches: current first, then local, then remote
        branches.sort((a, b) => {
            if (a.current && !b.current)
                return -1;
            if (!a.current && b.current)
                return 1;
            if (!a.remote && b.remote)
                return -1;
            if (a.remote && !b.remote)
                return 1;
            return a.name.localeCompare(b.name);
        });
        return branches;
    }
    catch (error) {
        logger.error('Error listing branches:', error);
        throw error;
    }
}
/**
 * Parse worktree list output
 */
function parseWorktreeList(output) {
    const worktrees = [];
    const lines = output.trim().split('\n');
    let current = {};
    for (const line of lines) {
        if (line === '') {
            if (current.path && current.branch) {
                worktrees.push({ path: current.path, branch: current.branch });
            }
            current = {};
            continue;
        }
        const [key, ...valueParts] = line.split(' ');
        const value = valueParts.join(' ');
        if (key === 'worktree') {
            current.path = value;
        }
        else if (key === 'branch') {
            current.branch = value.replace(/^refs\/heads\//, '');
        }
    }
    // Handle last worktree
    if (current.path && current.branch) {
        worktrees.push({ path: current.path, branch: current.branch });
    }
    return worktrees;
}
/**
 * Create a DiscoveredRepository from a path
 */
async function createDiscoveredRepository(repoPath) {
    const folderName = path.basename(repoPath);
    // Get last modified date
    const stats = await fs.stat(repoPath);
    const lastModified = stats.mtime.toISOString();
    // Get relative path from home directory
    const homeDir = os.homedir();
    const relativePath = repoPath.startsWith(homeDir)
        ? `~${repoPath.slice(homeDir.length)}`
        : repoPath;
    // Get current git branch
    let gitBranch;
    try {
        const { stdout: branch } = await execAsync('git branch --show-current', {
            cwd: repoPath,
        });
        gitBranch = branch.trim();
    }
    catch {
        // Failed to get branch - repository might not have any commits yet
        logger.debug(`Failed to get git branch for ${repoPath}`);
    }
    return {
        id: `${folderName}-${stats.ino}`,
        path: repoPath,
        folderName,
        lastModified,
        relativePath,
        gitBranch,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwb3NpdG9yaWVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NlcnZlci9yb3V0ZXMvcmVwb3NpdG9yaWVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBcUNBLHdEQTREQztBQWpHRCxpREFBcUM7QUFDckMscUNBQWlDO0FBQ2pDLGdEQUFrQztBQUNsQyx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLCtCQUFpQztBQUNqQyw0REFBeUU7QUFDekUsa0RBQWtEO0FBQ2xELDBEQUE2RDtBQUU3RCxNQUFNLE1BQU0sR0FBRyxJQUFBLHdCQUFZLEVBQUMsY0FBYyxDQUFDLENBQUM7QUFDNUMsTUFBTSxTQUFTLEdBQUcsSUFBQSxnQkFBUyxFQUFDLG9CQUFJLENBQUMsQ0FBQztBQXVCbEM7O0dBRUc7QUFDSCxTQUFnQixzQkFBc0I7SUFDcEMsTUFBTSxNQUFNLEdBQUcsSUFBQSxnQkFBTSxHQUFFLENBQUM7SUFFeEIsaUNBQWlDO0lBQ2pDLE1BQU0sQ0FBQyxHQUFHLENBQUMsd0JBQXdCLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsRUFBRTtRQUN0RCxJQUFJLENBQUM7WUFDSCxNQUFNLFFBQVEsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLElBQWMsQ0FBQztZQUUxQyxJQUFJLENBQUMsUUFBUSxJQUFJLE9BQU8sUUFBUSxLQUFLLFFBQVEsRUFBRSxDQUFDO2dCQUM5QyxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO29CQUMxQixLQUFLLEVBQUUsbUNBQW1DO2lCQUMzQyxDQUFDLENBQUM7WUFDTCxDQUFDO1lBRUQsTUFBTSxZQUFZLEdBQUcsSUFBQSxtQ0FBbUIsRUFBQyxRQUFRLENBQUMsQ0FBQztZQUNuRCxNQUFNLENBQUMsS0FBSyxDQUFDLHNEQUFzRCxZQUFZLEVBQUUsQ0FBQyxDQUFDO1lB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QVEsRUFBRSxDQUFDLENBQUM7SUFDM0QsQ0FBQztJQUVELE9BQU87UUFDTCxFQUFFLEVBQUUsR0FBRyxVQUFVLElBQUksS0FBSyxDQUFDLEdBQUcsRUFBRTtRQUNoQyxJQUFJLEVBQUUsUUFBUTtRQUNkLFVBQVU7UUFDVixZQUFZO1FBQ1osWUFBWTtRQUNaLFNBQVM7S0FDVixDQUFDO0FBQ0osQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGV4ZWMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IFJvdXRlciB9IGZyb20gJ2V4cHJlc3MnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMvcHJvbWlzZXMnO1xuaW1wb3J0ICogYXMgb3MgZnJvbSAnb3MnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IHByb21pc2lmeSB9IGZyb20gJ3V0aWwnO1xuaW1wb3J0IHsgREVGQVVMVF9SRVBPU0lUT1JZX0JBU0VfUEFUSCB9IGZyb20gJy4uLy4uL3NoYXJlZC9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgY3JlYXRlTG9nZ2VyIH0gZnJvbSAnLi4vdXRpbHMvbG9nZ2VyLmpzJztcbmltcG9ydCB7IHJlc29sdmVBYnNvbHV0ZVBhdGggfSBmcm9tICcuLi91dGlscy9wYXRoLXV0aWxzLmpzJztcblxuY29uc3QgbG9nZ2VyID0gY3JlYXRlTG9nZ2VyKCdyZXBvc2l0b3JpZXMnKTtcbmNvbnN0IGV4ZWNBc3luYyA9IHByb21pc2lmeShleGVjKTtcblxuZXhwb3J0IGludGVyZmFjZSBEaXNjb3ZlcmVkUmVwb3NpdG9yeSB7XG4gIGlkOiBzdHJpbmc7XG4gIHBhdGg6IHN0cmluZztcbiAgZm9sZGVyTmFtZTogc3RyaW5nO1xuICBsYXN0TW9kaWZpZWQ6IHN0cmluZztcbiAgcmVsYXRpdmVQYXRoOiBzdHJpbmc7XG4gIGdpdEJyYW5jaD86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBCcmFuY2gge1xuICBuYW1lOiBzdHJpbmc7XG4gIGN1cnJlbnQ6IGJvb2xlYW47XG4gIHJlbW90ZTogYm9vbGVhbjtcbiAgd29ya3RyZWU/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBSZXBvc2l0b3J5U2VhcmNoT3B0aW9ucyB7XG4gIGJhc2VQYXRoOiBzdHJpbmc7XG4gIG1heERlcHRoPzogbnVtYmVyO1xufVxuXG4vKipcbiAqIENyZWF0ZSByb3V0ZXMgZm9yIHJlcG9zaXRvcnkgZGlzY292ZXJ5IGZ1bmN0aW9uYWxpdHlcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVJlcG9zaXRvcnlSb3V0ZXMoKTogUm91dGVyIHtcbiAgY29uc3Qgcm91dGVyID0gUm91dGVyKCk7XG5cbiAgLy8gTGlzdCBicmFuY2hlcyBmb3IgYSByZXBvc2l0b3J5XG4gIHJvdXRlci5nZXQoJy9yZXBvc2l0b3JpZXMvYnJhbmNoZXMnLCBhc3luYyAocmVxLCByZXMpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVwb1BhdGggPSByZXEucXVlcnkucGF0aCBhcyBzdHJpbmc7XG5cbiAgICAgIGlmICghcmVwb1BhdGggfHwgdHlwZW9mIHJlcG9QYXRoICE9PSAnc3RyaW5nJykge1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oe1xuICAgICAgICAgIGVycm9yOiAnTWlzc2luZyBvciBpbnZhbGlkIHBhdGggcGFyYW1ldGVyJyxcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGV4cGFuZGVkUGF0aCA9IHJlc29sdmVBYnNvbHV0ZVBhdGgocmVwb1BhdGgpO1xuICAgICAgbG9nZ2VyLmRlYnVnKGBbR0VUIC9yZXBvc2l0b3JpZXMvYnJhbmNoZXNdIExpc3RpbmcgYnJhbmNoZXMgZm9yOiAke2V4cGFuZGVkUGF0aH1gKTtcblxuICAgICAgLy8gR2V0IGFsbCBicmFuY2hlcyAobG9jYWwgYW5kIHJlbW90ZSlcbiAgICAgIGNvbnN0IGJyYW5jaGVzID0gYXdhaXQgbGlzdEJyYW5jaGVzKGV4cGFuZGVkUGF0aCk7XG5cbiAgICAgIHJlcy5qc29uKGJyYW5jaGVzKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCdbR0VUIC9yZXBvc2l0b3JpZXMvYnJhbmNoZXNdIEVycm9yIGxpc3RpbmcgYnJhbmNoZXM6JywgZXJyb3IpO1xuICAgICAgcmVzLnN0YXR1cyg1MDApLmpzb24oeyBlcnJvcjogJ0ZhaWxlZCB0byBsaXN0IGJyYW5jaGVzJyB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIERpc2NvdmVyIHJlcG9zaXRvcmllcyBlbmRwb2ludFxuICByb3V0ZXIuZ2V0KCcvcmVwb3NpdG9yaWVzL2Rpc2NvdmVyJywgYXN5bmMgKHJlcSwgcmVzKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGJhc2VQYXRoID0gKHJlcS5xdWVyeS5wYXRoIGFzIHN0cmluZykgfHwgREVGQVVMVF9SRVBPU0lUT1JZX0JBU0VfUEFUSDtcbiAgICAgIGNvbnN0IG1heERlcHRoID0gTnVtYmVyLnBhcnNlSW50KHJlcS5xdWVyeS5tYXhEZXB0aCBhcyBzdHJpbmcpIHx8IDM7XG5cbiAgICAgIGxvZ2dlci5kZWJ1ZyhgW0dFVCAvcmVwb3NpdG9yaWVzL2Rpc2NvdmVyXSBEaXNjb3ZlcmluZyByZXBvc2l0b3JpZXMgaW46ICR7YmFzZVBhdGh9YCk7XG5cbiAgICAgIGNvbnN0IGV4cGFuZGVkUGF0aCA9IHJlc29sdmVBYnNvbHV0ZVBhdGgoYmFzZVBhdGgpO1xuICAgICAgbG9nZ2VyLmRlYnVnKGBbR0VUIC9yZXBvc2l0b3JpZXMvZGlzY292ZXJdIEV4cGFuZGVkIHBhdGg6ICR7ZXhwYW5kZWRQYXRofWApO1xuXG4gICAgICAvLyBDaGVjayBpZiB0aGUgcGF0aCBleGlzdHNcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGZzLmFjY2VzcyhleHBhbmRlZFBhdGgsIGZzLmNvbnN0YW50cy5SX09LKTtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKGBbR0VUIC9yZXBvc2l0b3JpZXMvZGlzY292ZXJdIFBhdGggZXhpc3RzIGFuZCBpcyByZWFkYWJsZTogJHtleHBhbmRlZFBhdGh9YCk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBsb2dnZXIuZXJyb3IoYFtHRVQgL3JlcG9zaXRvcmllcy9kaXNjb3Zlcl0gQ2Fubm90IGFjY2VzcyBwYXRoOiAke2V4cGFuZGVkUGF0aH1gLCBlcnJvcik7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlcG9zaXRvcmllcyA9IGF3YWl0IGRpc2NvdmVyUmVwb3NpdG9yaWVzKHtcbiAgICAgICAgYmFzZVBhdGg6IGV4cGFuZGVkUGF0aCxcbiAgICAgICAgbWF4RGVwdGgsXG4gICAgICB9KTtcblxuICAgICAgbG9nZ2VyLmRlYnVnKGBbR0VUIC9yZXBvc2l0b3JpZXMvZGlzY292ZXJdIEZvdW5kICR7cmVwb3NpdG9yaWVzLmxlbmd0aH0gcmVwb3NpdG9yaWVzYCk7XG4gICAgICByZXMuanNvbihyZXBvc2l0b3JpZXMpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ1tHRVQgL3JlcG9zaXRvcmllcy9kaXNjb3Zlcl0gRXJyb3IgZGlzY292ZXJpbmcgcmVwb3NpdG9yaWVzOicsIGVycm9yKTtcbiAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHsgZXJyb3I6ICdGYWlsZWQgdG8gZGlzY292ZXIgcmVwb3NpdG9yaWVzJyB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiByb3V0ZXI7XG59XG5cbi8qKlxuICogRGlzY292ZXIgZ2l0IHJlcG9zaXRvcmllcyBpbiB0aGUgc3BlY2lmaWVkIGJhc2UgcGF0aFxuICovXG5hc3luYyBmdW5jdGlvbiBkaXNjb3ZlclJlcG9zaXRvcmllcyhcbiAgb3B0aW9uczogUmVwb3NpdG9yeVNlYXJjaE9wdGlvbnNcbik6IFByb21pc2U8RGlzY292ZXJlZFJlcG9zaXRvcnlbXT4ge1xuICBjb25zdCB7IGJhc2VQYXRoLCBtYXhEZXB0aCA9IDMgfSA9IG9wdGlvbnM7XG4gIGNvbnN0IHJlcG9zaXRvcmllczogRGlzY292ZXJlZFJlcG9zaXRvcnlbXSA9IFtdO1xuXG4gIGxvZ2dlci5kZWJ1ZyhgU3RhcnRpbmcgcmVwb3NpdG9yeSBkaXNjb3ZlcnkgaW4gJHtiYXNlUGF0aH0gd2l0aCBtYXhEZXB0aD0ke21heERlcHRofWApO1xuXG4gIGFzeW5jIGZ1bmN0aW9uIHNjYW5EaXJlY3RvcnkoZGlyUGF0aDogc3RyaW5nLCBkZXB0aDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKGRlcHRoID4gbWF4RGVwdGgpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgLy8gQ2hlY2sgaWYgZGlyZWN0b3J5IGlzIGFjY2Vzc2libGVcbiAgICAgIGF3YWl0IGZzLmFjY2VzcyhkaXJQYXRoLCBmcy5jb25zdGFudHMuUl9PSyk7XG5cbiAgICAgIC8vIEZpcnN0IGNoZWNrIGlmIHRoZSBjdXJyZW50IGRpcmVjdG9yeSBpdHNlbGYgaXMgYSBnaXQgcmVwb3NpdG9yeVxuICAgICAgLy8gT25seSBjaGVjayBhdCBkZXB0aCAwIHRvIG1hdGNoIE1hYyBhcHAgYmVoYXZpb3JcbiAgICAgIGlmIChkZXB0aCA9PT0gMCkge1xuICAgICAgICBjb25zdCBjdXJyZW50R2l0UGF0aCA9IHBhdGguam9pbihkaXJQYXRoLCAnLmdpdCcpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGF3YWl0IGZzLmFjY2VzcyhjdXJyZW50R2l0UGF0aCwgZnMuY29uc3RhbnRzLkZfT0spO1xuICAgICAgICAgIC8vIEN1cnJlbnQgZGlyZWN0b3J5IGlzIGEgZ2l0IHJlcG9zaXRvcnlcbiAgICAgICAgICBjb25zdCByZXBvc2l0b3J5ID0gYXdhaXQgY3JlYXRlRGlzY292ZXJlZFJlcG9zaXRvcnkoZGlyUGF0aCk7XG4gICAgICAgICAgcmVwb3NpdG9yaWVzLnB1c2gocmVwb3NpdG9yeSk7XG4gICAgICAgICAgbG9nZ2VyLmRlYnVnKGBGb3VuZCBnaXQgcmVwb3NpdG9yeSBhdCBiYXNlIHBhdGg6ICR7ZGlyUGF0aH1gKTtcbiAgICAgICAgICAvLyBEb24ndCBzY2FuIHN1YmRpcmVjdG9yaWVzIG9mIGEgZ2l0IHJlcG9zaXRvcnlcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIC8vIEN1cnJlbnQgZGlyZWN0b3J5IGlzIG5vdCBhIGdpdCByZXBvc2l0b3J5LCBjb250aW51ZSBzY2FubmluZ1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGVudHJpZXMgPSBhd2FpdCBmcy5yZWFkZGlyKGRpclBhdGgsIHsgd2l0aEZpbGVUeXBlczogdHJ1ZSB9KTtcblxuICAgICAgZm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG4gICAgICAgIGlmICghZW50cnkuaXNEaXJlY3RvcnkoKSkgY29udGludWU7XG5cbiAgICAgICAgLy8gU2tpcCBoaWRkZW4gZGlyZWN0b3JpZXMgZXhjZXB0IC5naXRcbiAgICAgICAgaWYgKGVudHJ5Lm5hbWUuc3RhcnRzV2l0aCgnLicpICYmIGVudHJ5Lm5hbWUgIT09ICcuZ2l0JykgY29udGludWU7XG5cbiAgICAgICAgY29uc3QgZnVsbFBhdGggPSBwYXRoLmpvaW4oZGlyUGF0aCwgZW50cnkubmFtZSk7XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhpcyBzdWJkaXJlY3RvcnkgaXMgYSBnaXQgcmVwb3NpdG9yeVxuICAgICAgICBjb25zdCBnaXRQYXRoID0gcGF0aC5qb2luKGZ1bGxQYXRoLCAnLmdpdCcpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGF3YWl0IGZzLmFjY2VzcyhnaXRQYXRoLCBmcy5jb25zdGFudHMuRl9PSyk7XG4gICAgICAgICAgLy8gSWYgLmdpdCBleGlzdHMgKGVpdGhlciBhcyBhIGZpbGUgb3IgZGlyZWN0b3J5KSwgdGhpcyBpcyBhIGdpdCByZXBvc2l0b3J5XG4gICAgICAgICAgY29uc3QgcmVwb3NpdG9yeSA9IGF3YWl0IGNyZWF0ZURpc2NvdmVyZWRSZXBvc2l0b3J5KGZ1bGxQYXRoKTtcbiAgICAgICAgICByZXBvc2l0b3JpZXMucHVzaChyZXBvc2l0b3J5KTtcbiAgICAgICAgICBsb2dnZXIuZGVidWcoYEZvdW5kIGdpdCByZXBvc2l0b3J5OiAke2Z1bGxQYXRofWApO1xuICAgICAgICAgIC8vIERvbid0IHNjYW4gc3ViZGlyZWN0b3JpZXMgb2YgYSBnaXQgcmVwb3NpdG9yeVxuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAvLyAuZ2l0IGRvZXNuJ3QgZXhpc3QsIHNjYW4gc3ViZGlyZWN0b3JpZXNcbiAgICAgICAgICBhd2FpdCBzY2FuRGlyZWN0b3J5KGZ1bGxQYXRoLCBkZXB0aCArIDEpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhgQ2Fubm90IGFjY2VzcyBkaXJlY3RvcnkgJHtkaXJQYXRofTpgLCBlcnJvcik7XG4gICAgfVxuICB9XG5cbiAgYXdhaXQgc2NhbkRpcmVjdG9yeShiYXNlUGF0aCwgMCk7XG5cbiAgLy8gU29ydCBieSBmb2xkZXIgbmFtZVxuICByZXBvc2l0b3JpZXMuc29ydCgoYSwgYikgPT4gYS5mb2xkZXJOYW1lLmxvY2FsZUNvbXBhcmUoYi5mb2xkZXJOYW1lKSk7XG5cbiAgcmV0dXJuIHJlcG9zaXRvcmllcztcbn1cblxuLyoqXG4gKiBMaXN0IGFsbCBicmFuY2hlcyAobG9jYWwgYW5kIHJlbW90ZSkgZm9yIGEgcmVwb3NpdG9yeVxuICovXG5hc3luYyBmdW5jdGlvbiBsaXN0QnJhbmNoZXMocmVwb1BhdGg6IHN0cmluZyk6IFByb21pc2U8QnJhbmNoW10+IHtcbiAgY29uc3QgYnJhbmNoZXM6IEJyYW5jaFtdID0gW107XG5cbiAgdHJ5IHtcbiAgICAvLyBHZXQgY3VycmVudCBicmFuY2hcbiAgICBsZXQgY3VycmVudEJyYW5jaDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB7IHN0ZG91dCB9ID0gYXdhaXQgZXhlY0FzeW5jKCdnaXQgYnJhbmNoIC0tc2hvdy1jdXJyZW50JywgeyBjd2Q6IHJlcG9QYXRoIH0pO1xuICAgICAgY3VycmVudEJyYW5jaCA9IHN0ZG91dC50cmltKCk7XG4gICAgfSBjYXRjaCB7XG4gICAgICBsb2dnZXIuZGVidWcoJ0ZhaWxlZCB0byBnZXQgY3VycmVudCBicmFuY2gsIHJlcG9zaXRvcnkgbWlnaHQgYmUgaW4gZGV0YWNoZWQgSEVBRCBzdGF0ZScpO1xuICAgIH1cblxuICAgIC8vIEdldCBhbGwgbG9jYWwgYnJhbmNoZXNcbiAgICBjb25zdCB7IHN0ZG91dDogbG9jYWxCcmFuY2hlc091dHB1dCB9ID0gYXdhaXQgZXhlY0FzeW5jKCdnaXQgYnJhbmNoJywgeyBjd2Q6IHJlcG9QYXRoIH0pO1xuICAgIGNvbnN0IGxvY2FsQnJhbmNoZXMgPSBsb2NhbEJyYW5jaGVzT3V0cHV0XG4gICAgICAuc3BsaXQoJ1xcbicpXG4gICAgICAubWFwKChsaW5lKSA9PiBsaW5lLnRyaW0oKSlcbiAgICAgIC5maWx0ZXIoKGxpbmUpID0+IGxpbmUubGVuZ3RoID4gMClcbiAgICAgIC5tYXAoKGxpbmUpID0+IHtcbiAgICAgICAgY29uc3QgaXNDdXJyZW50ID0gbGluZS5zdGFydHNXaXRoKCcqJyk7XG4gICAgICAgIGNvbnN0IG5hbWUgPSBsaW5lLnJlcGxhY2UoL15cXCo/XFxzKy8sICcnKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBuYW1lLFxuICAgICAgICAgIGN1cnJlbnQ6IGlzQ3VycmVudCB8fCBuYW1lID09PSBjdXJyZW50QnJhbmNoLFxuICAgICAgICAgIHJlbW90ZTogZmFsc2UsXG4gICAgICAgIH07XG4gICAgICB9KTtcblxuICAgIGJyYW5jaGVzLnB1c2goLi4ubG9jYWxCcmFuY2hlcyk7XG5cbiAgICAvLyBHZXQgYWxsIHJlbW90ZSBicmFuY2hlc1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB7IHN0ZG91dDogcmVtb3RlQnJhbmNoZXNPdXRwdXQgfSA9IGF3YWl0IGV4ZWNBc3luYygnZ2l0IGJyYW5jaCAtcicsIHsgY3dkOiByZXBvUGF0aCB9KTtcbiAgICAgIGNvbnN0IHJlbW90ZUJyYW5jaGVzID0gcmVtb3RlQnJhbmNoZXNPdXRwdXRcbiAgICAgICAgLnNwbGl0KCdcXG4nKVxuICAgICAgICAubWFwKChsaW5lKSA9PiBsaW5lLnRyaW0oKSlcbiAgICAgICAgLmZpbHRlcigobGluZSkgPT4gbGluZS5sZW5ndGggPiAwICYmICFsaW5lLmluY2x1ZGVzKCctPicpKSAvLyBTa2lwIEhFQUQgcG9pbnRlcnNcbiAgICAgICAgLm1hcCgobGluZSkgPT4ge1xuICAgICAgICAgIGNvbnN0IG5hbWUgPSBsaW5lLnJlcGxhY2UoL15cXHMrLywgJycpO1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBuYW1lLFxuICAgICAgICAgICAgY3VycmVudDogZmFsc2UsXG4gICAgICAgICAgICByZW1vdGU6IHRydWUsXG4gICAgICAgICAgfTtcbiAgICAgICAgfSk7XG5cbiAgICAgIGJyYW5jaGVzLnB1c2goLi4ucmVtb3RlQnJhbmNoZXMpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgbG9nZ2VyLmRlYnVnKCdObyByZW1vdGUgYnJhbmNoZXMgZm91bmQnKTtcbiAgICB9XG5cbiAgICAvLyBHZXQgd29ya3RyZWUgaW5mb3JtYXRpb25cbiAgICB0cnkge1xuICAgICAgY29uc3QgeyBzdGRvdXQ6IHdvcmt0cmVlT3V0cHV0IH0gPSBhd2FpdCBleGVjQXN5bmMoJ2dpdCB3b3JrdHJlZSBsaXN0IC0tcG9yY2VsYWluJywge1xuICAgICAgICBjd2Q6IHJlcG9QYXRoLFxuICAgICAgfSk7XG4gICAgICBjb25zdCB3b3JrdHJlZXMgPSBwYXJzZVdvcmt0cmVlTGlzdCh3b3JrdHJlZU91dHB1dCk7XG5cbiAgICAgIC8vIEFkZCB3b3JrdHJlZSBpbmZvcm1hdGlvbiB0byBicmFuY2hlc1xuICAgICAgZm9yIChjb25zdCB3b3JrdHJlZSBvZiB3b3JrdHJlZXMpIHtcbiAgICAgICAgY29uc3QgYnJhbmNoID0gYnJhbmNoZXMuZmluZChcbiAgICAgICAgICAoYikgPT5cbiAgICAgICAgICAgIGIubmFtZSA9PT0gd29ya3RyZWUuYnJhbmNoIHx8XG4gICAgICAgICAgICBiLm5hbWUgPT09IGByZWZzL2hlYWRzLyR7d29ya3RyZWUuYnJhbmNofWAgfHxcbiAgICAgICAgICAgIGIubmFtZS5yZXBsYWNlKC9eb3JpZ2luXFwvLywgJycpID09PSB3b3JrdHJlZS5icmFuY2hcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGJyYW5jaCkge1xuICAgICAgICAgIGJyYW5jaC53b3JrdHJlZSA9IHdvcmt0cmVlLnBhdGg7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGNhdGNoIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZygnRmFpbGVkIHRvIGdldCB3b3JrdHJlZSBpbmZvcm1hdGlvbicpO1xuICAgIH1cblxuICAgIC8vIFNvcnQgYnJhbmNoZXM6IGN1cnJlbnQgZmlyc3QsIHRoZW4gbG9jYWwsIHRoZW4gcmVtb3RlXG4gICAgYnJhbmNoZXMuc29ydCgoYSwgYikgPT4ge1xuICAgICAgaWYgKGEuY3VycmVudCAmJiAhYi5jdXJyZW50KSByZXR1cm4gLTE7XG4gICAgICBpZiAoIWEuY3VycmVudCAmJiBiLmN1cnJlbnQpIHJldHVybiAxO1xuICAgICAgaWYgKCFhLnJlbW90ZSAmJiBiLnJlbW90ZSkgcmV0dXJuIC0xO1xuICAgICAgaWYgKGEucmVtb3RlICYmICFiLnJlbW90ZSkgcmV0dXJuIDE7XG4gICAgICByZXR1cm4gYS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5uYW1lKTtcbiAgICB9KTtcblxuICAgIHJldHVybiBicmFuY2hlcztcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBsb2dnZXIuZXJyb3IoJ0Vycm9yIGxpc3RpbmcgYnJhbmNoZXM6JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG5cbi8qKlxuICogUGFyc2Ugd29ya3RyZWUgbGlzdCBvdXRwdXRcbiAqL1xuZnVuY3Rpb24gcGFyc2VXb3JrdHJlZUxpc3Qob3V0cHV0OiBzdHJpbmcpOiBBcnJheTx7IHBhdGg6IHN0cmluZzsgYnJhbmNoOiBzdHJpbmcgfT4ge1xuICBjb25zdCB3b3JrdHJlZXM6IEFycmF5PHsgcGF0aDogc3RyaW5nOyBicmFuY2g6IHN0cmluZyB9PiA9IFtdO1xuICBjb25zdCBsaW5lcyA9IG91dHB1dC50cmltKCkuc3BsaXQoJ1xcbicpO1xuXG4gIGxldCBjdXJyZW50OiB7IHBhdGg/OiBzdHJpbmc7IGJyYW5jaD86IHN0cmluZyB9ID0ge307XG5cbiAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgaWYgKGxpbmUgPT09ICcnKSB7XG4gICAgICBpZiAoY3VycmVudC5wYXRoICYmIGN1cnJlbnQuYnJhbmNoKSB7XG4gICAgICAgIHdvcmt0cmVlcy5wdXNoKHsgcGF0aDogY3VycmVudC5wYXRoLCBicmFuY2g6IGN1cnJlbnQuYnJhbmNoIH0pO1xuICAgICAgfVxuICAgICAgY3VycmVudCA9IHt9O1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgY29uc3QgW2tleSwgLi4udmFsdWVQYXJ0c10gPSBsaW5lLnNwbGl0KCcgJyk7XG4gICAgY29uc3QgdmFsdWUgPSB2YWx1ZVBhcnRzLmpvaW4oJyAnKTtcblxuICAgIGlmIChrZXkgPT09ICd3b3JrdHJlZScpIHtcbiAgICAgIGN1cnJlbnQucGF0aCA9IHZhbHVlO1xuICAgIH0gZWxzZSBpZiAoa2V5ID09PSAnYnJhbmNoJykge1xuICAgICAgY3VycmVudC5icmFuY2ggPSB2YWx1ZS5yZXBsYWNlKC9ecmVmc1xcL2hlYWRzXFwvLywgJycpO1xuICAgIH1cbiAgfVxuXG4gIC8vIEhhbmRsZSBsYXN0IHdvcmt0cmVlXG4gIGlmIChjdXJyZW50LnBhdGggJiYgY3VycmVudC5icmFuY2gpIHtcbiAgICB3b3JrdHJlZXMucHVzaCh7IHBhdGg6IGN1cnJlbnQucGF0aCwgYnJhbmNoOiBjdXJyZW50LmJyYW5jaCB9KTtcbiAgfVxuXG4gIHJldHVybiB3b3JrdHJlZXM7XG59XG5cbi8qKlxuICogQ3JlYXRlIGEgRGlzY292ZXJlZFJlcG9zaXRvcnkgZnJvbSBhIHBhdGhcbiAqL1xuYXN5bmMgZnVuY3Rpb24gY3JlYXRlRGlzY292ZXJlZFJlcG9zaXRvcnkocmVwb1BhdGg6IHN0cmluZyk6IFByb21pc2U8RGlzY292ZXJlZFJlcG9zaXRvcnk+IHtcbiAgY29uc3QgZm9sZGVyTmFtZSA9IHBhdGguYmFzZW5hbWUocmVwb1BhdGgpO1xuXG4gIC8vIEdldCBsYXN0IG1vZGlmaWVkIGRhdGVcbiAgY29uc3Qgc3RhdHMgPSBhd2FpdCBmcy5zdGF0KHJlcG9QYXRoKTtcbiAgY29uc3QgbGFzdE1vZGlmaWVkID0gc3RhdHMubXRpbWUudG9JU09TdHJpbmcoKTtcblxuICAvLyBHZXQgcmVsYXRpdmUgcGF0aCBmcm9tIGhvbWUgZGlyZWN0b3J5XG4gIGNvbnN0IGhvbWVEaXIgPSBvcy5ob21lZGlyKCk7XG4gIGNvbnN0IHJlbGF0aXZlUGF0aCA9IHJlcG9QYXRoLnN0YXJ0c1dpdGgoaG9tZURpcilcbiAgICA/IGB+JHtyZXBvUGF0aC5zbGljZShob21lRGlyLmxlbmd0aCl9YFxuICAgIDogcmVwb1BhdGg7XG5cbiAgLy8gR2V0IGN1cnJlbnQgZ2l0IGJyYW5jaFxuICBsZXQgZ2l0QnJhbmNoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gIHRyeSB7XG4gICAgY29uc3QgeyBzdGRvdXQ6IGJyYW5jaCB9ID0gYXdhaXQgZXhlY0FzeW5jKCdnaXQgYnJhbmNoIC0tc2hvdy1jdXJyZW50Jywge1xuICAgICAgY3dkOiByZXBvUGF0aCxcbiAgICB9KTtcbiAgICBnaXRCcmFuY2ggPSBicmFuY2gudHJpbSgpO1xuICB9IGNhdGNoIHtcbiAgICAvLyBGYWlsZWQgdG8gZ2V0IGJyYW5jaCAtIHJlcG9zaXRvcnkgbWlnaHQgbm90IGhhdmUgYW55IGNvbW1pdHMgeWV0XG4gICAgbG9nZ2VyLmRlYnVnKGBGYWlsZWQgdG8gZ2V0IGdpdCBicmFuY2ggZm9yICR7cmVwb1BhdGh9YCk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGlkOiBgJHtmb2xkZXJOYW1lfS0ke3N0YXRzLmlub31gLFxuICAgIHBhdGg6IHJlcG9QYXRoLFxuICAgIGZvbGRlck5hbWUsXG4gICAgbGFzdE1vZGlmaWVkLFxuICAgIHJlbGF0aXZlUGF0aCxcbiAgICBnaXRCcmFuY2gsXG4gIH07XG59XG4iXX0=