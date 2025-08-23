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
exports.createFileRoutes = createFileRoutes;
const express_1 = require("express");
const fs = __importStar(require("fs"));
const promises_1 = require("fs/promises");
const mime = __importStar(require("mime-types"));
const multer_1 = __importDefault(require("multer"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const uuid_1 = require("uuid");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)('files');
// Create uploads directory in the control directory
const CONTROL_DIR = process.env.VIBETUNNEL_CONTROL_DIR || path.join(os.homedir(), '.vibetunnel/control');
const UPLOADS_DIR = path.join(CONTROL_DIR, 'uploads');
// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    logger.log(`Created uploads directory: ${UPLOADS_DIR}`);
}
// Configure multer for file uploads
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (_req, file, cb) => {
        // Generate unique filename with original extension
        const uniqueName = `${(0, uuid_1.v4)()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    },
});
// File filter configuration
// Note: We intentionally do not restrict file types to provide maximum flexibility
// for users. While the terminal display may not support all file formats (e.g.,
// binary files, executables), users should be able to upload any file they need
// and receive the path in their terminal for further processing.
const fileFilter = (_req, _file, cb) => {
    // Accept all file types - no restrictions by design
    cb(null, true);
};
const upload = (0, multer_1.default)({
    storage,
    fileFilter,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit for general files
    },
});
function createFileRoutes() {
    const router = (0, express_1.Router)();
    // Upload file endpoint
    router.post('/files/upload', upload.single('file'), (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file provided' });
            }
            // Generate relative path for the terminal
            const relativePath = path.relative(process.cwd(), req.file.path);
            const absolutePath = req.file.path;
            logger.log(`File uploaded by user ${req.userId}: ${req.file.filename} (${req.file.size} bytes)`);
            res.json({
                success: true,
                filename: req.file.filename,
                originalName: req.file.originalname,
                size: req.file.size,
                mimetype: req.file.mimetype,
                path: absolutePath,
                relativePath: relativePath,
            });
        }
        catch (error) {
            logger.error('File upload error:', error);
            res.status(500).json({ error: 'Failed to upload file' });
        }
    });
    // Serve uploaded files
    router.get('/files/:filename', async (req, res) => {
        try {
            const filename = req.params.filename;
            const filePath = path.join(UPLOADS_DIR, filename);
            // Security check: ensure filename doesn't contain path traversal
            // Only allow alphanumeric, hyphens, underscores, dots, and standard file extension patterns
            if (filename.includes('..') ||
                filename.includes('/') ||
                filename.includes('\\') ||
                filename.includes('\0') ||
                !/^[a-zA-Z0-9._-]+$/.test(filename) ||
                filename.startsWith('.') ||
                filename.length > 255) {
                return res.status(400).json({ error: 'Invalid filename' });
            }
            // Ensure the resolved path is within the uploads directory
            const resolvedPath = path.resolve(filePath);
            const resolvedUploadsDir = path.resolve(UPLOADS_DIR);
            if (!resolvedPath.startsWith(resolvedUploadsDir + path.sep) &&
                resolvedPath !== resolvedUploadsDir) {
                return res.status(400).json({ error: 'Invalid file path' });
            }
            // Check if file exists
            try {
                await (0, promises_1.access)(filePath);
            }
            catch {
                return res.status(404).json({ error: 'File not found' });
            }
            // Get file stats for content length
            const stats = await (0, promises_1.stat)(filePath);
            // Use mime-types library to determine content type
            // It automatically falls back to 'application/octet-stream' for unknown types
            const contentType = mime.lookup(filename) || 'application/octet-stream';
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Length', stats.size);
            res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
            // Stream the file
            const fileStream = fs.createReadStream(filePath);
            fileStream.pipe(res);
        }
        catch (error) {
            logger.error('File serve error:', error);
            res.status(500).json({ error: 'Failed to serve file' });
        }
    });
    // List uploaded files
    router.get('/files', async (_req, res) => {
        try {
            const allFiles = await (0, promises_1.readdir)(UPLOADS_DIR);
            const files = await Promise.all(allFiles.map(async (file) => {
                const filePath = path.join(UPLOADS_DIR, file);
                const stats = await (0, promises_1.stat)(filePath);
                return {
                    filename: file,
                    size: stats.size,
                    createdAt: stats.birthtime,
                    modifiedAt: stats.mtime,
                    url: `/api/files/${file}`,
                    extension: path.extname(file).toLowerCase(),
                };
            }));
            files.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()); // Sort by newest first
            res.json({
                files,
                count: files.length,
            });
        }
        catch (error) {
            logger.error('File list error:', error);
            res.status(500).json({ error: 'Failed to list files' });
        }
    });
    // Delete uploaded file
    router.delete('/files/:filename', async (req, res) => {
        try {
            const filename = req.params.filename;
            // Security check: ensure filename doesn't contain path traversal
            if (filename.includes('..') ||
                filename.includes('/') ||
                filename.includes('\\') ||
                filename.includes('\0') ||
                !/^[a-zA-Z0-9._-]+$/.test(filename) ||
                filename.startsWith('.') ||
                filename.length > 255) {
                return res.status(400).json({ error: 'Invalid filename' });
            }
            const filePath = path.join(UPLOADS_DIR, filename);
            // Ensure the resolved path is within the uploads directory
            const resolvedPath = path.resolve(filePath);
            const resolvedUploadsDir = path.resolve(UPLOADS_DIR);
            if (!resolvedPath.startsWith(resolvedUploadsDir + path.sep) &&
                resolvedPath !== resolvedUploadsDir) {
                return res.status(400).json({ error: 'Invalid file path' });
            }
            try {
                await (0, promises_1.unlink)(filePath);
                logger.log(`File deleted by user ${req.userId}: ${filename}`);
                res.json({ success: true, message: 'File deleted successfully' });
            }
            catch {
                // File doesn't exist
                res.status(404).json({ error: 'File not found' });
            }
        }
        catch (error) {
            logger.error('File deletion error:', error);
            res.status(500).json({ error: 'Failed to delete file' });
        }
    });
    return router;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2VydmVyL3JvdXRlcy9maWxlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQW1FQSw0Q0F5S0M7QUEzT0QscUNBQWlDO0FBQ2pDLHVDQUF5QjtBQUN6QiwwQ0FBNEQ7QUFDNUQsaURBQW1DO0FBQ25DLG9EQUE0QjtBQUM1Qix1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLCtCQUFvQztBQUVwQyxrREFBa0Q7QUFFbEQsTUFBTSxNQUFNLEdBQUcsSUFBQSx3QkFBWSxFQUFDLE9BQU8sQ0FBQyxDQUFDO0FBRXJDLG9EQUFvRDtBQUNwRCxNQUFNLFdBQVcsR0FDZixPQUFPLENBQUMsR0FBRyxDQUFDLHNCQUFzQixJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxFQUFFLHFCQUFxQixDQUFDLENBQUM7QUFDdkYsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsU0FBUyxDQUFDLENBQUM7QUFFdEQsa0NBQWtDO0FBQ2xDLElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUM7SUFDaEMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxXQUFXLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUMvQyxNQUFNLENBQUMsR0FBRyxDQUFDLDhCQUE4QixXQUFXLEVBQUUsQ0FBQyxDQUFDO0FBQzFELENBQUM7QUFFRCxvQ0FBb0M7QUFDcEMsTUFBTSxPQUFPLEdBQUcsZ0JBQU0sQ0FBQyxXQUFXLENBQUM7SUFDakMsV0FBVyxFQUFFLENBQ1gsSUFBcUIsRUFDckIsS0FBMEIsRUFDMUIsRUFBc0QsRUFDdEQsRUFBRTtRQUNGLEVBQUUsQ0FBQyxJQUFJLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDeEIs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a0IsRUFDbkMsQ0FBQztnQkFDRCxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLG1CQUFtQixFQUFFLENBQUMsQ0FBQztZQUM5RCxDQUFDO1lBRUQsSUFBSSxDQUFDO2dCQUNILE1BQU0sSUFBQSxpQkFBTSxFQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUN2QixNQUFNLENBQUMsR0FBRyxDQUFDLHdCQUF3QixHQUFHLENBQUMsTUFBTSxLQUFLLFFBQVEsRUFBRSxDQUFDLENBQUM7Z0JBQzlELEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxDQUFDLENBQUM7WUFDcEUsQ0FBQztZQUFDLE1BQU0sQ0FBQztnQkFDUCxxQkFBcUI7Z0JBQ3JCLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFLENBQUMsQ0FBQztZQUNwRCxDQUFDO1FBQ0gsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixNQUFNLENBQUMsS0FBSyxDQUFDLHNCQUFzQixFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzVDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLHVCQUF1QixFQUFFLENBQUMsQ0FBQztRQUMzRCxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxPQUFPLE1BQU0sQ0FBQztBQUNoQixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBFeHByZXNzIH0gZnJvbSAnZXhwcmVzcyc7XG5pbXBvcnQgeyBSb3V0ZXIgfSBmcm9tICdleHByZXNzJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCB7IGFjY2VzcywgcmVhZGRpciwgc3RhdCwgdW5saW5rIH0gZnJvbSAnZnMvcHJvbWlzZXMnO1xuaW1wb3J0ICogYXMgbWltZSBmcm9tICdtaW1lLXR5cGVzJztcbmltcG9ydCBtdWx0ZXIgZnJvbSAnbXVsdGVyJztcbmltcG9ydCAqIGFzIG9zIGZyb20gJ29zJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyB2NCBhcyB1dWlkdjQgfSBmcm9tICd1dWlkJztcbmltcG9ydCB0eXBlIHsgQXV0aGVudGljYXRlZFJlcXVlc3QgfSBmcm9tICcuLi9taWRkbGV3YXJlL2F1dGguanMnO1xuaW1wb3J0IHsgY3JlYXRlTG9nZ2VyIH0gZnJvbSAnLi4vdXRpbHMvbG9nZ2VyLmpzJztcblxuY29uc3QgbG9nZ2VyID0gY3JlYXRlTG9nZ2VyKCdmaWxlcycpO1xuXG4vLyBDcmVhdGUgdXBsb2FkcyBkaXJlY3RvcnkgaW4gdGhlIGNvbnRyb2wgZGlyZWN0b3J5XG5jb25zdCBDT05UUk9MX0RJUiA9XG4gIHByb2Nlc3MuZW52LlZJQkVUVU5ORUxfQ09OVFJPTF9ESVIgfHwgcGF0aC5qb2luKG9zLmhvbWVkaXIoKSwgJy52aWJldHVubmVsL2NvbnRyb2wnKTtcbmNvbnN0IFVQTE9BRFNfRElSID0gcGF0aC5qb2luKENPTlRST0xfRElSLCAndXBsb2FkcycpO1xuXG4vLyBFbnN1cmUgdXBsb2FkcyBkaXJlY3RvcnkgZXhpc3RzXG5pZiAoIWZzLmV4aXN0c1N5bmMoVVBMT0FEU19ESVIpKSB7XG4gIGZzLm1rZGlyU3luYyhVUExPQURTX0RJUiwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gIGxvZ2dlci5sb2coYENyZWF0ZWQgdXBsb2FkcyBkaXJlY3Rvcnk6ICR7VVBMT0FEU19ESVJ9YCk7XG59XG5cbi8vIENvbmZpZ3VyZSBtdWx0ZXIgZm9yIGZpbGUgdXBsb2Fkc1xuY29uc3Qgc3RvcmFnZSA9IG11bHRlci5kaXNrU3RvcmFnZSh7XG4gIGRlc3RpbmF0aW9uOiAoXG4gICAgX3JlcTogRXhwcmVzcy5SZXF1ZXN0LFxuICAgIF9maWxlOiBFeHByZXNzLk11bHRlci5GaWxlLFxuICAgIGNiOiAoZXJyb3I6IEVycm9yIHwgbnVsbCwgZGVzdGluYXRpb246IHN0cmluZykgPT4gdm9pZFxuICApID0+IHtcbiAgICBjYihudWxsLCBVUExPQURTX0RJUik7XG4gIH0sXG4gIGZpbGVuYW1lOiAoXG4gICAgX3JlcTogRXhwcmVzcy5SZXF1ZXN0LFxuICAgIGZpbGU6IEV4cHJlc3MuTXVsdGVyLkZpbGUsXG4gICAgY2I6IChlcnJvcjogRXJyb3IgfCBudWxsLCBmaWxlbmFtZTogc3RyaW5nKSA9PiB2b2lkXG4gICkgPT4ge1xuICAgIC8vIEdlbmVyYXRlIHVuaXF1ZSBmaWxlbmFtZSB3aXRoIG9yaWdpbmFsIGV4dGVuc2lvblxuICAgIGNvbnN0IHVuaXF1ZU5hbWUgPSBgJHt1dWlkdjQoKX0ke3BhdGguZXh0bmFtZShmaWxlLm9yaWdpbmFsbmFtZSl9YDtcbiAgICBjYihudWxsLCB1bmlxdWVOYW1lKTtcbiAgfSxcbn0pO1xuXG4vLyBGaWxlIGZpbHRlciBjb25maWd1cmF0aW9uXG4vLyBOb3RlOiBXZSBpbnRlbnRpb25hbGx5IGRvIG5vdCByZXN0cmljdCBmaWxlIHR5cGVzIHRvIHByb3ZpZGUgbWF4aW11bSBmbGV4aWJpbGl0eVxuLy8gZm9yIHVzZXJzLiBXaGlsZSB0aGUgdGVybWluYWwgZGlzcGxheSBtYXkgbm90IHN1cHBvcnQgYWxsIGZpbGUgZm9ybWF0cyAoZS5nLixcbi8vIGJpbmFyeSBmaWxlcywgZXhlY3V0YWJsZXMpLCB1c2VycyBzaG91bGQgYmUgYWJsZSB0byB1cGxvYWQgYW55IGZpbGUgdGhleSBuZWVkXG4vLyBhbmQgcmVjZWl2ZSB0aGUgcGF0aCBpbiB0aGVpciB0ZXJtaW5hbCBmb3IgZnVydGhlciBwcm9jZXNzaW5nLlxuY29uc3QgZmlsZUZpbHRlciA9IChcbiAgX3JlcTogRXhwcmVzcy5SZXF1ZXN0LFxuICBfZmlsZTogRXhwcmVzcy5NdWx0ZXIuRmlsZSxcbiAgY2I6IG11bHRlci5GaWxlRmlsdGVyQ2FsbGJhY2tcbikgPT4ge1xuICAvLyBBY2NlcHQgYWxsIGZpbGUgdHlwZXMgLSBubyByZXN0cmljdGlvbnMgYnkgZGVzaWduXG4gIGNiKG51bGwsIHRydWUpO1xufTtcblxuY29uc3QgdXBsb2FkID0gbXVsdGVyKHtcbiAgc3RvcmFnZSxcbiAgZmlsZUZpbHRlcixcbiAgbGltaXRzOiB7XG4gICAgZmlsZVNpemU6IDEwMCAqIDEwMjQgKiAxMDI0LCAvLyAxMDBNQiBsaW1pdCBmb3IgZ2VuZXJhbCBmaWxlc1xuICB9LFxufSk7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVGaWxlUm91dGVzKCk6IFJvdXRlciB7XG4gIGNvbnN0IHJvdXRlciA9IFJvdXRlcigpO1xuXG4gIC8vIFVwbG9hZCBmaWxlIGVuZHBvaW50XG4gIHJvdXRlci5wb3N0KFxuICAgICcvZmlsZXMvdXBsb2FkJyxcbiAgICB1cGxvYWQuc2luZ2xlKCdmaWxlJyksXG4gICAgKHJlcTogQXV0aGVudGljYXRlZFJlcXVlc3QgJiB7IGZpbGU/OiBFeHByZXNzLk11bHRlci5GaWxlIH0sIHJlcykgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgaWYgKCFyZXEuZmlsZSkge1xuICAgICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7IGVycm9yOiAnTm8gZmlsZSBwcm92aWRlZCcgfSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBHZW5lcmF0ZSByZWxhdGl2ZSBwYXRoIGZvciB0aGUgdGVybWluYWxcbiAgICAgICAgY29uc3QgcmVsYXRpdmVQYXRoID0gcGF0aC5yZWxhdGl2ZShwcm9jZXNzLmN3ZCgpLCByZXEuZmlsZS5wYXRoKTtcbiAgICAgICAgY29uc3QgYWJzb2x1dGVQYXRoID0gcmVxLmZpbGUucGF0aDtcblxuICAgICAgICBsb2dnZXIubG9nKFxuICAgICAgICAgIGBGaWxlIHVwbG9hZGVkIGJ5IHVzZXIgJHtyZXEudXNlcklkfTogJHtyZXEuZmlsZS5maWxlbmFtZX0gKCR7cmVxLmZpbGUuc2l6ZX0gYnl0ZXMpYFxuICAgICAgICApO1xuXG4gICAgICAgIHJlcy5qc29uKHtcbiAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgIGZpbGVuYW1lOiByZXEuZmlsZS5maWxlbmFtZSxcbiAgICAgICAgICBvcmlnaW5hbE5hbWU6IHJlcS5maWxlLm9yaWdpbmFsbmFtZSxcbiAgICAgICAgICBzaXplOiByZXEuZmlsZS5zaXplLFxuICAgICAgICAgIG1pbWV0eXBlOiByZXEuZmlsZS5taW1ldHlwZSxcbiAgICAgICAgICBwYXRoOiBhYnNvbHV0ZVBhdGgsXG4gICAgICAgICAgcmVsYXRpdmVQYXRoOiByZWxhdGl2ZVBhdGgsXG4gICAgICAgIH0pO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdGaWxlIHVwbG9hZCBlcnJvcjonLCBlcnJvcik7XG4gICAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHsgZXJyb3I6ICdGYWlsZWQgdG8gdXBsb2FkIGZpbGUnIH0pO1xuICAgICAgfVxuICAgIH1cbiAgKTtcblxuICAvLyBTZXJ2ZSB1cGxvYWRlZCBmaWxlc1xuICByb3V0ZXIuZ2V0KCcvZmlsZXMvOmZpbGVuYW1lJywgYXN5bmMgKHJlcSwgcmVzKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGZpbGVuYW1lID0gcmVxLnBhcmFtcy5maWxlbmFtZTtcbiAgICAgIGNvbnN0IGZpbGVQYXRoID0gcGF0aC5qb2luKFVQTE9BRFNfRElSLCBmaWxlbmFtZSk7XG5cbiAgICAgIC8vIFNlY3VyaXR5IGNoZWNrOiBlbnN1cmUgZmlsZW5hbWUgZG9lc24ndCBjb250YWluIHBhdGggdHJhdmVyc2FsXG4gICAgICAvLyBPbmx5IGFsbG93IGFscGhhbnVtZXJpYywgaHlwaGVucywgdW5kZXJzY29yZXMsIGRvdHMsIGFuZCBzdGFuZGFyZCBmaWxlIGV4dGVuc2lvbiBwYXR0ZXJuc1xuICAgICAgaWYgKFxuICAgICAgICBmaWxlbmFtZS5pbmNsdWRlcygnLi4nKSB8fFxuICAgICAgICBmaWxlbmFtZS5pbmNsdWRlcygnLycpIHx8XG4gICAgICAgIGZpbGVuYW1lLmluY2x1ZGVzKCdcXFxcJykgfHxcbiAgICAgICAgZmlsZW5hbWUuaW5jbHVkZXMoJ1xcMCcpIHx8XG4gICAgICAgICEvXlthLXpBLVowLTkuXy1dKyQvLnRlc3QoZmlsZW5hbWUpIHx8XG4gICAgICAgIGZpbGVuYW1lLnN0YXJ0c1dpdGgoJy4nKSB8fFxuICAgICAgICBmaWxlbmFtZS5sZW5ndGggPiAyNTVcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oeyBlcnJvcjogJ0ludmFsaWQgZmlsZW5hbWUnIH0pO1xuICAgICAgfVxuXG4gICAgICAvLyBFbnN1cmUgdGhlIHJlc29sdmVkIHBhdGggaXMgd2l0aGluIHRoZSB1cGxvYWRzIGRpcmVjdG9yeVxuICAgICAgY29uc3QgcmVzb2x2ZWRQYXRoID0gcGF0aC5yZXNvbHZlKGZpbGVQYXRoKTtcbiAgICAgIGNvbnN0IHJlc29sdmVkVXBsb2Fkc0RpciA9IHBhdGgucmVzb2x2ZShVUExPQURTX0RJUik7XG4gICAgICBpZiAoXG4gICAgICAgICFyZXNvbHZlZFBhdGguc3RhcnRzV2l0aChyZXNvbHZlZFVwbG9hZHNEaXIgKyBwYXRoLnNlcCkgJiZcbiAgICAgICAgcmVzb2x2ZWRQYXRoICE9PSByZXNvbHZlZFVwbG9hZHNEaXJcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oeyBlcnJvcjogJ0ludmFsaWQgZmlsZSBwYXRoJyB9KTtcbiAgICAgIH1cblxuICAgICAgLy8gQ2hlY2sgaWYgZmlsZSBleGlzdHNcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGFjY2VzcyhmaWxlUGF0aCk7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDA0KS5qc29uKHsgZXJyb3I6ICdGaWxlIG5vdCBmb3VuZCcgfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIEdldCBmaWxlIHN0YXRzIGZvciBjb250ZW50IGxlbmd0aFxuICAgICAgY29uc3Qgc3RhdHMgPSBhd2FpdCBzdGF0KGZpbGVQYXRoKTtcblxuICAgICAgLy8gVXNlIG1pbWUtdHlwZXMgbGlicmFyeSB0byBkZXRlcm1pbmUgY29udGVudCB0eXBlXG4gICAgICAvLyBJdCBhdXRvbWF0aWNhbGx5IGZhbGxzIGJhY2sgdG8gJ2FwcGxpY2F0aW9uL29jdGV0LXN0cmVhbScgZm9yIHVua25vd24gdHlwZXNcbiAgICAgIGNvbnN0IGNvbnRlbnRUeXBlID0gbWltZS5sb29rdXAoZmlsZW5hbWUpIHx8ICdhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW0nO1xuXG4gICAgICByZXMuc2V0SGVhZGVyKCdDb250ZW50LVR5cGUnLCBjb250ZW50VHlwZSk7XG4gICAgICByZXMuc2V0SGVhZGVyKCdDb250ZW50LUxlbmd0aCcsIHN0YXRzLnNpemUpO1xuICAgICAgcmVzLnNldEhlYWRlcignQ2FjaGUtQ29udHJvbCcsICdwdWJsaWMsIG1heC1hZ2U9ODY0MDAnKTsgLy8gQ2FjaGUgZm9yIDEgZGF5XG5cbiAgICAgIC8vIFN0cmVhbSB0aGUgZmlsZVxuICAgICAgY29uc3QgZmlsZVN0cmVhbSA9IGZzLmNyZWF0ZVJlYWRTdHJlYW0oZmlsZVBhdGgpO1xuICAgICAgZmlsZVN0cmVhbS5waXBlKHJlcyk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRmlsZSBzZXJ2ZSBlcnJvcjonLCBlcnJvcik7XG4gICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIHNlcnZlIGZpbGUnIH0pO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gTGlzdCB1cGxvYWRlZCBmaWxlc1xuICByb3V0ZXIuZ2V0KCcvZmlsZXMnLCBhc3luYyAoX3JlcTogQXV0aGVudGljYXRlZFJlcXVlc3QsIHJlcykgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBhbGxGaWxlcyA9IGF3YWl0IHJlYWRkaXIoVVBMT0FEU19ESVIpO1xuICAgICAgY29uc3QgZmlsZXMgPSBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgICAgYWxsRmlsZXMubWFwKGFzeW5jIChmaWxlKSA9PiB7XG4gICAgICAgICAgY29uc3QgZmlsZVBhdGggPSBwYXRoLmpvaW4oVVBMT0FEU19ESVIsIGZpbGUpO1xuICAgICAgICAgIGNvbnN0IHN0YXRzID0gYXdhaXQgc3RhdChmaWxlUGF0aCk7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGZpbGVuYW1lOiBmaWxlLFxuICAgICAgICAgICAgc2l6ZTogc3RhdHMuc2l6ZSxcbiAgICAgICAgICAgIGNyZWF0ZWRBdDogc3RhdHMuYmlydGh0aW1lLFxuICAgICAgICAgICAgbW9kaWZpZWRBdDogc3RhdHMubXRpbWUsXG4gICAgICAgICAgICB1cmw6IGAvYXBpL2ZpbGVzLyR7ZmlsZX1gLFxuICAgICAgICAgICAgZXh0ZW5zaW9uOiBwYXRoLmV4dG5hbWUoZmlsZSkudG9Mb3dlckNhc2UoKSxcbiAgICAgICAgICB9O1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICAgIGZpbGVzLnNvcnQoKGEsIGIpID0+IGIuY3JlYXRlZEF0LmdldFRpbWUoKSAtIGEuY3JlYXRlZEF0LmdldFRpbWUoKSk7IC8vIFNvcnQgYnkgbmV3ZXN0IGZpcnN0XG5cbiAgICAgIHJlcy5qc29uKHtcbiAgICAgICAgZmlsZXMsXG4gICAgICAgIGNvdW50OiBmaWxlcy5sZW5ndGgsXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCdGaWxlIGxpc3QgZXJyb3I6JywgZXJyb3IpO1xuICAgICAgcmVzLnN0YXR1cyg1MDApLmpzb24oeyBlcnJvcjogJ0ZhaWxlZCB0byBsaXN0IGZpbGVzJyB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIERlbGV0ZSB1cGxvYWRlZCBmaWxlXG4gIHJvdXRlci5kZWxldGUoJy9maWxlcy86ZmlsZW5hbWUnLCBhc3luYyAocmVxOiBBdXRoZW50aWNhdGVkUmVxdWVzdCwgcmVzKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGZpbGVuYW1lID0gcmVxLnBhcmFtcy5maWxlbmFtZTtcblxuICAgICAgLy8gU2VjdXJpdHkgY2hlY2s6IGVuc3VyZSBmaWxlbmFtZSBkb2Vzbid0IGNvbnRhaW4gcGF0aCB0cmF2ZXJzYWxcbiAgICAgIGlmIChcbiAgICAgICAgZmlsZW5hbWUuaW5jbHVkZXMoJy4uJykgfHxcbiAgICAgICAgZmlsZW5hbWUuaW5jbHVkZXMoJy8nKSB8fFxuICAgICAgICBmaWxlbmFtZS5pbmNsdWRlcygnXFxcXCcpIHx8XG4gICAgICAgIGZpbGVuYW1lLmluY2x1ZGVzKCdcXDAnKSB8fFxuICAgICAgICAhL15bYS16QS1aMC05Ll8tXSskLy50ZXN0KGZpbGVuYW1lKSB8fFxuICAgICAgICBmaWxlbmFtZS5zdGFydHNXaXRoKCcuJykgfHxcbiAgICAgICAgZmlsZW5hbWUubGVuZ3RoID4gMjU1XG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAwKS5qc29uKHsgZXJyb3I6ICdJbnZhbGlkIGZpbGVuYW1lJyB9KTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZmlsZVBhdGggPSBwYXRoLmpvaW4oVVBMT0FEU19ESVIsIGZpbGVuYW1lKTtcblxuICAgICAgLy8gRW5zdXJlIHRoZSByZXNvbHZlZCBwYXRoIGlzIHdpdGhpbiB0aGUgdXBsb2FkcyBkaXJlY3RvcnlcbiAgICAgIGNvbnN0IHJlc29sdmVkUGF0aCA9IHBhdGgucmVzb2x2ZShmaWxlUGF0aCk7XG4gICAgICBjb25zdCByZXNvbHZlZFVwbG9hZHNEaXIgPSBwYXRoLnJlc29sdmUoVVBMT0FEU19ESVIpO1xuICAgICAgaWYgKFxuICAgICAgICAhcmVzb2x2ZWRQYXRoLnN0YXJ0c1dpdGgocmVzb2x2ZWRVcGxvYWRzRGlyICsgcGF0aC5zZXApICYmXG4gICAgICAgIHJlc29sdmVkUGF0aCAhPT0gcmVzb2x2ZWRVcGxvYWRzRGlyXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAwKS5qc29uKHsgZXJyb3I6ICdJbnZhbGlkIGZpbGUgcGF0aCcgfSk7XG4gICAgICB9XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHVubGluayhmaWxlUGF0aCk7XG4gICAgICAgIGxvZ2dlci5sb2coYEZpbGUgZGVsZXRlZCBieSB1c2VyICR7cmVxLnVzZXJJZH06ICR7ZmlsZW5hbWV9YCk7XG4gICAgICAgIHJlcy5qc29uKHsgc3VjY2VzczogdHJ1ZSwgbWVzc2FnZTogJ0ZpbGUgZGVsZXRlZCBzdWNjZXNzZnVsbHknIH0pO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIC8vIEZpbGUgZG9lc24ndCBleGlzdFxuICAgICAgICByZXMuc3RhdHVzKDQwNCkuanNvbih7IGVycm9yOiAnRmlsZSBub3QgZm91bmQnIH0pO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0ZpbGUgZGVsZXRpb24gZXJyb3I6JywgZXJyb3IpO1xuICAgICAgcmVzLnN0YXR1cyg1MDApLmpzb24oeyBlcnJvcjogJ0ZhaWxlZCB0byBkZWxldGUgZmlsZScgfSk7XG4gICAgfVxuICB9KTtcblxuICByZXR1cm4gcm91dGVyO1xufVxuIl19