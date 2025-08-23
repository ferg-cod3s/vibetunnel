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
exports.createFilesystemRoutes = createFilesystemRoutes;
const chalk_1 = __importDefault(require("chalk"));
const child_process_1 = require("child_process");
const express_1 = require("express");
const fs_1 = require("fs");
const fs = __importStar(require("fs/promises"));
const mime_types_1 = __importDefault(require("mime-types"));
const path = __importStar(require("path"));
const util_1 = require("util");
const logger_js_1 = require("../utils/logger.js");
const path_utils_js_1 = require("../utils/path-utils.js");
const logger = (0, logger_js_1.createLogger)('filesystem');
const execAsync = (0, util_1.promisify)(child_process_1.exec);
function createFilesystemRoutes() {
    const router = (0, express_1.Router)();
    // Helper to check if path is safe (no directory traversal)
    function isPathSafe(requestedPath, basePath) {
        try {
            const resolvedPath = path.resolve(requestedPath);
            const resolvedBase = path.resolve(basePath);
            // Allow access to user's home directory and its subdirectories
            const userHome = process.env.HOME || process.env.USERPROFILE;
            if (userHome) {
                const resolvedHome = path.resolve(userHome);
                if (resolvedPath.startsWith(resolvedHome)) {
                    return true;
                }
            }
            // Allow access to common safe directories
            const safePaths = [
                '/tmp',
                '/var/tmp',
                '/usr/local',
                '/opt',
                process.cwd(), // Current working directory
            ];
            for (const safePath of safePaths) {
                const resolvedSafePath = path.resolve(safePath);
                if (resolvedPath.startsWith(resolvedSafePath)) {
                    return true;
                }
            }
            // Check if path is within base path
            return resolvedPath.startsWith(resolvedBase);
        }
        catch (error) {
            logger.warn(`Path safety check failed for ${requestedPath}:`, error);
            return false;
        }
    }
    // Helper to get Git status for a directory
    async function getGitStatus(dirPath) {
        try {
            // Check if directory is a git repository and get repo root
            const { stdout: repoRoot } = await execAsync('git rev-parse --show-toplevel', {
                cwd: dirPath,
            });
            const gitRepoRoot = repoRoot.trim();
            // Get current branch
            const { stdout: branch } = await execAsync('git branch --show-current', { cwd: dirPath });
            // Get status relative to repository root
            const { stdout: statusOutput } = await execAsync('git status --porcelain', {
                cwd: gitRepoRoot,
            });
            const status = {
                isGitRepo: true,
                branch: branch.trim(),
                modified: [],
                added: [],
                deleted: [],
                untracked: [],
            };
            // Parse git status output
            statusOutput.split('\n').forEach((line) => {
                if (!line)
                    return;
                const statusCode = line.substring(0, 2);
                const filename = line.substring(3);
                if (statusCode === ' M' || statusCode === 'M ' || statusCode === 'MM') {
                    status.modified.push(filename);
                }
                else if (statusCode === 'A ' || statusCode === 'AM') {
                    status.added.push(filename);
                }
                else if (statusCode === ' D' || statusCode === 'D ') {
                    status.deleted.push(filename);
                }
                else if (statusCode === '??') {
                    status.untracked.push(filename);
                }
            });
            return { status, repoRoot: gitRepoRoot };
        }
        catch {
            return null;
        }
    }
    // Helper to get file Git status
    function getFileGitStatus(filePath, gitStatus, gitRepoPath) {
        if (!gitStatus)
            return undefined;
        // Get path relative to git repository root
        const relativePath = path.relative(gitRepoPath, filePath);
        if (gitStatus.modified.includes(relativePath))
            return 'modified';
        if (gitStatus.added.includes(relativePath))
            return 'added';
        if (gitStatus.deleted.includes(relativePath))
            return 'deleted';
        if (gitStatus.untracked.includes(relativePath))
            return 'untracked';
        return 'unchanged';
    }
    // Browse directory endpoint
    router.get('/fs/browse', async (req, res) => {
        try {
            let requestedPath = req.query.path || '.';
            const showHidden = req.query.showHidden === 'true';
            const gitFilter = req.query.gitFilter; // 'all' | 'changed' | 'none'
            // Handle tilde expansion for home directory
            requestedPath = (0, path_utils_js_1.expandTildePath)(requestedPath);
            logger.debug(`browsing directory: ${requestedPath}, showHidden: ${showHidden}, gitFilter: ${gitFilter}`);
            // Security check
            if (!isPathSafe(requestedPath, process.cwd())) {
                logger.warn(`access denied for path: ${requestedPath}`);
                return res.status(403).json({ error: 'Access denied' });
            }
            const fullPath = path.resolve(requestedPath);
            // Check if path exists and is a directory
            let stats;
            try {
                stats = await fs.stat(fullPath);
            }
            catch (error) {
                if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
                    logger.warn(`directory not found: ${requestedPath}`);
                    return res.status(404).json({ error: 'Directory not found' });
                }
                // Re-throw other errors to be handled by outer catch
                throw error;
            }
            if (!stats.isDirectory()) {
                logger.warn(`path is not a directory: ${requestedPath}`);
                return res.status(400).json({ error: 'Path is not a directory' });
            }
            // Get Git status if requested
            const gitStatusStart = Date.now();
            const gitInfo = gitFilter !== 'none' ? await getGitStatus(fullPath) : null;
            const gitStatus = gitInfo?.status || null;
            const gitRepoRoot = gitInfo?.repoRoot || '';
            if (gitFilter !== 'none') {
                logger.debug(`git status check took ${Date.now() - gitStatusStart}ms for ${requestedPath}`);
            }
            let files = [];
            // If filtering by git changes, show all changed files recursively
            if (gitFilter === 'changed' && gitStatus) {
                // Get all changed files from git status
                const allChangedFiles = [
                    ...gitStatus.modified.map((f) => ({ path: f, status: 'modified' })),
                    ...gitStatus.added.map((f) => ({ path: f, status: 'added' })),
                    ...gitStatus.deleted.map((f) => ({ path: f, status: 'deleted' })),
                    ...gitStatus.untracked.map((f) => ({ path: f, status: 'untracked' })),
                ];
                // Filter to only files under the current directory
                const currentDirRelativeToRepo = path.relative(gitRepoRoot, fullPath);
                const relevantFiles = allChangedFiles.filter((f) => {
                    // If we're at repo root, show all files
                    if (fullPath === gitRepoRoot)
                        return true;
                    // Otherwise, only show files under current directory
                    return f.path.startsWith(`${currentDirRelativeToRepo}/`);
                });
                // Convert to FileInfo objects
                files = await Promise.all(relevantFiles.map(async (changedFile) => {
                    const absolutePath = path.join(gitRepoRoot, changedFile.path);
                    // Check if file exists (it might be deleted)
                    let fileStats = null;
                    let fileType = 'file';
                    try {
                        fileStats = await fs.stat(absolutePath);
                        fileType = fileStats.isDirectory() ? 'directory' : 'file';
                    }
                    catch {
                        // File might be deleted
                        fileStats = null;
                    }
                    // Get relative display name (relative to current directory)
                    const relativeToCurrentDir = path.relative(fullPath, absolutePath);
                    const fileInfo = {
                        name: relativeToCurrentDir,
                        path: path.relative(process.cwd(), absolutePath),
                        type: fileType,
                        size: fileStats?.size || 0,
                        modified: fileStats?.mtime.toISOString() || new Date().toISOString(),
                        permissions: fileStats?.mode?.toString(8).slice(-3) || '000',
                        isGitTracked: true,
                        gitStatus: changedFile.status,
                    };
                    return fileInfo;
                }));
            }
            else {
                // Normal directory listing
                const entries = await fs.readdir(fullPath, { withFileTypes: true });
                files = await Promise.all(entries
                    .filter((entry) => showHidden || !entry.name.startsWith('.'))
                    .map(async (entry) => {
                    const entryPath = path.join(fullPath, entry.name);
                    try {
                        // Use fs.stat() which follows symlinks, instead of entry.isDirectory()
                        const stats = await fs.stat(entryPath);
                        const relativePath = path.relative(process.cwd(), entryPath);
                        // Check if this is a symlink
                        const isSymlink = entry.isSymbolicLink();
                        const fileInfo = {
                            name: entry.name,
                            path: relativePath,
                            type: stats.isDirectory() ? 'directory' : 'file',
                            size: stats.size,
                            modified: stats.mtime.toISOString(),
                            permissions: stats.mode.toString(8).slice(-3),
                            isGitTracked: gitStatus?.isGitRepo || false,
                            gitStatus: getFileGitStatus(entryPath, gitStatus, gitRepoRoot),
                            isSymlink,
                        };
                        return fileInfo;
                    }
                    catch (error) {
                        // Handle broken symlinks or permission errors
                        logger.warn(`failed to stat ${entryPath}:`, error);
                        // For broken symlinks, we'll still show them but as files
                        const fileInfo = {
                            name: entry.name,
                            path: path.relative(process.cwd(), entryPath),
                            type: 'file',
                            size: 0,
                            modified: new Date().toISOString(),
                            permissions: '000',
                            isGitTracked: false,
                            gitStatus: undefined,
                        };
                        return fileInfo;
                    }
                }));
            }
            // No additional filtering needed if we already filtered by git status above
            const filteredFiles = files;
            // Sort: directories first, then by name
            filteredFiles.sort((a, b) => {
                if (a.type !== b.type) {
                    return a.type === 'directory' ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });
            logger.debug(`directory browsed successfully: ${requestedPath} (${filteredFiles.length} items)`);
            res.json({
                path: requestedPath,
                fullPath,
                gitStatus,
                files: filteredFiles,
            });
        }
        catch (error) {
            logger.error(`failed to browse directory ${req.query.path}:`, error);
            res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
        }
    });
    // Get file preview
    router.get('/fs/preview', async (req, res) => {
        try {
            const requestedPath = req.query.path;
            if (!requestedPath) {
                return res.status(400).json({ error: 'Path is required' });
            }
            logger.debug(`previewing file: ${requestedPath}`);
            // Security check
            if (!isPathSafe(requestedPath, process.cwd())) {
                logger.warn(`access denied for file preview: ${requestedPath}`);
                return res.status(403).json({ error: 'Access denied' });
            }
            const fullPath = path.resolve(process.cwd(), requestedPath);
            const stats = await fs.stat(fullPath);
            if (stats.isDirectory()) {
                logger.warn(`cannot preview directory: ${requestedPath}`);
                return res.status(400).json({ error: 'Cannot preview directories' });
            }
            // Determine file type
            const mimeType = mime_types_1.default.lookup(fullPath) || 'application/octet-stream';
            const isText = mimeType.startsWith('text/') ||
                mimeType === 'application/json' ||
                mimeType === 'application/javascript' ||
                mimeType === 'application/typescript' ||
                mimeType === 'application/xml';
            const isImage = mimeType.startsWith('image/');
            if (isImage) {
                // For images, return URL to fetch the image
                logger.log(chalk_1.default.green(`image preview generated: ${requestedPath} (${formatBytes(stats.size)})`));
                res.json({
                    type: 'image',
                    mimeType,
                    url: `/api/fs/raw?path=${encodeURIComponent(requestedPath)}`,
                    size: stats.size,
                });
            }
            else if (isText || stats.size < 1024 * 1024) {
                // Text or small files (< 1MB)
                const content = await fs.readFile(fullPath, 'utf-8');
                const language = getLanguageFromPath(fullPath);
                logger.log(chalk_1.default.green(`text file preview generated: ${requestedPath} (${formatBytes(stats.size)}, ${language})`));
                res.json({
                    type: 'text',
                    content,
                    language,
                    mimeType,
                    size: stats.size,
                });
            }
            else {
                // Binary or large files
                logger.log(`binary file preview metadata returned: ${requestedPath} (${formatBytes(stats.size)})`);
                res.json({
                    type: 'binary',
                    mimeType,
                    size: stats.size,
                    humanSize: formatBytes(stats.size),
                });
            }
        }
        catch (error) {
            logger.error(`failed to preview file ${req.query.path}:`, error);
            res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
        }
    });
    // Serve raw file content
    router.get('/fs/raw', (req, res) => {
        try {
            const requestedPath = req.query.path;
            if (!requestedPath) {
                return res.status(400).json({ error: 'Path is required' });
            }
            logger.debug(`serving raw file: ${requestedPath}`);
            // Security check
            if (!isPathSafe(requestedPath, process.cwd())) {
                logger.warn(`access denied for raw file: ${requestedPath}`);
                return res.status(403).json({ error: 'Access denied' });
            }
            const fullPath = path.resolve(process.cwd(), requestedPath);
            // Check if file exists
            if (!(0, fs_1.statSync)(fullPath).isFile()) {
                logger.warn(`file not found for raw access: ${requestedPath}`);
                return res.status(404).json({ error: 'File not found' });
            }
            // Set appropriate content type
            const mimeType = mime_types_1.default.lookup(fullPath) || 'application/octet-stream';
            res.setHeader('Content-Type', mimeType);
            // Stream the file
            const stream = (0, fs_1.createReadStream)(fullPath);
            stream.pipe(res);
            stream.on('end', () => {
                logger.log(chalk_1.default.green(`raw file served: ${requestedPath}`));
            });
        }
        catch (error) {
            logger.error(`failed to serve raw file ${req.query.path}:`, error);
            res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
        }
    });
    // Get file content (text files only)
    router.get('/fs/content', async (req, res) => {
        try {
            const requestedPath = req.query.path;
            if (!requestedPath) {
                return res.status(400).json({ error: 'Path is required' });
            }
            logger.debug(`getting file content: ${requestedPath}`);
            // Security check
            if (!isPathSafe(requestedPath, process.cwd())) {
                logger.warn(`access denied for file content: ${requestedPath}`);
                return res.status(403).json({ error: 'Access denied' });
            }
            const fullPath = path.resolve(process.cwd(), requestedPath);
            const content = await fs.readFile(fullPath, 'utf-8');
            logger.log(chalk_1.default.green(`file content retrieved: ${requestedPath}`));
            res.json({
                path: requestedPath,
                content,
                language: getLanguageFromPath(fullPath),
            });
        }
        catch (error) {
            logger.error(`failed to get file content ${req.query.path}:`, error);
            res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
        }
    });
    // Get Git diff for a file
    router.get('/fs/diff', async (req, res) => {
        try {
            const requestedPath = req.query.path;
            if (!requestedPath) {
                return res.status(400).json({ error: 'Path is required' });
            }
            logger.debug(`getting git diff: ${requestedPath}`);
            // Security check
            if (!isPathSafe(requestedPath, process.cwd())) {
                logger.warn(`access denied for git diff: ${requestedPath}`);
                return res.status(403).json({ error: 'Access denied' });
            }
            const fullPath = path.resolve(process.cwd(), requestedPath);
            const relativePath = path.relative(process.cwd(), fullPath);
            // Get git diff
            const diffStart = Date.now();
            const { stdout: diff } = await execAsync(`git diff HEAD -- "${relativePath}"`, {
                cwd: process.cwd(),
            });
            const diffTime = Date.now() - diffStart;
            if (diffTime > 1000) {
                logger.warn(`slow git diff operation: ${requestedPath} took ${diffTime}ms`);
            }
            logger.log(chalk_1.default.green(`git diff retrieved: ${requestedPath} (${diff.length > 0 ? 'has changes' : 'no changes'})`));
            res.json({
                path: requestedPath,
                diff,
                hasDiff: diff.length > 0,
            });
        }
        catch (error) {
            logger.error(`failed to get git diff for ${req.query.path}:`, error);
            res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
        }
    });
    // Get file content for diff view (current and HEAD versions)
    router.get('/fs/diff-content', async (req, res) => {
        try {
            const requestedPath = req.query.path;
            if (!requestedPath) {
                return res.status(400).json({ error: 'Path is required' });
            }
            logger.debug(`getting diff content: ${requestedPath}`);
            // Security check
            if (!isPathSafe(requestedPath, process.cwd())) {
                logger.warn(`access denied for diff content: ${requestedPath}`);
                return res.status(403).json({ error: 'Access denied' });
            }
            const fullPath = path.resolve(process.cwd(), requestedPath);
            const relativePath = path.relative(process.cwd(), fullPath);
            logger.debug(`Getting diff content for: ${requestedPath}`);
            logger.debug(`Full path: ${fullPath}`);
            logger.debug(`CWD: ${process.cwd()}`);
            // Get current file content
            const currentContent = await fs.readFile(fullPath, 'utf-8');
            logger.debug(`Current content length: ${currentContent.length}`);
            // Get HEAD version content
            let originalContent = ''; // Default to empty string for new files
            try {
                // Use ./ prefix as git suggests for paths relative to current directory
                const gitPath = `./${relativePath}`;
                logger.debug(`Getting HEAD version: git show HEAD:"${gitPath}"`);
                const { stdout } = await execAsync(`git show HEAD:"${gitPath}"`, {
                    cwd: process.cwd(),
                });
                originalContent = stdout;
                logger.debug(`Got HEAD version for ${gitPath}, length: ${originalContent.length}`);
            }
            catch (error) {
                // File might be new (not in HEAD), use empty string
                if (error instanceof Error && error.message.includes('does not exist')) {
                    originalContent = '';
                    logger.debug(`File ${requestedPath} does not exist in HEAD (new file)`);
                }
                else {
                    // For other errors, log the full error
                    logger.error(`Failed to get HEAD version of ./${relativePath}:`, error);
                    // Check if it's a stderr message
                    if (error instanceof Error && 'stderr' in error) {
                        const execError = error;
                        if (execError.stderr) {
                            logger.error(`Git stderr: ${execError.stderr}`);
                        }
                    }
                    // For non-git repos, show no diff
                    originalContent = currentContent;
                }
            }
            logger.log(chalk_1.default.green(`diff content retrieved: ${requestedPath}`));
            res.json({
                path: requestedPath,
                originalContent,
                modifiedContent: currentContent,
                language: getLanguageFromPath(fullPath),
            });
        }
        catch (error) {
            logger.error(`failed to get diff content for ${req.query.path}:`, error);
            res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
        }
    });
    // Create directory
    router.post('/fs/mkdir', async (req, res) => {
        try {
            const { path: dirPath, name } = req.body;
            if (!dirPath || !name) {
                return res.status(400).json({ error: 'Path and name are required' });
            }
            logger.log(`creating directory: ${name} in ${dirPath}`);
            // Validate name (no slashes, no dots at start)
            if (name.includes('/') || name.includes('\\') || name.startsWith('.')) {
                logger.warn(`invalid directory name attempted: ${name}`);
                return res.status(400).json({ error: 'Invalid directory name' });
            }
            // Security check
            if (!isPathSafe(dirPath, process.cwd())) {
                logger.warn(`access denied for mkdir: ${dirPath}/${name}`);
                return res.status(403).json({ error: 'Access denied' });
            }
            const fullPath = path.resolve(process.cwd(), dirPath, name);
            // Create directory
            await fs.mkdir(fullPath, { recursive: true });
            logger.log(chalk_1.default.green(`directory created: ${path.relative(process.cwd(), fullPath)}`));
            res.json({
                success: true,
                path: path.relative(process.cwd(), fullPath),
            });
        }
        catch (error) {
            logger.error(`failed to create directory ${req.body.path}/${req.body.name}:`, error);
            res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
        }
    });
    // Path completions endpoint for autocomplete
    router.get('/fs/completions', async (req, res) => {
        try {
            const originalPath = req.query.path || '';
            let partialPath = originalPath;
            // Handle tilde expansion for home directory
            partialPath = (0, path_utils_js_1.expandTildePath)(partialPath);
            // Separate directory and partial name
            let dirPath;
            let partialName;
            if (partialPath.endsWith('/')) {
                // If path ends with slash, list contents of that directory
                dirPath = partialPath;
                partialName = '';
            }
            else {
                // Otherwise, get the directory and partial filename
                dirPath = path.dirname(partialPath);
                partialName = path.basename(partialPath);
            }
            // Resolve the directory path
            const fullDirPath = path.resolve(dirPath);
            // Security check
            if (!isPathSafe(fullDirPath, '/')) {
                logger.warn(`access denied for path completions: ${fullDirPath}`);
                return res.status(403).json({ error: 'Access denied' });
            }
            // Check if directory exists
            let dirStats;
            try {
                dirStats = await fs.stat(fullDirPath);
                if (!dirStats.isDirectory()) {
                    return res.json({ completions: [] });
                }
            }
            catch {
                // Directory doesn't exist, return empty completions
                return res.json({ completions: [] });
            }
            // Read directory contents
            const entries = await fs.readdir(fullDirPath, { withFileTypes: true });
            // Filter and map entries
            const mappedEntries = await Promise.all(entries
                .filter((entry) => {
                // Filter by partial name (case-insensitive)
                if (partialName && !entry.name.toLowerCase().startsWith(partialName.toLowerCase())) {
                    return false;
                }
                // Optionally hide hidden files unless the partial name starts with '.'
                if (!partialName.startsWith('.') && entry.name.startsWith('.')) {
                    return false;
                }
                return true;
            })
                .map(async (entry) => {
                const isDirectory = entry.isDirectory();
                const entryPath = path.join(fullDirPath, entry.name);
                // Build the suggestion path based on the original input
                let displayPath;
                if (originalPath.endsWith('/')) {
                    displayPath = originalPath + entry.name;
                }
                else {
                    const lastSlash = originalPath.lastIndexOf('/');
                    if (lastSlash >= 0) {
                        displayPath = originalPath.substring(0, lastSlash + 1) + entry.name;
                    }
                    else {
                        displayPath = entry.name;
                    }
                }
                // Check if this directory is a git repository and get branch + status
                let isGitRepo = false;
                let gitBranch;
                let gitStatusCount = 0;
                let gitAddedCount = 0;
                let gitModifiedCount = 0;
                let gitDeletedCount = 0;
                let isWorktree = false;
                if (isDirectory) {
                    try {
                        const gitPath = path.join(entryPath, '.git');
                        const gitStat = await fs.stat(gitPath);
                        isGitRepo = true;
                        // Check if it's a worktree (has a .git file instead of directory)
                        if (gitStat.isFile()) {
                            isWorktree = true;
                        }
                        // Get the current git branch
                        try {
                            const { stdout: branch } = await execAsync('git branch --show-current', {
                                cwd: entryPath,
                            });
                            gitBranch = branch.trim();
                        }
                        catch {
                            // Failed to get branch
                        }
                        // Get the number of changed files by type
                        try {
                            const { stdout: statusOutput } = await execAsync('git status --porcelain', {
                                cwd: entryPath,
                            });
                            const lines = statusOutput.split('\n').filter((line) => line.trim() !== '');
                            for (const line of lines) {
                                const statusCode = line.substring(0, 2);
                                if (statusCode === '??' || statusCode === 'A ' || statusCode === 'AM') {
                                    gitAddedCount++;
                                }
                                else if (statusCode === ' D' || statusCode === 'D ') {
                                    gitDeletedCount++;
                                }
                                else if (statusCode === ' M' || statusCode === 'M ' || statusCode === 'MM') {
                                    gitModifiedCount++;
                                }
                            }
                            gitStatusCount = gitAddedCount + gitModifiedCount + gitDeletedCount;
                        }
                        catch {
                            // Failed to get status
                        }
                    }
                    catch {
                        // Not a git repository
                    }
                }
                return {
                    name: entry.name,
                    path: displayPath,
                    type: isDirectory ? 'directory' : 'file',
                    // Add trailing slash for directories
                    suggestion: isDirectory ? `${displayPath}/` : displayPath,
                    isRepository: isGitRepo,
                    gitBranch,
                    gitStatusCount,
                    gitAddedCount,
                    gitModifiedCount,
                    gitDeletedCount,
                    isWorktree,
                };
            }));
            const completions = mappedEntries
                .sort((a, b) => {
                // Sort directories first, then by name
                if (a.type !== b.type) {
                    return a.type === 'directory' ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            })
                .slice(0, 20); // Limit to 20 suggestions
            logger.debug(`path completions for "${originalPath}": ${completions.length} results`);
            res.json({
                completions,
                partialPath: originalPath,
            });
        }
        catch (error) {
            logger.error(`failed to get path completions for ${req.query.path}:`, error);
            res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
        }
    });
    return router;
}
// Helper function to determine language from file path
function getLanguageFromPath(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap = {
        '.js': 'javascript',
        '.jsx': 'javascript',
        '.ts': 'typescript',
        '.tsx': 'typescript',
        '.py': 'python',
        '.java': 'java',
        '.c': 'c',
        '.cpp': 'cpp',
        '.cs': 'csharp',
        '.php': 'php',
        '.rb': 'ruby',
        '.go': 'go',
        '.rs': 'rust',
        '.swift': 'swift',
        '.kt': 'kotlin',
        '.scala': 'scala',
        '.r': 'r',
        '.m': 'objective-c',
        '.mm': 'objective-c',
        '.h': 'c',
        '.hpp': 'cpp',
        '.sh': 'shell',
        '.bash': 'shell',
        '.zsh': 'shell',
        '.fish': 'shell',
        '.ps1': 'powershell',
        '.html': 'html',
        '.htm': 'html',
        '.xml': 'xml',
        '.css': 'css',
        '.scss': 'scss',
        '.sass': 'sass',
        '.less': 'less',
        '.json': 'json',
        '.yaml': 'yaml',
        '.yml': 'yaml',
        '.toml': 'toml',
        '.ini': 'ini',
        '.cfg': 'ini',
        '.conf': 'ini',
        '.sql': 'sql',
        '.md': 'markdown',
        '.markdown': 'markdown',
        '.tex': 'latex',
        '.dockerfile': 'dockerfile',
        '.makefile': 'makefile',
        '.cmake': 'cmake',
        '.gradle': 'gradle',
        '.vue': 'vue',
        '.svelte': 'svelte',
        '.elm': 'elm',
        '.clj': 'clojure',
        '.cljs': 'clojure',
        '.ex': 'elixir',
        '.exs': 'elixir',
        '.erl': 'erlang',
        '.hrl': 'erlang',
        '.fs': 'fsharp',
        '.fsx': 'fsharp',
        '.fsi': 'fsharp',
        '.ml': 'ocaml',
        '.mli': 'ocaml',
        '.pas': 'pascal',
        '.pp': 'pascal',
        '.pl': 'perl',
        '.pm': 'perl',
        '.t': 'perl',
        '.lua': 'lua',
        '.dart': 'dart',
        '.nim': 'nim',
        '.nims': 'nim',
        '.zig': 'zig',
        '.jl': 'julia',
    };
    return languageMap[ext] || 'plaintext';
}
// Helper function to format bytes
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0)
        return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZXN5c3RlbS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zZXJ2ZXIvcm91dGVzL2ZpbGVzeXN0ZW0udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFvQ0Esd0RBZ3hCQztBQXB6QkQsa0RBQTBCO0FBQzFCLGlEQUFxQztBQUNyQyxxQ0FBOEQ7QUFDOUQsMkJBQWdEO0FBQ2hELGdEQUFrQztBQUNsQyw0REFBOEI7QUFDOUIsMkNBQTZCO0FBQzdCLCtCQUFpQztBQUNqQyxrREFBa0Q7QUFDbEQsMERBQXlEO0FBRXpELE1BQU0sTUFBTSxHQUFHLElBQUEsd0JBQVksRUFBQyxZQUFZLENBQUMsQ0FBQztBQUUxQyxNQUFNLFNBQVMsR0FBRyxJQUFBLGdCQUFTLEVBQUMsb0JBQUksQ0FBQyxDQUFDO0FBdUJsQyxTQUFnQixzQkFBc0I7SUFDcEMsTUFBTSxNQUFNLEdBQUcsSUFBQSxnQkFBTSxHQUFFLENBQUM7SUFFeEIsMkRBQTJEO0lBQzNELFNBQVMsVUFBVSxDQUFDLGFBQXFCLEVBQUUsUUFBZ0I7UUFDekQsSUFBSSxDQUFDO1lBQ0gsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUNqRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRTVDLCtEQUErRDtZQUMvRCxNQUFNLFFBQVEsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQztZQUM3RCxJQUFJLFFBQVEsRUFBRSxDQUFDO2dCQUNiLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQzVDLElBQUksWUFBWSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDO29CQUMxQyxPQUFPLElB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LEtBQUssS0FBSyxDQUFDO1FBQUUsT0FBTyxTQUFTLENBQUM7SUFFbEMsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDO0lBQ2YsTUFBTSxFQUFFLEdBQUcsUUFBUSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUM7SUFDdkMsTUFBTSxLQUFLLEdBQUcsQ0FBQyxPQUFPLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFFaEQsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVwRCxPQUFPLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7QUFDMUUsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBjaGFsayBmcm9tICdjaGFsayc7XG5pbXBvcnQgeyBleGVjIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgeyB0eXBlIFJlcXVlc3QsIHR5cGUgUmVzcG9uc2UsIFJvdXRlciB9IGZyb20gJ2V4cHJlc3MnO1xuaW1wb3J0IHsgY3JlYXRlUmVhZFN0cmVhbSwgc3RhdFN5bmMgfSBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcy9wcm9taXNlcyc7XG5pbXBvcnQgbWltZSBmcm9tICdtaW1lLXR5cGVzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBwcm9taXNpZnkgfSBmcm9tICd1dGlsJztcbmltcG9ydCB7IGNyZWF0ZUxvZ2dlciB9IGZyb20gJy4uL3V0aWxzL2xvZ2dlci5qcyc7XG5pbXBvcnQgeyBleHBhbmRUaWxkZVBhdGggfSBmcm9tICcuLi91dGlscy9wYXRoLXV0aWxzLmpzJztcblxuY29uc3QgbG9nZ2VyID0gY3JlYXRlTG9nZ2VyKCdmaWxlc3lzdGVtJyk7XG5cbmNvbnN0IGV4ZWNBc3luYyA9IHByb21pc2lmeShleGVjKTtcblxuaW50ZXJmYWNlIEZpbGVJbmZvIHtcbiAgbmFtZTogc3RyaW5nO1xuICBwYXRoOiBzdHJpbmc7XG4gIHR5cGU6ICdmaWxlJyB8ICdkaXJlY3RvcnknO1xuICBzaXplOiBudW1iZXI7XG4gIG1vZGlmaWVkOiBzdHJpbmc7XG4gIHBlcm1pc3Npb25zPzogc3RyaW5nO1xuICBpc0dpdFRyYWNrZWQ/OiBib29sZWFuO1xuICBnaXRTdGF0dXM/OiAnbW9kaWZpZWQnIHwgJ2FkZGVkJyB8ICdkZWxldGVkJyB8ICd1bnRyYWNrZWQnIHwgJ3VuY2hhbmdlZCc7XG4gIGlzU3ltbGluaz86IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBHaXRTdGF0dXMge1xuICBpc0dpdFJlcG86IGJvb2xlYW47XG4gIGJyYW5jaD86IHN0cmluZztcbiAgbW9kaWZpZWQ6IHN0cmluZ1tdO1xuICBhZGRlZDogc3RyaW5nW107XG4gIGRlbGV0ZWQ6IHN0cmluZ1tdO1xuICB1bnRyYWNrZWQ6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRmlsZXN5c3RlbVJvdXRlcygpOiBSb3V0ZXIge1xuICBjb25zdCByb3V0ZXIgPSBSb3V0ZXIoKTtcblxuICAvLyBIZWxwZXIgdG8gY2hlY2sgaWYgcGF0aCBpcyBzYWZlIChubyBkaXJlY3RvcnkgdHJhdmVyc2FsKVxuICBmdW5jdGlvbiBpc1BhdGhTYWZlKHJlcXVlc3RlZFBhdGg6IHN0cmluZywgYmFzZVBhdGg6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNvbHZlZFBhdGggPSBwYXRoLnJlc29sdmUocmVxdWVzdGVkUGF0aCk7XG4gICAgICBjb25zdCByZXNvbHZlZEJhc2UgPSBwYXRoLnJlc29sdmUoYmFzZVBhdGgpO1xuXG4gICAgICAvLyBBbGxvdyBhY2Nlc3MgdG8gdXNlcidzIGhvbWUgZGlyZWN0b3J5IGFuZCBpdHMgc3ViZGlyZWN0b3JpZXNcbiAgICAgIGNvbnN0IHVzZXJIb21lID0gcHJvY2Vzcy5lbnYuSE9NRSB8fCBwcm9jZXNzLmVudi5VU0VSUFJPRklMRTtcbiAgICAgIGlmICh1c2VySG9tZSkge1xuICAgICAgICBjb25zdCByZXNvbHZlZEhvbWUgPSBwYXRoLnJlc29sdmUodXNlckhvbWUpO1xuICAgICAgICBpZiAocmVzb2x2ZWRQYXRoLnN0YXJ0c1dpdGgocmVzb2x2ZWRIb21lKSkge1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIEFsbG93IGFjY2VzcyB0byBjb21tb24gc2FmZSBkaXJlY3Rvcmllc1xuICAgICAgY29uc3Qgc2FmZVBhdGhzID0gW1xuICAgICAgICAnL3RtcCcsXG4gICAgICAgICcvdmFyL3RtcCcsXG4gICAgICAgICcvdXNyL2xvY2FsJyxcbiAgICAgICAgJy9vcHQnLFxuICAgICAgICBwcm9jZXNzLmN3ZCgpLCAvLyBDdXJyZW50IHdvcmtpbmcgZGlyZWN0b3J5XG4gICAgICBdO1xuXG4gICAgICBmb3IgKGNvbnN0IHNhZmVQYXRoIG9mIHNhZmVQYXRocykge1xuICAgICAgICBjb25zdCByZXNvbHZlZFNhZmVQYXRoID0gcGF0aC5yZXNvbHZlKHNhZmVQYXRoKTtcbiAgICAgICAgaWYgKHJlc29sdmVkUGF0aC5zdGFydHNXaXRoKHJlc29sdmVkU2FmZVBhdGgpKSB7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gQ2hlY2sgaWYgcGF0aCBpcyB3aXRoaW4gYmFzZSBwYXRoXG4gICAgICByZXR1cm4gcmVzb2x2ZWRQYXRoLnN0YXJ0c1dpdGgocmVzb2x2ZWRCYXNlKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLndhcm4oYFBhdGggc2FmZXR5IGNoZWNrIGZhaWxlZCBmb3IgJHtyZXF1ZXN0ZWRQYXRofTpgLCBlcnJvcik7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgLy8gSGVscGVyIHRvIGdldCBHaXQgc3RhdHVzIGZvciBhIGRpcmVjdG9yeVxuICBhc3luYyBmdW5jdGlvbiBnZXRHaXRTdGF0dXMoXG4gICAgZGlyUGF0aDogc3RyaW5nXG4gICk6IFByb21pc2U8eyBzdGF0dXM6IEdpdFN0YXR1czsgcmVwb1Jvb3Q6IHN0cmluZyB9IHwgbnVsbD4ge1xuICAgIHRyeSB7XG4gICAgICAvLyBDaGVjayBpZiBkaXJlY3RvcnkgaXMgYSBnaXQgcmVwb3NpdG9yeSBhbmQgZ2V0IHJlcG8gcm9vdFxuICAgICAgY29uc3QgeyBzdGRvdXQ6IHJlcG9Sb290IH0gPSBhd2FpdCBleGVjQXN5bmMoJ2dpdCByZXYtcGFyc2UgLS1zaG93LXRvcGxldmVsJywge1xuICAgICAgICBjd2Q6IGRpclBhdGgsXG4gICAgICB9KTtcbiAgICAgIGNvbnN0IGdpdFJlcG9Sb290ID0gcmVwb1Jvb3QudHJpbSgpO1xuXG4gICAgICAvLyBHZXQgY3VycmVudCBicmFuY2hcbiAgICAgIGNvbnN0IHsgc3Rkb3V0OiBicmFuY2ggfSA9IGF3YWl0IGV4ZWNBc3luYygnZ2l0IGJyYW5jaCAtLXNob3ctY3VycmVudCcsIHsgY3dkOiBkaXJQYXRoIH0pO1xuXG4gICAgICAvLyBHZXQgc3RhdHVzIHJlbGF0aXZlIHRvIHJlcG9zaXRvcnkgcm9vdFxuICAgICAgY29uc3QgeyBzdGRvdXQ6IHN0YXR1c091dHB1dCB9ID0gYXdhaXQgZXhlY0FzeW5jKCdnaXQgc3RhdHVzIC0tcG9yY2VsYWluJywge1xuICAgICAgICBjd2Q6IGdpdFJlcG9Sb290LFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHN0YXR1czogR2l0U3RhdHVzID0ge1xuICAgICAgICBpc0dpdFJlcG86IHRydWUsXG4gICAgICAgIGJyYW5jaDogYnJhbmNoLnRyaW0oKSxcbiAgICAgICAgbW9kaWZpZWQ6IFtdLFxuICAgICAgICBhZGRlZDogW10sXG4gICAgICAgIGRlbGV0ZWQ6IFtdLFxuICAgICAgICB1bnRyYWNrZWQ6IFtdLFxuICAgICAgfTtcblxuICAgICAgLy8gUGFyc2UgZ2l0IHN0YXR1cyBvdXRwdXRcbiAgICAgIHN0YXR1c091dHB1dC5zcGxpdCgnXFxuJykuZm9yRWFjaCgobGluZSkgPT4ge1xuICAgICAgICBpZiAoIWxpbmUpIHJldHVybjtcblxuICAgICAgICBjb25zdCBzdGF0dXNDb2RlID0gbGluZS5zdWJzdHJpbmcoMCwgMik7XG4gICAgICAgIGNvbnN0IGZpbGVuYW1lID0gbGluZS5zdWJzdHJpbmcoMyk7XG5cbiAgICAgICAgaWYgKHN0YXR1c0NvZGUgPT09ICcgTScgfHwgc3RhdHVzQ29kZSA9PT0gJ00gJyB8fCBzdGF0dXNDb2RlID09PSAnTU0nKSB7XG4gICAgICAgICAgc3RhdHVzLm1vZGlmaWVkLnB1c2goZmlsZW5hbWUpO1xuICAgICAgICB9IGVsc2UgaWYgKHN0YXR1c0NvZGUgPT09ICdBICcgfHwgc3RhdHVzQ29kZSA9PT0gJ0FNJykge1xuICAgICAgICAgIHN0YXR1cy5hZGRlZC5wdXNoKGZpbGVuYW1lKTtcbiAgICAgICAgfSBlbHNlIGlmIChzdGF0dXNDb2RlID09PSAnIEQnIHx8IHN0YXR1c0NvZGUgPT09ICdEICcpIHtcbiAgICAgICAgICBzdGF0dXMuZGVsZXRlZC5wdXNoKGZpbGVuYW1lKTtcbiAgICAgICAgfSBlbHNlIGlmIChzdGF0dXNDb2RlID09PSAnPz8nKSB7XG4gICAgICAgICAgc3RhdHVzLnVudHJhY2tlZC5wdXNoKGZpbGVuYW1lKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiB7IHN0YXR1cywgcmVwb1Jvb3Q6IGdpdFJlcG9Sb290IH07XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gIH1cblxuICAvLyBIZWxwZXIgdG8gZ2V0IGZpbGUgR2l0IHN0YXR1c1xuICBmdW5jdGlvbiBnZXRGaWxlR2l0U3RhdHVzKFxuICAgIGZpbGVQYXRoOiBzdHJpbmcsXG4gICAgZ2l0U3RhdHVzOiBHaXRTdGF0dXMgfCBudWxsLFxuICAgIGdpdFJlcG9QYXRoOiBzdHJpbmdcbiAgKTogRmlsZUluZm9bJ2dpdFN0YXR1cyddIHtcbiAgICBpZiAoIWdpdFN0YXR1cykgcmV0dXJuIHVuZGVmaW5lZDtcblxuICAgIC8vIEdldCBwYXRoIHJlbGF0aXZlIHRvIGdpdCByZXBvc2l0b3J5IHJvb3RcbiAgICBjb25zdCByZWxhdGl2ZVBhdGggPSBwYXRoLnJlbGF0aXZlKGdpdFJlcG9QYXRoLCBmaWxlUGF0aCk7XG5cbiAgICBpZiAoZ2l0U3RhdHVzLm1vZGlmaWVkLmluY2x1ZGVzKHJlbGF0aXZlUGF0aCkpIHJldHVybiAnbW9kaWZpZWQnO1xuICAgIGlmIChnaXRTdGF0dXMuYWRkZWQuaW5jbHVkZXMocmVsYXRpdmVQYXRoKSkgcmV0dXJuICdhZGRlZCc7XG4gICAgaWYgKGdpdFN0YXR1cy5kZWxldGVkLmluY2x1ZGVzKHJlbGF0aXZlUGF0aCkpIHJldHVybiAnZGVsZXRlZCc7XG4gICAgaWYgKGdpdFN0YXR1cy51bnRyYWNrZWQuaW5jbHVkZXMocmVsYXRpdmVQYXRoKSkgcmV0dXJuICd1bnRyYWNrZWQnO1xuXG4gICAgcmV0dXJuICd1bmNoYW5nZWQnO1xuICB9XG5cbiAgLy8gQnJvd3NlIGRpcmVjdG9yeSBlbmRwb2ludFxuICByb3V0ZXIuZ2V0KCcvZnMvYnJvd3NlJywgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSkgPT4ge1xuICAgIHRyeSB7XG4gICAgICBsZXQgcmVxdWVzdGVkUGF0aCA9IChyZXEucXVlcnkucGF0aCBhcyBzdHJpbmcpIHx8ICcuJztcbiAgICAgIGNvbnN0IHNob3dIaWRkZW4gPSByZXEucXVlcnkuc2hvd0hpZGRlbiA9PT0gJ3RydWUnO1xuICAgICAgY29uc3QgZ2l0RmlsdGVyID0gcmVxLnF1ZXJ5LmdpdEZpbHRlciBhcyBzdHJpbmc7IC8vICdhbGwnIHwgJ2NoYW5nZWQnIHwgJ25vbmUnXG5cbiAgICAgIC8vIEhhbmRsZSB0aWxkZSBleHBhbnNpb24gZm9yIGhvbWUgZGlyZWN0b3J5XG4gICAgICByZXF1ZXN0ZWRQYXRoID0gZXhwYW5kVGlsZGVQYXRoKHJlcXVlc3RlZFBhdGgpO1xuXG4gICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgIGBicm93c2luZyBkaXJlY3Rvcnk6ICR7cmVxdWVzdGVkUGF0aH0sIHNob3dIaWRkZW46ICR7c2hvd0hpZGRlbn0sIGdpdEZpbHRlcjogJHtnaXRGaWx0ZXJ9YFxuICAgICAgKTtcblxuICAgICAgLy8gU2VjdXJpdHkgY2hlY2tcbiAgICAgIGlmICghaXNQYXRoU2FmZShyZXF1ZXN0ZWRQYXRoLCBwcm9jZXNzLmN3ZCgpKSkge1xuICAgICAgICBsb2dnZXIud2FybihgYWNjZXNzIGRlbmllZCBmb3IgcGF0aDogJHtyZXF1ZXN0ZWRQYXRofWApO1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDMpLmpzb24oeyBlcnJvcjogJ0FjY2VzcyBkZW5pZWQnIH0pO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBmdWxsUGF0aCA9IHBhdGgucmVzb2x2ZShyZXF1ZXN0ZWRQYXRoKTtcblxuICAgICAgLy8gQ2hlY2sgaWYgcGF0aCBleGlzdHMgYW5kIGlzIGEgZGlyZWN0b3J5XG4gICAgICBsZXQgc3RhdHM6IEF3YWl0ZWQ8UmV0dXJuVHlwZTx0eXBlb2YgZnMuc3RhdD4+O1xuICAgICAgdHJ5IHtcbiAgICAgICAgc3RhdHMgPSBhd2FpdCBmcy5zdGF0KGZ1bGxQYXRoKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yICYmICdjb2RlJyBpbiBlcnJvciAmJiBlcnJvci5jb2RlID09PSAnRU5PRU5UJykge1xuICAgICAgICAgIGxvZ2dlci53YXJuKGBkaXJlY3Rvcnkgbm90IGZvdW5kOiAke3JlcXVlc3RlZFBhdGh9YCk7XG4gICAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDA0KS5qc29uKHsgZXJyb3I6ICdEaXJlY3Rvcnkgbm90IGZvdW5kJyB9KTtcbiAgICAgICAgfVxuICAgICAgICAvLyBSZS10aHJvdyBvdGhlciBlcnJvcnMgdG8gYmUgaGFuZGxlZCBieSBvdXRlciBjYXRjaFxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cblxuICAgICAgaWYgKCFzdGF0cy5pc0RpcmVjdG9yeSgpKSB7XG4gICAgICAgIGxvZ2dlci53YXJuKGBwYXRoIGlzIG5vdCBhIGRpcmVjdG9yeTogJHtyZXF1ZXN0ZWRQYXRofWApO1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oeyBlcnJvcjogJ1BhdGggaXMgbm90IGEgZGlyZWN0b3J5JyB9KTtcbiAgICAgIH1cblxuICAgICAgLy8gR2V0IEdpdCBzdGF0dXMgaWYgcmVxdWVzdGVkXG4gICAgICBjb25zdCBnaXRTdGF0dXNTdGFydCA9IERhdGUubm93KCk7XG4gICAgICBjb25zdCBnaXRJbmZvID0gZ2l0RmlsdGVyICE9PSAnbm9uZScgPyBhd2FpdCBnZXRHaXRTdGF0dXMoZnVsbFBhdGgpIDogbnVsbDtcbiAgICAgIGNvbnN0IGdpdFN0YXR1cyA9IGdpdEluZm8/LnN0YXR1cyB8fCBudWxsO1xuICAgICAgY29uc3QgZ2l0UmVwb1Jvb3QgPSBnaXRJbmZvPy5yZXBvUm9vdCB8fCAnJztcbiAgICAgIGlmIChnaXRGaWx0ZXIgIT09ICdub25lJykge1xuICAgICAgICBsb2dnZXIuZGVidWcoYGdpdCBzdGF0dXMgY2hlY2sgdG9vayAke0RhdGUubm93KCkgLSBnaXRTdGF0dXNTdGFydH1tcyBmb3IgJHtyZXF1ZXN0ZWRQYXRofWApO1xuICAgICAgfVxuXG4gICAgICBsZXQgZmlsZXM6IEZpbGVJbmZvW10gPSBbXTtcblxuICAgICAgLy8gSWYgZmlsdGVyaW5nIGJ5IGdpdCBjaGFuZ2VzLCBzaG93IGFsbCBjaGFuZ2VkIGZpbGVzIHJlY3Vyc2l2ZWx5XG4gICAgICBpZiAoZ2l0RmlsdGVyID09PSAnY2hhbmdlZCcgJiYgZ2l0U3RhdHVzKSB7XG4gICAgICAgIC8vIEdldCBhbGwgY2hhbmdlZCBmaWxlcyBmcm9tIGdpdCBzdGF0dXNcbiAgICAgICAgY29uc3QgYWxsQ2hhbmdlZEZpbGVzID0gW1xuICAgICAgICAgIC4uLmdpdFN0YXR1cy5tb2RpZmllZC5tYXAoKGYpID0+ICh7IHBhdGg6IGYsIHN0YXR1czogJ21vZGlmaWVkJyBhcyBjb25zdCB9KSksXG4gICAgICAgICAgLi4uZ2l0U3RhdHVzLmFkZGVkLm1hcCgoZikgPT4gKHsgcGF0aDogZiwgc3RhdHVzOiAnYWRkZWQnIGFzIGNvbnN0IH0pKSxcbiAgICAgICAgICAuLi5naXRTdGF0dXMuZGVsZXRlZC5tYXAoKGYpID0+ICh7IHBhdGg6IGYsIHN0YXR1czogJ2RlbGV0ZWQnIGFzIGNvbnN0IH0pKSxcbiAgICAgICAgICAuLi5naXRTdGF0dXMudW50cmFja2VkLm1hcCgoZikgPT4gKHsgcGF0aDogZiwgc3RhdHVzOiAndW50cmFja2VkJyBhcyBjb25zdCB9KSksXG4gICAgICAgIF07XG5cbiAgICAgICAgLy8gRmlsdGVyIHRvIG9ubHkgZmlsZXMgdW5kZXIgdGhlIGN1cnJlbnQgZGlyZWN0b3J5XG4gICAgICAgIGNvbnN0IGN1cnJlbnREaXJSZWxhdGl2ZVRvUmVwbyA9IHBhdGgucmVsYXRpdmUoZ2l0UmVwb1Jvb3QsIGZ1bGxQYXRoKTtcbiAgICAgICAgY29uc3QgcmVsZXZhbnRGaWxlcyA9IGFsbENoYW5nZWRGaWxlcy5maWx0ZXIoKGYpID0+IHtcbiAgICAgICAgICAvLyBJZiB3ZSdyZSBhdCByZXBvIHJvb3QsIHNob3cgYWxsIGZpbGVzXG4gICAgICAgICAgaWYgKGZ1bGxQYXRoID09PSBnaXRSZXBvUm9vdCkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgLy8gT3RoZXJ3aXNlLCBvbmx5IHNob3cgZmlsZXMgdW5kZXIgY3VycmVudCBkaXJlY3RvcnlcbiAgICAgICAgICByZXR1cm4gZi5wYXRoLnN0YXJ0c1dpdGgoYCR7Y3VycmVudERpclJlbGF0aXZlVG9SZXBvfS9gKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gQ29udmVydCB0byBGaWxlSW5mbyBvYmplY3RzXG4gICAgICAgIGZpbGVzID0gYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICAgICAgcmVsZXZhbnRGaWxlcy5tYXAoYXN5bmMgKGNoYW5nZWRGaWxlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBhYnNvbHV0ZVBhdGggPSBwYXRoLmpvaW4oZ2l0UmVwb1Jvb3QsIGNoYW5nZWRGaWxlLnBhdGgpO1xuXG4gICAgICAgICAgICAvLyBDaGVjayBpZiBmaWxlIGV4aXN0cyAoaXQgbWlnaHQgYmUgZGVsZXRlZClcbiAgICAgICAgICAgIGxldCBmaWxlU3RhdHM6IEF3YWl0ZWQ8UmV0dXJuVHlwZTx0eXBlb2YgZnMuc3RhdD4+IHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICBsZXQgZmlsZVR5cGU6ICdmaWxlJyB8ICdkaXJlY3RvcnknID0gJ2ZpbGUnO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgZmlsZVN0YXRzID0gYXdhaXQgZnMuc3RhdChhYnNvbHV0ZVBhdGgpO1xuICAgICAgICAgICAgICBmaWxlVHlwZSA9IGZpbGVTdGF0cy5pc0RpcmVjdG9yeSgpID8gJ2RpcmVjdG9yeScgOiAnZmlsZSc7XG4gICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgLy8gRmlsZSBtaWdodCBiZSBkZWxldGVkXG4gICAgICAgICAgICAgIGZpbGVTdGF0cyA9IG51bGw7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEdldCByZWxhdGl2ZSBkaXNwbGF5IG5hbWUgKHJlbGF0aXZlIHRvIGN1cnJlbnQgZGlyZWN0b3J5KVxuICAgICAgICAgICAgY29uc3QgcmVsYXRpdmVUb0N1cnJlbnREaXIgPSBwYXRoLnJlbGF0aXZlKGZ1bGxQYXRoLCBhYnNvbHV0ZVBhdGgpO1xuXG4gICAgICAgICAgICBjb25zdCBmaWxlSW5mbzogRmlsZUluZm8gPSB7XG4gICAgICAgICAgICAgIG5hbWU6IHJlbGF0aXZlVG9DdXJyZW50RGlyLFxuICAgICAgICAgICAgICBwYXRoOiBwYXRoLnJlbGF0aXZlKHByb2Nlc3MuY3dkKCksIGFic29sdXRlUGF0aCksXG4gICAgICAgICAgICAgIHR5cGU6IGZpbGVUeXBlLFxuICAgICAgICAgICAgICBzaXplOiBmaWxlU3RhdHM/LnNpemUgfHwgMCxcbiAgICAgICAgICAgICAgbW9kaWZpZWQ6IGZpbGVTdGF0cz8ubXRpbWUudG9JU09TdHJpbmcoKSB8fCBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgICAgIHBlcm1pc3Npb25zOiBmaWxlU3RhdHM/Lm1vZGU/LnRvU3RyaW5nKDgpLnNsaWNlKC0zKSB8fCAnMDAwJyxcbiAgICAgICAgICAgICAgaXNHaXRUcmFja2VkOiB0cnVlLFxuICAgICAgICAgICAgICBnaXRTdGF0dXM6IGNoYW5nZWRGaWxlLnN0YXR1cyxcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHJldHVybiBmaWxlSW5mbztcbiAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gTm9ybWFsIGRpcmVjdG9yeSBsaXN0aW5nXG4gICAgICAgIGNvbnN0IGVudHJpZXMgPSBhd2FpdCBmcy5yZWFkZGlyKGZ1bGxQYXRoLCB7IHdpdGhGaWxlVHlwZXM6IHRydWUgfSk7XG5cbiAgICAgICAgZmlsZXMgPSBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgICAgICBlbnRyaWVzXG4gICAgICAgICAgICAuZmlsdGVyKChlbnRyeSkgPT4gc2hvd0hpZGRlbiB8fCAhZW50cnkubmFtZS5zdGFydHNXaXRoKCcuJykpXG4gICAgICAgICAgICAubWFwKGFzeW5jIChlbnRyeSkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBlbnRyeVBhdGggPSBwYXRoLmpvaW4oZnVsbFBhdGgsIGVudHJ5Lm5hbWUpO1xuXG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8gVXNlIGZzLnN0YXQoKSB3aGljaCBmb2xsb3dzIHN5bWxpbmtzLCBpbnN0ZWFkIG9mIGVudHJ5LmlzRGlyZWN0b3J5KClcbiAgICAgICAgICAgICAgICBjb25zdCBzdGF0cyA9IGF3YWl0IGZzLnN0YXQoZW50cnlQYXRoKTtcbiAgICAgICAgICAgICAgICBjb25zdCByZWxhdGl2ZVBhdGggPSBwYXRoLnJlbGF0aXZlKHByb2Nlc3MuY3dkKCksIGVudHJ5UGF0aCk7XG5cbiAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiB0aGlzIGlzIGEgc3ltbGlua1xuICAgICAgICAgICAgICAgIGNvbnN0IGlzU3ltbGluayA9IGVudHJ5LmlzU3ltYm9saWNMaW5rKCk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBmaWxlSW5mbzogRmlsZUluZm8gPSB7XG4gICAgICAgICAgICAgICAgICBuYW1lOiBlbnRyeS5uYW1lLFxuICAgICAgICAgICAgICAgICAgcGF0aDogcmVsYXRpdmVQYXRoLFxuICAgICAgICAgICAgICAgICAgdHlwZTogc3RhdHMuaXNEaXJlY3RvcnkoKSA/ICdkaXJlY3RvcnknIDogJ2ZpbGUnLFxuICAgICAgICAgICAgICAgICAgc2l6ZTogc3RhdHMuc2l6ZSxcbiAgICAgICAgICAgICAgICAgIG1vZGlmaWVkOiBzdGF0cy5tdGltZS50b0lTT1N0cmluZygpLFxuICAgICAgICAgICAgICAgICAgcGVybWlzc2lvbnM6IHN0YXRzLm1vZGUudG9TdHJpbmcoOCkuc2xpY2UoLTMpLFxuICAgICAgICAgICAgICAgICAgaXNHaXRUcmFja2VkOiBnaXRTdGF0dXM/LmlzR2l0UmVwbyB8fCBmYWxzZSxcbiAgICAgICAgICAgICAgICAgIGdpdFN0YXR1czogZ2V0RmlsZUdpdFN0YXR1cyhlbnRyeVBhdGgsIGdpdFN0YXR1cywgZ2l0UmVwb1Jvb3QpLFxuICAgICAgICAgICAgICAgICAgaXNTeW1saW5rLFxuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gZmlsZUluZm87XG4gICAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgLy8gSGFuZGxlIGJyb2tlbiBzeW1saW5rcyBvciBwZXJtaXNzaW9uIGVycm9yc1xuICAgICAgICAgICAgICAgIGxvZ2dlci53YXJuKGBmYWlsZWQgdG8gc3RhdCAke2VudHJ5UGF0aH06YCwgZXJyb3IpO1xuXG4gICAgICAgICAgICAgICAgLy8gRm9yIGJyb2tlbiBzeW1saW5rcywgd2UnbGwgc3RpbGwgc2hvdyB0aGVtIGJ1dCBhcyBmaWxlc1xuICAgICAgICAgICAgICAgIGNvbnN0IGZpbGVJbmZvOiBGaWxlSW5mbyA9IHtcbiAgICAgICAgICAgICAgICAgIG5hbWU6IGVudHJ5Lm5hbWUsXG4gICAgICAgICAgICAgICAgICBwYXRoOiBwYXRoLnJlbGF0aXZlKHByb2Nlc3MuY3dkKCksIGVudHJ5UGF0aCksXG4gICAgICAgICAgICAgICAgICB0eXBlOiAnZmlsZScsXG4gICAgICAgICAgICAgICAgICBzaXplOiAwLFxuICAgICAgICAgICAgICAgICAgbW9kaWZpZWQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICAgICAgICAgIHBlcm1pc3Npb25zOiAnMDAwJyxcbiAgICAgICAgICAgICAgICAgIGlzR2l0VHJhY2tlZDogZmFsc2UsXG4gICAgICAgICAgICAgICAgICBnaXRTdGF0dXM6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZpbGVJbmZvO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICAvLyBObyBhZGRpdGlvbmFsIGZpbHRlcmluZyBuZWVkZWQgaWYgd2UgYWxyZWFkeSBmaWx0ZXJlZCBieSBnaXQgc3RhdHVzIGFib3ZlXG4gICAgICBjb25zdCBmaWx0ZXJlZEZpbGVzID0gZmlsZXM7XG5cbiAgICAgIC8vIFNvcnQ6IGRpcmVjdG9yaWVzIGZpcnN0LCB0aGVuIGJ5IG5hbWVcbiAgICAgIGZpbHRlcmVkRmlsZXMuc29ydCgoYSwgYikgPT4ge1xuICAgICAgICBpZiAoYS50eXBlICE9PSBiLnR5cGUpIHtcbiAgICAgICAgICByZXR1cm4gYS50eXBlID09PSAnZGlyZWN0b3J5JyA/IC0xIDogMTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5uYW1lKTtcbiAgICAgIH0pO1xuXG4gICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgIGBkaXJlY3RvcnkgYnJvd3NlZCBzdWNjZXNzZnVsbHk6ICR7cmVxdWVzdGVkUGF0aH0gKCR7ZmlsdGVyZWRGaWxlcy5sZW5ndGh9IGl0ZW1zKWBcbiAgICAgICk7XG5cbiAgICAgIHJlcy5qc29uKHtcbiAgICAgICAgcGF0aDogcmVxdWVzdGVkUGF0aCxcbiAgICAgICAgZnVsbFBhdGgsXG4gICAgICAgIGdpdFN0YXR1cyxcbiAgICAgICAgZmlsZXM6IGZpbHRlcmVkRmlsZXMsXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKGBmYWlsZWQgdG8gYnJvd3NlIGRpcmVjdG9yeSAke3JlcS5xdWVyeS5wYXRofTpgLCBlcnJvcik7XG4gICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7IGVycm9yOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgfVxuICB9KTtcblxuICAvLyBHZXQgZmlsZSBwcmV2aWV3XG4gIHJvdXRlci5nZXQoJy9mcy9wcmV2aWV3JywgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSkgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXF1ZXN0ZWRQYXRoID0gcmVxLnF1ZXJ5LnBhdGggYXMgc3RyaW5nO1xuICAgICAgaWYgKCFyZXF1ZXN0ZWRQYXRoKSB7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7IGVycm9yOiAnUGF0aCBpcyByZXF1aXJlZCcgfSk7XG4gICAgICB9XG5cbiAgICAgIGxvZ2dlci5kZWJ1ZyhgcHJldmlld2luZyBmaWxlOiAke3JlcXVlc3RlZFBhdGh9YCk7XG5cbiAgICAgIC8vIFNlY3VyaXR5IGNoZWNrXG4gICAgICBpZiAoIWlzUGF0aFNhZmUocmVxdWVzdGVkUGF0aCwgcHJvY2Vzcy5jd2QoKSkpIHtcbiAgICAgICAgbG9nZ2VyLndhcm4oYGFjY2VzcyBkZW5pZWQgZm9yIGZpbGUgcHJldmlldzogJHtyZXF1ZXN0ZWRQYXRofWApO1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDMpLmpzb24oeyBlcnJvcjogJ0FjY2VzcyBkZW5pZWQnIH0pO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBmdWxsUGF0aCA9IHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCByZXF1ZXN0ZWRQYXRoKTtcbiAgICAgIGNvbnN0IHN0YXRzID0gYXdhaXQgZnMuc3RhdChmdWxsUGF0aCk7XG5cbiAgICAgIGlmIChzdGF0cy5pc0RpcmVjdG9yeSgpKSB7XG4gICAgICAgIGxvZ2dlci53YXJuKGBjYW5ub3QgcHJldmlldyBkaXJlY3Rvcnk6ICR7cmVxdWVzdGVkUGF0aH1gKTtcbiAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAwKS5qc29uKHsgZXJyb3I6ICdDYW5ub3QgcHJldmlldyBkaXJlY3RvcmllcycgfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIERldGVybWluZSBmaWxlIHR5cGVcbiAgICAgIGNvbnN0IG1pbWVUeXBlID0gbWltZS5sb29rdXAoZnVsbFBhdGgpIHx8ICdhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW0nO1xuICAgICAgY29uc3QgaXNUZXh0ID1cbiAgICAgICAgbWltZVR5cGUuc3RhcnRzV2l0aCgndGV4dC8nKSB8fFxuICAgICAgICBtaW1lVHlwZSA9PT0gJ2FwcGxpY2F0aW9uL2pzb24nIHx8XG4gICAgICAgIG1pbWVUeXBlID09PSAnYXBwbGljYXRpb24vamF2YXNjcmlwdCcgfHxcbiAgICAgICAgbWltZVR5cGUgPT09ICdhcHBsaWNhdGlvbi90eXBlc2NyaXB0JyB8fFxuICAgICAgICBtaW1lVHlwZSA9PT0gJ2FwcGxpY2F0aW9uL3htbCc7XG4gICAgICBjb25zdCBpc0ltYWdlID0gbWltZVR5cGUuc3RhcnRzV2l0aCgnaW1hZ2UvJyk7XG5cbiAgICAgIGlmIChpc0ltYWdlKSB7XG4gICAgICAgIC8vIEZvciBpbWFnZXMsIHJldHVybiBVUkwgdG8gZmV0Y2ggdGhlIGltYWdlXG4gICAgICAgIGxvZ2dlci5sb2coXG4gICAgICAgICAgY2hhbGsuZ3JlZW4oYGltYWdlIHByZXZpZXcgZ2VuZXJhdGVkOiAke3JlcXVlc3RlZFBhdGh9ICgke2Zvcm1hdEJ5dGVzKHN0YXRzLnNpemUpfSlgKVxuICAgICAgICApO1xuICAgICAgICByZXMuanNvbih7XG4gICAgICAgICAgdHlwZTogJ2ltYWdlJyxcbiAgICAgICAgICBtaW1lVHlwZSxcbiAgICAgICAgICB1cmw6IGAvYXBpL2ZzL3Jhdz9wYXRoPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHJlcXVlc3RlZFBhdGgpfWAsXG4gICAgICAgICAgc2l6ZTogc3RhdHMuc2l6ZSxcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2UgaWYgKGlzVGV4dCB8fCBzdGF0cy5zaXplIDwgMTAyNCAqIDEwMjQpIHtcbiAgICAgICAgLy8gVGV4dCBvciBzbWFsbCBmaWxlcyAoPCAxTUIpXG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBmcy5yZWFkRmlsZShmdWxsUGF0aCwgJ3V0Zi04Jyk7XG4gICAgICAgIGNvbnN0IGxhbmd1YWdlID0gZ2V0TGFuZ3VhZ2VGcm9tUGF0aChmdWxsUGF0aCk7XG5cbiAgICAgICAgbG9nZ2VyLmxvZyhcbiAgICAgICAgICBjaGFsay5ncmVlbihcbiAgICAgICAgICAgIGB0ZXh0IGZpbGUgcHJldmlldyBnZW5lcmF0ZWQ6ICR7cmVxdWVzdGVkUGF0aH0gKCR7Zm9ybWF0Qnl0ZXMoc3RhdHMuc2l6ZSl9LCAke2xhbmd1YWdlfSlgXG4gICAgICAgICAgKVxuICAgICAgICApO1xuXG4gICAgICAgIHJlcy5qc29uKHtcbiAgICAgICAgICB0eXBlOiAndGV4dCcsXG4gICAgICAgICAgY29udGVudCxcbiAgICAgICAgICBsYW5ndWFnZSxcbiAgICAgICAgICBtaW1lVHlwZSxcbiAgICAgICAgICBzaXplOiBzdGF0cy5zaXplLFxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIEJpbmFyeSBvciBsYXJnZSBmaWxlc1xuICAgICAgICBsb2dnZXIubG9nKFxuICAgICAgICAgIGBiaW5hcnkgZmlsZSBwcmV2aWV3IG1ldGFkYXRhIHJldHVybmVkOiAke3JlcXVlc3RlZFBhdGh9ICgke2Zvcm1hdEJ5dGVzKHN0YXRzLnNpemUpfSlgXG4gICAgICAgICk7XG4gICAgICAgIHJlcy5qc29uKHtcbiAgICAgICAgICB0eXBlOiAnYmluYXJ5JyxcbiAgICAgICAgICBtaW1lVHlwZSxcbiAgICAgICAgICBzaXplOiBzdGF0cy5zaXplLFxuICAgICAgICAgIGh1bWFuU2l6ZTogZm9ybWF0Qnl0ZXMoc3RhdHMuc2l6ZSksXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoYGZhaWxlZCB0byBwcmV2aWV3IGZpbGUgJHtyZXEucXVlcnkucGF0aH06YCwgZXJyb3IpO1xuICAgICAgcmVzLnN0YXR1cyg1MDApLmpzb24oeyBlcnJvcjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gU2VydmUgcmF3IGZpbGUgY29udGVudFxuICByb3V0ZXIuZ2V0KCcvZnMvcmF3JywgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSkgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXF1ZXN0ZWRQYXRoID0gcmVxLnF1ZXJ5LnBhdGggYXMgc3RyaW5nO1xuICAgICAgaWYgKCFyZXF1ZXN0ZWRQYXRoKSB7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7IGVycm9yOiAnUGF0aCBpcyByZXF1aXJlZCcgfSk7XG4gICAgICB9XG5cbiAgICAgIGxvZ2dlci5kZWJ1Zyhgc2VydmluZyByYXcgZmlsZTogJHtyZXF1ZXN0ZWRQYXRofWApO1xuXG4gICAgICAvLyBTZWN1cml0eSBjaGVja1xuICAgICAgaWYgKCFpc1BhdGhTYWZlKHJlcXVlc3RlZFBhdGgsIHByb2Nlc3MuY3dkKCkpKSB7XG4gICAgICAgIGxvZ2dlci53YXJuKGBhY2Nlc3MgZGVuaWVkIGZvciByYXcgZmlsZTogJHtyZXF1ZXN0ZWRQYXRofWApO1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDMpLmpzb24oeyBlcnJvcjogJ0FjY2VzcyBkZW5pZWQnIH0pO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBmdWxsUGF0aCA9IHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCByZXF1ZXN0ZWRQYXRoKTtcblxuICAgICAgLy8gQ2hlY2sgaWYgZmlsZSBleGlzdHNcbiAgICAgIGlmICghc3RhdFN5bmMoZnVsbFBhdGgpLmlzRmlsZSgpKSB7XG4gICAgICAgIGxvZ2dlci53YXJuKGBmaWxlIG5vdCBmb3VuZCBmb3IgcmF3IGFjY2VzczogJHtyZXF1ZXN0ZWRQYXRofWApO1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDQpLmpzb24oeyBlcnJvcjogJ0ZpbGUgbm90IGZvdW5kJyB9KTtcbiAgICAgIH1cblxuICAgICAgLy8gU2V0IGFwcHJvcHJpYXRlIGNvbnRlbnQgdHlwZVxuICAgICAgY29uc3QgbWltZVR5cGUgPSBtaW1lLmxvb2t1cChmdWxsUGF0aCkgfHwgJ2FwcGxpY2F0aW9uL29jdGV0LXN0cmVhbSc7XG4gICAgICByZXMuc2V0SGVhZGVyKCdDb250ZW50LVR5cGUnLCBtaW1lVHlwZSk7XG5cbiAgICAgIC8vIFN0cmVhbSB0aGUgZmlsZVxuICAgICAgY29uc3Qgc3RyZWFtID0gY3JlYXRlUmVhZFN0cmVhbShmdWxsUGF0aCk7XG4gICAgICBzdHJlYW0ucGlwZShyZXMpO1xuXG4gICAgICBzdHJlYW0ub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgbG9nZ2VyLmxvZyhjaGFsay5ncmVlbihgcmF3IGZpbGUgc2VydmVkOiAke3JlcXVlc3RlZFBhdGh9YCkpO1xuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcihgZmFpbGVkIHRvIHNlcnZlIHJhdyBmaWxlICR7cmVxLnF1ZXJ5LnBhdGh9OmAsIGVycm9yKTtcbiAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHsgZXJyb3I6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKSB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIEdldCBmaWxlIGNvbnRlbnQgKHRleHQgZmlsZXMgb25seSlcbiAgcm91dGVyLmdldCgnL2ZzL2NvbnRlbnQnLCBhc3luYyAocmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlcXVlc3RlZFBhdGggPSByZXEucXVlcnkucGF0aCBhcyBzdHJpbmc7XG4gICAgICBpZiAoIXJlcXVlc3RlZFBhdGgpIHtcbiAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAwKS5qc29uKHsgZXJyb3I6ICdQYXRoIGlzIHJlcXVpcmVkJyB9KTtcbiAgICAgIH1cblxuICAgICAgbG9nZ2VyLmRlYnVnKGBnZXR0aW5nIGZpbGUgY29udGVudDogJHtyZXF1ZXN0ZWRQYXRofWApO1xuXG4gICAgICAvLyBTZWN1cml0eSBjaGVja1xuICAgICAgaWYgKCFpc1BhdGhTYWZlKHJlcXVlc3RlZFBhdGgsIHByb2Nlc3MuY3dkKCkpKSB7XG4gICAgICAgIGxvZ2dlci53YXJuKGBhY2Nlc3MgZGVuaWVkIGZvciBmaWxlIGNvbnRlbnQ6ICR7cmVxdWVzdGVkUGF0aH1gKTtcbiAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAzKS5qc29uKHsgZXJyb3I6ICdBY2Nlc3MgZGVuaWVkJyB9KTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZnVsbFBhdGggPSBwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgcmVxdWVzdGVkUGF0aCk7XG4gICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgZnMucmVhZEZpbGUoZnVsbFBhdGgsICd1dGYtOCcpO1xuXG4gICAgICBsb2dnZXIubG9nKGNoYWxrLmdyZWVuKGBmaWxlIGNvbnRlbnQgcmV0cmlldmVkOiAke3JlcXVlc3RlZFBhdGh9YCkpO1xuXG4gICAgICByZXMuanNvbih7XG4gICAgICAgIHBhdGg6IHJlcXVlc3RlZFBhdGgsXG4gICAgICAgIGNvbnRlbnQsXG4gICAgICAgIGxhbmd1YWdlOiBnZXRMYW5ndWFnZUZyb21QYXRoKGZ1bGxQYXRoKSxcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoYGZhaWxlZCB0byBnZXQgZmlsZSBjb250ZW50ICR7cmVxLnF1ZXJ5LnBhdGh9OmAsIGVycm9yKTtcbiAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHsgZXJyb3I6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKSB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIEdldCBHaXQgZGlmZiBmb3IgYSBmaWxlXG4gIHJvdXRlci5nZXQoJy9mcy9kaWZmJywgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSkgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXF1ZXN0ZWRQYXRoID0gcmVxLnF1ZXJ5LnBhdGggYXMgc3RyaW5nO1xuICAgICAgaWYgKCFyZXF1ZXN0ZWRQYXRoKSB7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7IGVycm9yOiAnUGF0aCBpcyByZXF1aXJlZCcgfSk7XG4gICAgICB9XG5cbiAgICAgIGxvZ2dlci5kZWJ1ZyhgZ2V0dGluZyBnaXQgZGlmZjogJHtyZXF1ZXN0ZWRQYXRofWApO1xuXG4gICAgICAvLyBTZWN1cml0eSBjaGVja1xuICAgICAgaWYgKCFpc1BhdGhTYWZlKHJlcXVlc3RlZFBhdGgsIHByb2Nlc3MuY3dkKCkpKSB7XG4gICAgICAgIGxvZ2dlci53YXJuKGBhY2Nlc3MgZGVuaWVkIGZvciBnaXQgZGlmZjogJHtyZXF1ZXN0ZWRQYXRofWApO1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDMpLmpzb24oeyBlcnJvcjogJ0FjY2VzcyBkZW5pZWQnIH0pO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBmdWxsUGF0aCA9IHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCByZXF1ZXN0ZWRQYXRoKTtcbiAgICAgIGNvbnN0IHJlbGF0aXZlUGF0aCA9IHBhdGgucmVsYXRpdmUocHJvY2Vzcy5jd2QoKSwgZnVsbFBhdGgpO1xuXG4gICAgICAvLyBHZXQgZ2l0IGRpZmZcbiAgICAgIGNvbnN0IGRpZmZTdGFydCA9IERhdGUubm93KCk7XG4gICAgICBjb25zdCB7IHN0ZG91dDogZGlmZiB9ID0gYXdhaXQgZXhlY0FzeW5jKGBnaXQgZGlmZiBIRUFEIC0tIFwiJHtyZWxhdGl2ZVBhdGh9XCJgLCB7XG4gICAgICAgIGN3ZDogcHJvY2Vzcy5jd2QoKSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBkaWZmVGltZSA9IERhdGUubm93KCkgLSBkaWZmU3RhcnQ7XG4gICAgICBpZiAoZGlmZlRpbWUgPiAxMDAwKSB7XG4gICAgICAgIGxvZ2dlci53YXJuKGBzbG93IGdpdCBkaWZmIG9wZXJhdGlvbjogJHtyZXF1ZXN0ZWRQYXRofSB0b29rICR7ZGlmZlRpbWV9bXNgKTtcbiAgICAgIH1cblxuICAgICAgbG9nZ2VyLmxvZyhcbiAgICAgICAgY2hhbGsuZ3JlZW4oXG4gICAgICAgICAgYGdpdCBkaWZmIHJldHJpZXZlZDogJHtyZXF1ZXN0ZWRQYXRofSAoJHtkaWZmLmxlbmd0aCA+IDAgPyAnaGFzIGNoYW5nZXMnIDogJ25vIGNoYW5nZXMnfSlgXG4gICAgICAgIClcbiAgICAgICk7XG5cbiAgICAgIHJlcy5qc29uKHtcbiAgICAgICAgcGF0aDogcmVxdWVzdGVkUGF0aCxcbiAgICAgICAgZGlmZixcbiAgICAgICAgaGFzRGlmZjogZGlmZi5sZW5ndGggPiAwLFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcihgZmFpbGVkIHRvIGdldCBnaXQgZGlmZiBmb3IgJHtyZXEucXVlcnkucGF0aH06YCwgZXJyb3IpO1xuICAgICAgcmVzLnN0YXR1cyg1MDApLmpzb24oeyBlcnJvcjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gR2V0IGZpbGUgY29udGVudCBmb3IgZGlmZiB2aWV3IChjdXJyZW50IGFuZCBIRUFEIHZlcnNpb25zKVxuICByb3V0ZXIuZ2V0KCcvZnMvZGlmZi1jb250ZW50JywgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSkgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXF1ZXN0ZWRQYXRoID0gcmVxLnF1ZXJ5LnBhdGggYXMgc3RyaW5nO1xuICAgICAgaWYgKCFyZXF1ZXN0ZWRQYXRoKSB7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7IGVycm9yOiAnUGF0aCBpcyByZXF1aXJlZCcgfSk7XG4gICAgICB9XG5cbiAgICAgIGxvZ2dlci5kZWJ1ZyhgZ2V0dGluZyBkaWZmIGNvbnRlbnQ6ICR7cmVxdWVzdGVkUGF0aH1gKTtcblxuICAgICAgLy8gU2VjdXJpdHkgY2hlY2tcbiAgICAgIGlmICghaXNQYXRoU2FmZShyZXF1ZXN0ZWRQYXRoLCBwcm9jZXNzLmN3ZCgpKSkge1xuICAgICAgICBsb2dnZXIud2FybihgYWNjZXNzIGRlbmllZCBmb3IgZGlmZiBjb250ZW50OiAke3JlcXVlc3RlZFBhdGh9YCk7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMykuanNvbih7IGVycm9yOiAnQWNjZXNzIGRlbmllZCcgfSk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGZ1bGxQYXRoID0gcGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksIHJlcXVlc3RlZFBhdGgpO1xuICAgICAgY29uc3QgcmVsYXRpdmVQYXRoID0gcGF0aC5yZWxhdGl2ZShwcm9jZXNzLmN3ZCgpLCBmdWxsUGF0aCk7XG5cbiAgICAgIGxvZ2dlci5kZWJ1ZyhgR2V0dGluZyBkaWZmIGNvbnRlbnQgZm9yOiAke3JlcXVlc3RlZFBhdGh9YCk7XG4gICAgICBsb2dnZXIuZGVidWcoYEZ1bGwgcGF0aDogJHtmdWxsUGF0aH1gKTtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhgQ1dEOiAke3Byb2Nlc3MuY3dkKCl9YCk7XG5cbiAgICAgIC8vIEdldCBjdXJyZW50IGZpbGUgY29udGVudFxuICAgICAgY29uc3QgY3VycmVudENvbnRlbnQgPSBhd2FpdCBmcy5yZWFkRmlsZShmdWxsUGF0aCwgJ3V0Zi04Jyk7XG4gICAgICBsb2dnZXIuZGVidWcoYEN1cnJlbnQgY29udGVudCBsZW5ndGg6ICR7Y3VycmVudENvbnRlbnQubGVuZ3RofWApO1xuXG4gICAgICAvLyBHZXQgSEVBRCB2ZXJzaW9uIGNvbnRlbnRcbiAgICAgIGxldCBvcmlnaW5hbENvbnRlbnQgPSAnJzsgLy8gRGVmYXVsdCB0byBlbXB0eSBzdHJpbmcgZm9yIG5ldyBmaWxlc1xuICAgICAgdHJ5IHtcbiAgICAgICAgLy8gVXNlIC4vIHByZWZpeCBhcyBnaXQgc3VnZ2VzdHMgZm9yIHBhdGhzIHJlbGF0aXZlIHRvIGN1cnJlbnQgZGlyZWN0b3J5XG4gICAgICAgIGNvbnN0IGdpdFBhdGggPSBgLi8ke3JlbGF0aXZlUGF0aH1gO1xuICAgICAgICBsb2dnZXIuZGVidWcoYEdldHRpbmcgSEVBRCB2ZXJzaW9uOiBnaXQgc2hvdyBIRUFEOlwiJHtnaXRQYXRofVwiYCk7XG5cbiAgICAgICAgY29uc3QgeyBzdGRvdXQgfSA9IGF3YWl0IGV4ZWNBc3luYyhgZ2l0IHNob3cgSEVBRDpcIiR7Z2l0UGF0aH1cImAsIHtcbiAgICAgICAgICBjd2Q6IHByb2Nlc3MuY3dkKCksXG4gICAgICAgIH0pO1xuICAgICAgICBvcmlnaW5hbENvbnRlbnQgPSBzdGRvdXQ7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhgR290IEhFQUQgdmVyc2lvbiBmb3IgJHtnaXRQYXRofSwgbGVuZ3RoOiAke29yaWdpbmFsQ29udGVudC5sZW5ndGh9YCk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAvLyBGaWxlIG1pZ2h0IGJlIG5ldyAobm90IGluIEhFQUQpLCB1c2UgZW1wdHkgc3RyaW5nXG4gICAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yICYmIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ2RvZXMgbm90IGV4aXN0JykpIHtcbiAgICAgICAgICBvcmlnaW5hbENvbnRlbnQgPSAnJztcbiAgICAgICAgICBsb2dnZXIuZGVidWcoYEZpbGUgJHtyZXF1ZXN0ZWRQYXRofSBkb2VzIG5vdCBleGlzdCBpbiBIRUFEIChuZXcgZmlsZSlgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBGb3Igb3RoZXIgZXJyb3JzLCBsb2cgdGhlIGZ1bGwgZXJyb3JcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoYEZhaWxlZCB0byBnZXQgSEVBRCB2ZXJzaW9uIG9mIC4vJHtyZWxhdGl2ZVBhdGh9OmAsIGVycm9yKTtcbiAgICAgICAgICAvLyBDaGVjayBpZiBpdCdzIGEgc3RkZXJyIG1lc3NhZ2VcbiAgICAgICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBFcnJvciAmJiAnc3RkZXJyJyBpbiBlcnJvcikge1xuICAgICAgICAgICAgY29uc3QgZXhlY0Vycm9yID0gZXJyb3IgYXMgRXJyb3IgJiB7IHN0ZGVycj86IHN0cmluZyB9O1xuICAgICAgICAgICAgaWYgKGV4ZWNFcnJvci5zdGRlcnIpIHtcbiAgICAgICAgICAgICAgbG9nZ2VyLmVycm9yKGBHaXQgc3RkZXJyOiAke2V4ZWNFcnJvci5zdGRlcnJ9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEZvciBub24tZ2l0IHJlcG9zLCBzaG93IG5vIGRpZmZcbiAgICAgICAgICBvcmlnaW5hbENvbnRlbnQgPSBjdXJyZW50Q29udGVudDtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBsb2dnZXIubG9nKGNoYWxrLmdyZWVuKGBkaWZmIGNvbnRlbnQgcmV0cmlldmVkOiAke3JlcXVlc3RlZFBhdGh9YCkpO1xuXG4gICAgICByZXMuanNvbih7XG4gICAgICAgIHBhdGg6IHJlcXVlc3RlZFBhdGgsXG4gICAgICAgIG9yaWdpbmFsQ29udGVudCxcbiAgICAgICAgbW9kaWZpZWRDb250ZW50OiBjdXJyZW50Q29udGVudCxcbiAgICAgICAgbGFuZ3VhZ2U6IGdldExhbmd1YWdlRnJvbVBhdGgoZnVsbFBhdGgpLFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcihgZmFpbGVkIHRvIGdldCBkaWZmIGNvbnRlbnQgZm9yICR7cmVxLnF1ZXJ5LnBhdGh9OmAsIGVycm9yKTtcbiAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHsgZXJyb3I6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKSB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIENyZWF0ZSBkaXJlY3RvcnlcbiAgcm91dGVyLnBvc3QoJy9mcy9ta2RpcicsIGFzeW5jIChyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgeyBwYXRoOiBkaXJQYXRoLCBuYW1lIH0gPSByZXEuYm9keTtcblxuICAgICAgaWYgKCFkaXJQYXRoIHx8ICFuYW1lKSB7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7IGVycm9yOiAnUGF0aCBhbmQgbmFtZSBhcmUgcmVxdWlyZWQnIH0pO1xuICAgICAgfVxuXG4gICAgICBsb2dnZXIubG9nKGBjcmVhdGluZyBkaXJlY3Rvcnk6ICR7bmFtZX0gaW4gJHtkaXJQYXRofWApO1xuXG4gICAgICAvLyBWYWxpZGF0ZSBuYW1lIChubyBzbGFzaGVzLCBubyBkb3RzIGF0IHN0YXJ0KVxuICAgICAgaWYgKG5hbWUuaW5jbHVkZXMoJy8nKSB8fCBuYW1lLmluY2x1ZGVzKCdcXFxcJykgfHwgbmFtZS5zdGFydHNXaXRoKCcuJykpIHtcbiAgICAgICAgbG9nZ2VyLndhcm4oYGludmFsaWQgZGlyZWN0b3J5IG5hbWUgYXR0ZW1wdGVkOiAke25hbWV9YCk7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7IGVycm9yOiAnSW52YWxpZCBkaXJlY3RvcnkgbmFtZScgfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIFNlY3VyaXR5IGNoZWNrXG4gICAgICBpZiAoIWlzUGF0aFNhZmUoZGlyUGF0aCwgcHJvY2Vzcy5jd2QoKSkpIHtcbiAgICAgICAgbG9nZ2VyLndhcm4oYGFjY2VzcyBkZW5pZWQgZm9yIG1rZGlyOiAke2RpclBhdGh9LyR7bmFtZX1gKTtcbiAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAzKS5qc29uKHsgZXJyb3I6ICdBY2Nlc3MgZGVuaWVkJyB9KTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZnVsbFBhdGggPSBwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgZGlyUGF0aCwgbmFtZSk7XG5cbiAgICAgIC8vIENyZWF0ZSBkaXJlY3RvcnlcbiAgICAgIGF3YWl0IGZzLm1rZGlyKGZ1bGxQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblxuICAgICAgbG9nZ2VyLmxvZyhjaGFsay5ncmVlbihgZGlyZWN0b3J5IGNyZWF0ZWQ6ICR7cGF0aC5yZWxhdGl2ZShwcm9jZXNzLmN3ZCgpLCBmdWxsUGF0aCl9YCkpO1xuXG4gICAgICByZXMuanNvbih7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHBhdGg6IHBhdGgucmVsYXRpdmUocHJvY2Vzcy5jd2QoKSwgZnVsbFBhdGgpLFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcihgZmFpbGVkIHRvIGNyZWF0ZSBkaXJlY3RvcnkgJHtyZXEuYm9keS5wYXRofS8ke3JlcS5ib2R5Lm5hbWV9OmAsIGVycm9yKTtcbiAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHsgZXJyb3I6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKSB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIFBhdGggY29tcGxldGlvbnMgZW5kcG9pbnQgZm9yIGF1dG9jb21wbGV0ZVxuICByb3V0ZXIuZ2V0KCcvZnMvY29tcGxldGlvbnMnLCBhc3luYyAocmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IG9yaWdpbmFsUGF0aCA9IChyZXEucXVlcnkucGF0aCBhcyBzdHJpbmcpIHx8ICcnO1xuICAgICAgbGV0IHBhcnRpYWxQYXRoID0gb3JpZ2luYWxQYXRoO1xuXG4gICAgICAvLyBIYW5kbGUgdGlsZGUgZXhwYW5zaW9uIGZvciBob21lIGRpcmVjdG9yeVxuICAgICAgcGFydGlhbFBhdGggPSBleHBhbmRUaWxkZVBhdGgocGFydGlhbFBhdGgpO1xuXG4gICAgICAvLyBTZXBhcmF0ZSBkaXJlY3RvcnkgYW5kIHBhcnRpYWwgbmFtZVxuICAgICAgbGV0IGRpclBhdGg6IHN0cmluZztcbiAgICAgIGxldCBwYXJ0aWFsTmFtZTogc3RyaW5nO1xuXG4gICAgICBpZiAocGFydGlhbFBhdGguZW5kc1dpdGgoJy8nKSkge1xuICAgICAgICAvLyBJZiBwYXRoIGVuZHMgd2l0aCBzbGFzaCwgbGlzdCBjb250ZW50cyBvZiB0aGF0IGRpcmVjdG9yeVxuICAgICAgICBkaXJQYXRoID0gcGFydGlhbFBhdGg7XG4gICAgICAgIHBhcnRpYWxOYW1lID0gJyc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBPdGhlcndpc2UsIGdldCB0aGUgZGlyZWN0b3J5IGFuZCBwYXJ0aWFsIGZpbGVuYW1lXG4gICAgICAgIGRpclBhdGggPSBwYXRoLmRpcm5hbWUocGFydGlhbFBhdGgpO1xuICAgICAgICBwYXJ0aWFsTmFtZSA9IHBhdGguYmFzZW5hbWUocGFydGlhbFBhdGgpO1xuICAgICAgfVxuXG4gICAgICAvLyBSZXNvbHZlIHRoZSBkaXJlY3RvcnkgcGF0aFxuICAgICAgY29uc3QgZnVsbERpclBhdGggPSBwYXRoLnJlc29sdmUoZGlyUGF0aCk7XG5cbiAgICAgIC8vIFNlY3VyaXR5IGNoZWNrXG4gICAgICBpZiAoIWlzUGF0aFNhZmUoZnVsbERpclBhdGgsICcvJykpIHtcbiAgICAgICAgbG9nZ2VyLndhcm4oYGFjY2VzcyBkZW5pZWQgZm9yIHBhdGggY29tcGxldGlvbnM6ICR7ZnVsbERpclBhdGh9YCk7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMykuanNvbih7IGVycm9yOiAnQWNjZXNzIGRlbmllZCcgfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIENoZWNrIGlmIGRpcmVjdG9yeSBleGlzdHNcbiAgICAgIGxldCBkaXJTdGF0czogQXdhaXRlZDxSZXR1cm5UeXBlPHR5cGVvZiBmcy5zdGF0Pj47XG4gICAgICB0cnkge1xuICAgICAgICBkaXJTdGF0cyA9IGF3YWl0IGZzLnN0YXQoZnVsbERpclBhdGgpO1xuICAgICAgICBpZiAoIWRpclN0YXRzLmlzRGlyZWN0b3J5KCkpIHtcbiAgICAgICAgICByZXR1cm4gcmVzLmpzb24oeyBjb21wbGV0aW9uczogW10gfSk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICAvLyBEaXJlY3RvcnkgZG9lc24ndCBleGlzdCwgcmV0dXJuIGVtcHR5IGNvbXBsZXRpb25zXG4gICAgICAgIHJldHVybiByZXMuanNvbih7IGNvbXBsZXRpb25zOiBbXSB9KTtcbiAgICAgIH1cblxuICAgICAgLy8gUmVhZCBkaXJlY3RvcnkgY29udGVudHNcbiAgICAgIGNvbnN0IGVudHJpZXMgPSBhd2FpdCBmcy5yZWFkZGlyKGZ1bGxEaXJQYXRoLCB7IHdpdGhGaWxlVHlwZXM6IHRydWUgfSk7XG5cbiAgICAgIC8vIEZpbHRlciBhbmQgbWFwIGVudHJpZXNcbiAgICAgIGNvbnN0IG1hcHBlZEVudHJpZXMgPSBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgICAgZW50cmllc1xuICAgICAgICAgIC5maWx0ZXIoKGVudHJ5KSA9PiB7XG4gICAgICAgICAgICAvLyBGaWx0ZXIgYnkgcGFydGlhbCBuYW1lIChjYXNlLWluc2Vuc2l0aXZlKVxuICAgICAgICAgICAgaWYgKHBhcnRpYWxOYW1lICYmICFlbnRyeS5uYW1lLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aChwYXJ0aWFsTmFtZS50b0xvd2VyQ2FzZSgpKSkge1xuICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBPcHRpb25hbGx5IGhpZGUgaGlkZGVuIGZpbGVzIHVubGVzcyB0aGUgcGFydGlhbCBuYW1lIHN0YXJ0cyB3aXRoICcuJ1xuICAgICAgICAgICAgaWYgKCFwYXJ0aWFsTmFtZS5zdGFydHNXaXRoKCcuJykgJiYgZW50cnkubmFtZS5zdGFydHNXaXRoKCcuJykpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAubWFwKGFzeW5jIChlbnRyeSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgaXNEaXJlY3RvcnkgPSBlbnRyeS5pc0RpcmVjdG9yeSgpO1xuICAgICAgICAgICAgY29uc3QgZW50cnlQYXRoID0gcGF0aC5qb2luKGZ1bGxEaXJQYXRoLCBlbnRyeS5uYW1lKTtcblxuICAgICAgICAgICAgLy8gQnVpbGQgdGhlIHN1Z2dlc3Rpb24gcGF0aCBiYXNlZCBvbiB0aGUgb3JpZ2luYWwgaW5wdXRcbiAgICAgICAgICAgIGxldCBkaXNwbGF5UGF0aDogc3RyaW5nO1xuICAgICAgICAgICAgaWYgKG9yaWdpbmFsUGF0aC5lbmRzV2l0aCgnLycpKSB7XG4gICAgICAgICAgICAgIGRpc3BsYXlQYXRoID0gb3JpZ2luYWxQYXRoICsgZW50cnkubmFtZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGNvbnN0IGxhc3RTbGFzaCA9IG9yaWdpbmFsUGF0aC5sYXN0SW5kZXhPZignLycpO1xuICAgICAgICAgICAgICBpZiAobGFzdFNsYXNoID49IDApIHtcbiAgICAgICAgICAgICAgICBkaXNwbGF5UGF0aCA9IG9yaWdpbmFsUGF0aC5zdWJzdHJpbmcoMCwgbGFzdFNsYXNoICsgMSkgKyBlbnRyeS5uYW1lO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGRpc3BsYXlQYXRoID0gZW50cnkubmFtZTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBDaGVjayBpZiB0aGlzIGRpcmVjdG9yeSBpcyBhIGdpdCByZXBvc2l0b3J5IGFuZCBnZXQgYnJhbmNoICsgc3RhdHVzXG4gICAgICAgICAgICBsZXQgaXNHaXRSZXBvID0gZmFsc2U7XG4gICAgICAgICAgICBsZXQgZ2l0QnJhbmNoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICAgICAgICBsZXQgZ2l0U3RhdHVzQ291bnQgPSAwO1xuICAgICAgICAgICAgbGV0IGdpdEFkZGVkQ291bnQgPSAwO1xuICAgICAgICAgICAgbGV0IGdpdE1vZGlmaWVkQ291bnQgPSAwO1xuICAgICAgICAgICAgbGV0IGdpdERlbGV0ZWRDb3VudCA9IDA7XG4gICAgICAgICAgICBsZXQgaXNXb3JrdHJlZSA9IGZhbHNlO1xuICAgICAgICAgICAgaWYgKGlzRGlyZWN0b3J5KSB7XG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZ2l0UGF0aCA9IHBhdGguam9pbihlbnRyeVBhdGgsICcuZ2l0Jyk7XG4gICAgICAgICAgICAgICAgY29uc3QgZ2l0U3RhdCA9IGF3YWl0IGZzLnN0YXQoZ2l0UGF0aCk7XG4gICAgICAgICAgICAgICAgaXNHaXRSZXBvID0gdHJ1ZTtcblxuICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIGl0J3MgYSB3b3JrdHJlZSAoaGFzIGEgLmdpdCBmaWxlIGluc3RlYWQgb2YgZGlyZWN0b3J5KVxuICAgICAgICAgICAgICAgIGlmIChnaXRTdGF0LmlzRmlsZSgpKSB7XG4gICAgICAgICAgICAgICAgICBpc1dvcmt0cmVlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBHZXQgdGhlIGN1cnJlbnQgZ2l0IGJyYW5jaFxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICBjb25zdCB7IHN0ZG91dDogYnJhbmNoIH0gPSBhd2FpdCBleGVjQXN5bmMoJ2dpdCBicmFuY2ggLS1zaG93LWN1cnJlbnQnLCB7XG4gICAgICAgICAgICAgICAgICAgIGN3ZDogZW50cnlQYXRoLFxuICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICBnaXRCcmFuY2ggPSBicmFuY2gudHJpbSgpO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgICAgLy8gRmFpbGVkIHRvIGdldCBicmFuY2hcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBHZXQgdGhlIG51bWJlciBvZiBjaGFuZ2VkIGZpbGVzIGJ5IHR5cGVcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgY29uc3QgeyBzdGRvdXQ6IHN0YXR1c091dHB1dCB9ID0gYXdhaXQgZXhlY0FzeW5jKCdnaXQgc3RhdHVzIC0tcG9yY2VsYWluJywge1xuICAgICAgICAgICAgICAgICAgICBjd2Q6IGVudHJ5UGF0aCxcbiAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgY29uc3QgbGluZXMgPSBzdGF0dXNPdXRwdXQuc3BsaXQoJ1xcbicpLmZpbHRlcigobGluZSkgPT4gbGluZS50cmltKCkgIT09ICcnKTtcblxuICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN0YXR1c0NvZGUgPSBsaW5lLnN1YnN0cmluZygwLCAyKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXR1c0NvZGUgPT09ICc/PycgfHwgc3RhdHVzQ29kZSA9PT0gJ0EgJyB8fCBzdGF0dXNDb2RlID09PSAnQU0nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgZ2l0QWRkZWRDb3VudCsrO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHN0YXR1c0NvZGUgPT09ICcgRCcgfHwgc3RhdHVzQ29kZSA9PT0gJ0QgJykge1xuICAgICAgICAgICAgICAgICAgICAgIGdpdERlbGV0ZWRDb3VudCsrO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHN0YXR1c0NvZGUgPT09ICcgTScgfHwgc3RhdHVzQ29kZSA9PT0gJ00gJyB8fCBzdGF0dXNDb2RlID09PSAnTU0nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgZ2l0TW9kaWZpZWRDb3VudCsrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgIGdpdFN0YXR1c0NvdW50ID0gZ2l0QWRkZWRDb3VudCArIGdpdE1vZGlmaWVkQ291bnQgKyBnaXREZWxldGVkQ291bnQ7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgICAvLyBGYWlsZWQgdG8gZ2V0IHN0YXR1c1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgLy8gTm90IGEgZ2l0IHJlcG9zaXRvcnlcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBuYW1lOiBlbnRyeS5uYW1lLFxuICAgICAgICAgICAgICBwYXRoOiBkaXNwbGF5UGF0aCxcbiAgICAgICAgICAgICAgdHlwZTogaXNEaXJlY3RvcnkgPyAnZGlyZWN0b3J5JyA6ICdmaWxlJyxcbiAgICAgICAgICAgICAgLy8gQWRkIHRyYWlsaW5nIHNsYXNoIGZvciBkaXJlY3Rvcmllc1xuICAgICAgICAgICAgICBzdWdnZXN0aW9uOiBpc0RpcmVjdG9yeSA/IGAke2Rpc3BsYXlQYXRofS9gIDogZGlzcGxheVBhdGgsXG4gICAgICAgICAgICAgIGlzUmVwb3NpdG9yeTogaXNHaXRSZXBvLFxuICAgICAgICAgICAgICBnaXRCcmFuY2gsXG4gICAgICAgICAgICAgIGdpdFN0YXR1c0NvdW50LFxuICAgICAgICAgICAgICBnaXRBZGRlZENvdW50LFxuICAgICAgICAgICAgICBnaXRNb2RpZmllZENvdW50LFxuICAgICAgICAgICAgICBnaXREZWxldGVkQ291bnQsXG4gICAgICAgICAgICAgIGlzV29ya3RyZWUsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgICBjb25zdCBjb21wbGV0aW9ucyA9IG1hcHBlZEVudHJpZXNcbiAgICAgICAgLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgICAgICAvLyBTb3J0IGRpcmVjdG9yaWVzIGZpcnN0LCB0aGVuIGJ5IG5hbWVcbiAgICAgICAgICBpZiAoYS50eXBlICE9PSBiLnR5cGUpIHtcbiAgICAgICAgICAgIHJldHVybiBhLnR5cGUgPT09ICdkaXJlY3RvcnknID8gLTEgOiAxO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gYS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5uYW1lKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnNsaWNlKDAsIDIwKTsgLy8gTGltaXQgdG8gMjAgc3VnZ2VzdGlvbnNcblxuICAgICAgbG9nZ2VyLmRlYnVnKGBwYXRoIGNvbXBsZXRpb25zIGZvciBcIiR7b3JpZ2luYWxQYXRofVwiOiAke2NvbXBsZXRpb25zLmxlbmd0aH0gcmVzdWx0c2ApO1xuXG4gICAgICByZXMuanNvbih7XG4gICAgICAgIGNvbXBsZXRpb25zLFxuICAgICAgICBwYXJ0aWFsUGF0aDogb3JpZ2luYWxQYXRoLFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcihgZmFpbGVkIHRvIGdldCBwYXRoIGNvbXBsZXRpb25zIGZvciAke3JlcS5xdWVyeS5wYXRofTpgLCBlcnJvcik7XG4gICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7IGVycm9yOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgfVxuICB9KTtcblxuICByZXR1cm4gcm91dGVyO1xufVxuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gZGV0ZXJtaW5lIGxhbmd1YWdlIGZyb20gZmlsZSBwYXRoXG5mdW5jdGlvbiBnZXRMYW5ndWFnZUZyb21QYXRoKGZpbGVQYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCBleHQgPSBwYXRoLmV4dG5hbWUoZmlsZVBhdGgpLnRvTG93ZXJDYXNlKCk7XG4gIGNvbnN0IGxhbmd1YWdlTWFwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICcuanMnOiAnamF2YXNjcmlwdCcsXG4gICAgJy5qc3gnOiAnamF2YXNjcmlwdCcsXG4gICAgJy50cyc6ICd0eXBlc2NyaXB0JyxcbiAgICAnLnRzeCc6ICd0eXBlc2NyaXB0JyxcbiAgICAnLnB5JzogJ3B5dGhvbicsXG4gICAgJy5qYXZhJzogJ2phdmEnLFxuICAgICcuYyc6ICdjJyxcbiAgICAnLmNwcCc6ICdjcHAnLFxuICAgICcuY3MnOiAnY3NoYXJwJyxcbiAgICAnLnBocCc6ICdwaHAnLFxuICAgICcucmInOiAncnVieScsXG4gICAgJy5nbyc6ICdnbycsXG4gICAgJy5ycyc6ICdydXN0JyxcbiAgICAnLnN3aWZ0JzogJ3N3aWZ0JyxcbiAgICAnLmt0JzogJ2tvdGxpbicsXG4gICAgJy5zY2FsYSc6ICdzY2FsYScsXG4gICAgJy5yJzogJ3InLFxuICAgICcubSc6ICdvYmplY3RpdmUtYycsXG4gICAgJy5tbSc6ICdvYmplY3RpdmUtYycsXG4gICAgJy5oJzogJ2MnLFxuICAgICcuaHBwJzogJ2NwcCcsXG4gICAgJy5zaCc6ICdzaGVsbCcsXG4gICAgJy5iYXNoJzogJ3NoZWxsJyxcbiAgICAnLnpzaCc6ICdzaGVsbCcsXG4gICAgJy5maXNoJzogJ3NoZWxsJyxcbiAgICAnLnBzMSc6ICdwb3dlcnNoZWxsJyxcbiAgICAnLmh0bWwnOiAnaHRtbCcsXG4gICAgJy5odG0nOiAnaHRtbCcsXG4gICAgJy54bWwnOiAneG1sJyxcbiAgICAnLmNzcyc6ICdjc3MnLFxuICAgICcuc2Nzcyc6ICdzY3NzJyxcbiAgICAnLnNhc3MnOiAnc2FzcycsXG4gICAgJy5sZXNzJzogJ2xlc3MnLFxuICAgICcuanNvbic6ICdqc29uJyxcbiAgICAnLnlhbWwnOiAneWFtbCcsXG4gICAgJy55bWwnOiAneWFtbCcsXG4gICAgJy50b21sJzogJ3RvbWwnLFxuICAgICcuaW5pJzogJ2luaScsXG4gICAgJy5jZmcnOiAnaW5pJyxcbiAgICAnLmNvbmYnOiAnaW5pJyxcbiAgICAnLnNxbCc6ICdzcWwnLFxuICAgICcubWQnOiAnbWFya2Rvd24nLFxuICAgICcubWFya2Rvd24nOiAnbWFya2Rvd24nLFxuICAgICcudGV4JzogJ2xhdGV4JyxcbiAgICAnLmRvY2tlcmZpbGUnOiAnZG9ja2VyZmlsZScsXG4gICAgJy5tYWtlZmlsZSc6ICdtYWtlZmlsZScsXG4gICAgJy5jbWFrZSc6ICdjbWFrZScsXG4gICAgJy5ncmFkbGUnOiAnZ3JhZGxlJyxcbiAgICAnLnZ1ZSc6ICd2dWUnLFxuICAgICcuc3ZlbHRlJzogJ3N2ZWx0ZScsXG4gICAgJy5lbG0nOiAnZWxtJyxcbiAgICAnLmNsaic6ICdjbG9qdXJlJyxcbiAgICAnLmNsanMnOiAnY2xvanVyZScsXG4gICAgJy5leCc6ICdlbGl4aXInLFxuICAgICcuZXhzJzogJ2VsaXhpcicsXG4gICAgJy5lcmwnOiAnZXJsYW5nJyxcbiAgICAnLmhybCc6ICdlcmxhbmcnLFxuICAgICcuZnMnOiAnZnNoYXJwJyxcbiAgICAnLmZzeCc6ICdmc2hhcnAnLFxuICAgICcuZnNpJzogJ2ZzaGFycCcsXG4gICAgJy5tbCc6ICdvY2FtbCcsXG4gICAgJy5tbGknOiAnb2NhbWwnLFxuICAgICcucGFzJzogJ3Bhc2NhbCcsXG4gICAgJy5wcCc6ICdwYXNjYWwnLFxuICAgICcucGwnOiAncGVybCcsXG4gICAgJy5wbSc6ICdwZXJsJyxcbiAgICAnLnQnOiAncGVybCcsXG4gICAgJy5sdWEnOiAnbHVhJyxcbiAgICAnLmRhcnQnOiAnZGFydCcsXG4gICAgJy5uaW0nOiAnbmltJyxcbiAgICAnLm5pbXMnOiAnbmltJyxcbiAgICAnLnppZyc6ICd6aWcnLFxuICAgICcuamwnOiAnanVsaWEnLFxuICB9O1xuXG4gIHJldHVybiBsYW5ndWFnZU1hcFtleHRdIHx8ICdwbGFpbnRleHQnO1xufVxuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gZm9ybWF0IGJ5dGVzXG5mdW5jdGlvbiBmb3JtYXRCeXRlcyhieXRlczogbnVtYmVyLCBkZWNpbWFscyA9IDIpOiBzdHJpbmcge1xuICBpZiAoYnl0ZXMgPT09IDApIHJldHVybiAnMCBCeXRlcyc7XG5cbiAgY29uc3QgayA9IDEwMjQ7XG4gIGNvbnN0IGRtID0gZGVjaW1hbHMgPCAwID8gMCA6IGRlY2ltYWxzO1xuICBjb25zdCBzaXplcyA9IFsnQnl0ZXMnLCAnS0InLCAnTUInLCAnR0InLCAnVEInXTtcblxuICBjb25zdCBpID0gTWF0aC5mbG9vcihNYXRoLmxvZyhieXRlcykgLyBNYXRoLmxvZyhrKSk7XG5cbiAgcmV0dXJuIGAke051bWJlci5wYXJzZUZsb2F0KChieXRlcyAvIGsgKiogaSkudG9GaXhlZChkbSkpfSAke3NpemVzW2ldfWA7XG59XG4iXX0=