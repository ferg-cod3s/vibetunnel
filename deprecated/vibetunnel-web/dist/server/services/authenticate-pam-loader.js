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
exports.authenticate = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Helper function to load native module using dlopen
function loadNativeModule(modulePath) {
    const module = { exports: {} };
    process.dlopen(module, modulePath);
    return module.exports;
}
// Try to load authenticate_pam.node
let authenticate;
// Check if we're in SEA mode by looking for the native module next to the executable
const execDir = path.dirname(process.execPath);
const seaPamPath = path.join(execDir, 'authenticate_pam.node');
const seaNativePamPath = path.join(execDir, 'native', 'authenticate_pam.node');
if (fs.existsSync(seaPamPath) || fs.existsSync(seaNativePamPath)) {
    // We're in SEA mode, use dlopen
    const possiblePaths = [
        seaPamPath,
        seaNativePamPath,
        // Try different parent levels for native directory
        ...[1, 2, 3].map((levels) => path.join(__dirname, ...Array(levels).fill('..'), 'native', 'authenticate_pam.node')),
    ];
    let loaded = false;
    for (const modulePath of possiblePaths) {
        if (fs.existsSync(modulePath)) {
            try {
                const nativeModule = loadNativeModule(modulePath);
                if (nativeModule.authenticate) {
                    exports.authenticate = authenticate = nativeModule.authenticate;
                }
                else {
                    throw new Error('Module does not export authenticate function');
                }
                loaded = true;
                break;
            }
            catch (_loadError) {
                // Continue to next path
            }
        }
    }
    if (!loaded) {
        console.warn('Warning: authenticate-pam native module not found. PAM authentication will not work.');
        // Provide a stub implementation
        exports.authenticate = authenticate = (_username, _password, callback) => {
            callback(new Error('PAM authentication not available'));
        };
    }
}
else {
    // Development mode - use regular require
    let loaded = false;
    // First, try the normal require path
    try {
        const pamModule = require('authenticate-pam');
        // Handle both direct export and default export cases
        exports.authenticate = authenticate = pamModule.authenticate || pamModule.default || pamModule;
        loaded = true;
    }
    catch (_error) {
        // Module not found via normal require
    }
    // If normal require failed, try the optional-modules location
    if (!loaded) {
        // Try different parent directory levels for various contexts:
        // 1 level up: bundled context (dist-npm/lib/)
        // 3 levels up: development context (src/server/services/)
        // 2 levels up: alternative bundled location
        const parentLevels = [1, 3, 2];
        const modulePath = [
            'optional-modules',
            'authenticate-pam',
            'build',
            'Release',
            'authenticate_pam.node',
        ];
        for (const levels of parentLevels) {
            const pathSegments = [__dirname, ...Array(levels).fill('..'), ...modulePath];
            const optionalModulePath = path.join(...pathSegments);
            if (fs.existsSync(optionalModulePath)) {
                try {
                    const nativeModule = loadNativeModule(optionalModulePath);
                    if (nativeModule.authenticate) {
                        exports.authenticate = authenticate = nativeModule.authenticate;
                        loaded = true;
                        console.log('Loaded authenticate-pam from optional-modules location:', optionalModulePath);
                        break;
                    }
                }
                catch (_loadError) {
                    // Continue to next path
                }
            }
        }
    }
    if (!loaded) {
        console.warn('Warning: authenticate-pam native module not found. PAM authentication will not work.');
        // Provide a stub implementation
        exports.authenticate = authenticate = (_username, _password, callback) => {
            callback(new Error('PAM authentication not available'));
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aGVudGljYXRlLXBhbS1sb2FkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2VydmVyL3NlcnZpY2VzL2F1dGhlbnRpY2F0ZS1wYW0tbG9hZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLHVDQUF5QjtBQUN6QiwyQ0FBNkI7QUFRN0IscURBQXFEO0FBQ3JELFNBQVMsZ0JBQWdCLENBQUMsVUFBa0I7SUFDMUMsTUFBTSxNQUFNLEdBQUcsRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLENBQUM7SUFDL0IsT0FBTyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsVUFBVSxDQUFDLENBQUM7SUFDbkMsT0FBTyxNQUFNLENBQUMsT0FBTyxDQUFDO0FBQ3hCLENBQUM7QUFFRCxvQ0FBb0M7QUFDcEMsSUFBSSxZQUFrQyxDQUFDO0FBRXZDLHFGQUFxRjtBQUNyRixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztBQUMvQyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSx1QkFBdUIsQ0FBQyxDQUFDO0FBQy9ELE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsUUFBUSxFQUFFLHVCQUF1QixDQUFDLENBQUM7QUFFL0UsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxDQUFDO0lBQ2pFLGdDQUFnQztJQUNoQyxNQUFNLGFBQWEsR0FBRztRQUNwQixVQUFVO1FBQ1YsZ0JBQWdCO1FBQ2hCLG1EQUFtRDtRQUNuRCxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLEVBQUUs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ekMsTUFBTSxHQUFHLElBQUksQ0FBQzt3QkFDZCxPQUFPLENBQUMsR0FBRyxDQUNULHlEQUF5RCxFQUN6RCxrQkFBa0IsQ0FDbkIsQ0FBQzt3QkFDRixNQUFNO29CQUNSLENBQUM7Z0JBQ0gsQ0FBQztnQkFBQyxPQUFPLFVBQVUsRUFBRSxDQUFDO29CQUNwQix3QkFBd0I7Z0JBQzFCLENBQUM7WUFDSCxDQUFDO1FBQ0gsQ0FBQztJQUNILENBQUM7SUFFRCxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDWixPQUFPLENBQUMsSUFBSSxDQUNWLHNGQUFzRixDQUN2RixDQUFDO1FBQ0YsZ0NBQWdDO1FBQ2hDLHVCQUFBLFlBQVksR0FBRyxDQUNiLFNBQWlCLEVBQ2pCLFNBQWlCLEVBQ2pCLFFBQThELEVBQzlELEVBQUU7WUFDRixRQUFRLENBQUMsSUFBSSxLQUFLLENBQUMsa0NBQWtDLENBQUMsQ0FBQyxDQUFDO1FBQzFELENBQUMsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxudHlwZSBBdXRoZW50aWNhdGVGdW5jdGlvbiA9IChcbiAgdXNlcm5hbWU6IHN0cmluZyxcbiAgcGFzc3dvcmQ6IHN0cmluZyxcbiAgY2FsbGJhY2s6IChlcnI6IEVycm9yIHwgbnVsbCwgYXV0aGVudGljYXRlZD86IGJvb2xlYW4pID0+IHZvaWRcbikgPT4gdm9pZDtcblxuLy8gSGVscGVyIGZ1bmN0aW9uIHRvIGxvYWQgbmF0aXZlIG1vZHVsZSB1c2luZyBkbG9wZW5cbmZ1bmN0aW9uIGxvYWROYXRpdmVNb2R1bGUobW9kdWxlUGF0aDogc3RyaW5nKTogeyBhdXRoZW50aWNhdGU/OiBBdXRoZW50aWNhdGVGdW5jdGlvbiB9IHtcbiAgY29uc3QgbW9kdWxlID0geyBleHBvcnRzOiB7fSB9O1xuICBwcm9jZXNzLmRsb3Blbihtb2R1bGUsIG1vZHVsZVBhdGgpO1xuICByZXR1cm4gbW9kdWxlLmV4cG9ydHM7XG59XG5cbi8vIFRyeSB0byBsb2FkIGF1dGhlbnRpY2F0ZV9wYW0ubm9kZVxubGV0IGF1dGhlbnRpY2F0ZTogQXV0aGVudGljYXRlRnVuY3Rpb247XG5cbi8vIENoZWNrIGlmIHdlJ3JlIGluIFNFQSBtb2RlIGJ5IGxvb2tpbmcgZm9yIHRoZSBuYXRpdmUgbW9kdWxlIG5leHQgdG8gdGhlIGV4ZWN1dGFibGVcbmNvbnN0IGV4ZWNEaXIgPSBwYXRoLmRpcm5hbWUocHJvY2Vzcy5leGVjUGF0aCk7XG5jb25zdCBzZWFQYW1QYXRoID0gcGF0aC5qb2luKGV4ZWNEaXIsICdhdXRoZW50aWNhdGVfcGFtLm5vZGUnKTtcbmNvbnN0IHNlYU5hdGl2ZVBhbVBhdGggPSBwYXRoLmpvaW4oZXhlY0RpciwgJ25hdGl2ZScsICdhdXRoZW50aWNhdGVfcGFtLm5vZGUnKTtcblxuaWYgKGZzLmV4aXN0c1N5bmMoc2VhUGFtUGF0aCkgfHwgZnMuZXhpc3RzU3luYyhzZWFOYXRpdmVQYW1QYXRoKSkge1xuICAvLyBXZSdyZSBpbiBTRUEgbW9kZSwgdXNlIGRsb3BlblxuICBjb25zdCBwb3NzaWJsZVBhdGhzID0gW1xuICAgIHNlYVBhbVBhdGgsXG4gICAgc2VhTmF0aXZlUGFtUGF0aCxcbiAgICAvLyBUcnkgZGlmZmVyZW50IHBhcmVudCBsZXZlbHMgZm9yIG5hdGl2ZSBkaXJlY3RvcnlcbiAgICAuLi5bMSwgMiwgM10ubWFwKChsZXZlbHMpID0+XG4gICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCAuLi5BcnJheShsZXZlbHMpLmZpbGwoJy4uJyksICduYXRpdmUnLCAnYXV0aGVudGljYXRlX3BhbS5ub2RlJylcbiAgICApLFxuICBdO1xuXG4gIGxldCBsb2FkZWQgPSBmYWxzZTtcbiAgZm9yIChjb25zdCBtb2R1bGVQYXRoIG9mIHBvc3NpYmxlUGF0aHMpIHtcbiAgICBpZiAoZnMuZXhpc3RzU3luYyhtb2R1bGVQYXRoKSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgbmF0aXZlTW9kdWxlID0gbG9hZE5hdGl2ZU1vZHVsZShtb2R1bGVQYXRoKTtcbiAgICAgICAgaWYgKG5hdGl2ZU1vZHVsZS5hdXRoZW50aWNhdGUpIHtcbiAgICAgICAgICBhdXRoZW50aWNhdGUgPSBuYXRpdmVNb2R1bGUuYXV0aGVudGljYXRlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTW9kdWxlIGRvZXMgbm90IGV4cG9ydCBhdXRoZW50aWNhdGUgZnVuY3Rpb24nKTtcbiAgICAgICAgfVxuICAgICAgICBsb2FkZWQgPSB0cnVlO1xuICAgICAgICBicmVhaztcbiAgICAgIH0gY2F0Y2ggKF9sb2FkRXJyb3IpIHtcbiAgICAgICAgLy8gQ29udGludWUgdG8gbmV4dCBwYXRoXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaWYgKCFsb2FkZWQpIHtcbiAgICBjb25zb2xlLndhcm4oXG4gICAgICAnV2FybmluZzogYXV0aGVudGljYXRlLXBhbSBuYXRpdmUgbW9kdWxlIG5vdCBmb3VuZC4gUEFNIGF1dGhlbnRpY2F0aW9uIHdpbGwgbm90IHdvcmsuJ1xuICAgICk7XG4gICAgLy8gUHJvdmlkZSBhIHN0dWIgaW1wbGVtZW50YXRpb25cbiAgICBhdXRoZW50aWNhdGUgPSAoXG4gICAgICBfdXNlcm5hbWU6IHN0cmluZyxcbiAgICAgIF9wYXNzd29yZDogc3RyaW5nLFxuICAgICAgY2FsbGJhY2s6IChlcnI6IEVycm9yIHwgbnVsbCwgYXV0aGVudGljYXRlZD86IGJvb2xlYW4pID0+IHZvaWRcbiAgICApID0+IHtcbiAgICAgIGNhbGxiYWNrKG5ldyBFcnJvcignUEFNIGF1dGhlbnRpY2F0aW9uIG5vdCBhdmFpbGFibGUnKSk7XG4gICAgfTtcbiAgfVxufSBlbHNlIHtcbiAgLy8gRGV2ZWxvcG1lbnQgbW9kZSAtIHVzZSByZWd1bGFyIHJlcXVpcmVcbiAgbGV0IGxvYWRlZCA9IGZhbHNlO1xuXG4gIC8vIEZpcnN0LCB0cnkgdGhlIG5vcm1hbCByZXF1aXJlIHBhdGhcbiAgdHJ5IHtcbiAgICBjb25zdCBwYW1Nb2R1bGUgPSByZXF1aXJlKCdhdXRoZW50aWNhdGUtcGFtJyk7XG4gICAgLy8gSGFuZGxlIGJvdGggZGlyZWN0IGV4cG9ydCBhbmQgZGVmYXVsdCBleHBvcnQgY2FzZXNcbiAgICBhdXRoZW50aWNhdGUgPSBwYW1Nb2R1bGUuYXV0aGVudGljYXRlIHx8IHBhbU1vZHVsZS5kZWZhdWx0IHx8IHBhbU1vZHVsZTtcbiAgICBsb2FkZWQgPSB0cnVlO1xuICB9IGNhdGNoIChfZXJyb3IpIHtcbiAgICAvLyBNb2R1bGUgbm90IGZvdW5kIHZpYSBub3JtYWwgcmVxdWlyZVxuICB9XG5cbiAgLy8gSWYgbm9ybWFsIHJlcXVpcmUgZmFpbGVkLCB0cnkgdGhlIG9wdGlvbmFsLW1vZHVsZXMgbG9jYXRpb25cbiAgaWYgKCFsb2FkZWQpIHtcbiAgICAvLyBUcnkgZGlmZmVyZW50IHBhcmVudCBkaXJlY3RvcnkgbGV2ZWxzIGZvciB2YXJpb3VzIGNvbnRleHRzOlxuICAgIC8vIDEgbGV2ZWwgdXA6IGJ1bmRsZWQgY29udGV4dCAoZGlzdC1ucG0vbGliLylcbiAgICAvLyAzIGxldmVscyB1cDogZGV2ZWxvcG1lbnQgY29udGV4dCAoc3JjL3NlcnZlci9zZXJ2aWNlcy8pXG4gICAgLy8gMiBsZXZlbHMgdXA6IGFsdGVybmF0aXZlIGJ1bmRsZWQgbG9jYXRpb25cbiAgICBjb25zdCBwYXJlbnRMZXZlbHMgPSBbMSwgMywgMl07XG4gICAgY29uc3QgbW9kdWxlUGF0aCA9IFtcbiAgICAgICdvcHRpb25hbC1tb2R1bGVzJyxcbiAgICAgICdhdXRoZW50aWNhdGUtcGFtJyxcbiAgICAgICdidWlsZCcsXG4gICAgICAnUmVsZWFzZScsXG4gICAgICAnYXV0aGVudGljYXRlX3BhbS5ub2RlJyxcbiAgICBdO1xuXG4gICAgZm9yIChjb25zdCBsZXZlbHMgb2YgcGFyZW50TGV2ZWxzKSB7XG4gICAgICBjb25zdCBwYXRoU2VnbWVudHMgPSBbX19kaXJuYW1lLCAuLi5BcnJheShsZXZlbHMpLmZpbGwoJy4uJyksIC4uLm1vZHVsZVBhdGhdO1xuICAgICAgY29uc3Qgb3B0aW9uYWxNb2R1bGVQYXRoID0gcGF0aC5qb2luKC4uLnBhdGhTZWdtZW50cyk7XG5cbiAgICAgIGlmIChmcy5leGlzdHNTeW5jKG9wdGlvbmFsTW9kdWxlUGF0aCkpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBuYXRpdmVNb2R1bGUgPSBsb2FkTmF0aXZlTW9kdWxlKG9wdGlvbmFsTW9kdWxlUGF0aCk7XG4gICAgICAgICAgaWYgKG5hdGl2ZU1vZHVsZS5hdXRoZW50aWNhdGUpIHtcbiAgICAgICAgICAgIGF1dGhlbnRpY2F0ZSA9IG5hdGl2ZU1vZHVsZS5hdXRoZW50aWNhdGU7XG4gICAgICAgICAgICBsb2FkZWQgPSB0cnVlO1xuICAgICAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgICAgICdMb2FkZWQgYXV0aGVudGljYXRlLXBhbSBmcm9tIG9wdGlvbmFsLW1vZHVsZXMgbG9jYXRpb246JyxcbiAgICAgICAgICAgICAgb3B0aW9uYWxNb2R1bGVQYXRoXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChfbG9hZEVycm9yKSB7XG4gICAgICAgICAgLy8gQ29udGludWUgdG8gbmV4dCBwYXRoXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBpZiAoIWxvYWRlZCkge1xuICAgIGNvbnNvbGUud2FybihcbiAgICAgICdXYXJuaW5nOiBhdXRoZW50aWNhdGUtcGFtIG5hdGl2ZSBtb2R1bGUgbm90IGZvdW5kLiBQQU0gYXV0aGVudGljYXRpb24gd2lsbCBub3Qgd29yay4nXG4gICAgKTtcbiAgICAvLyBQcm92aWRlIGEgc3R1YiBpbXBsZW1lbnRhdGlvblxuICAgIGF1dGhlbnRpY2F0ZSA9IChcbiAgICAgIF91c2VybmFtZTogc3RyaW5nLFxuICAgICAgX3Bhc3N3b3JkOiBzdHJpbmcsXG4gICAgICBjYWxsYmFjazogKGVycjogRXJyb3IgfCBudWxsLCBhdXRoZW50aWNhdGVkPzogYm9vbGVhbikgPT4gdm9pZFxuICAgICkgPT4ge1xuICAgICAgY2FsbGJhY2sobmV3IEVycm9yKCdQQU0gYXV0aGVudGljYXRpb24gbm90IGF2YWlsYWJsZScpKTtcbiAgICB9O1xuICB9XG59XG5cbmV4cG9ydCB7IGF1dGhlbnRpY2F0ZSB9O1xuIl19