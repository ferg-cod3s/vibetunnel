"use strict";
/**
 * PTY Module Entry Point
 *
 * This module exports all the PTY-related components for easy integration
 * with the existing server code.
 */
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PtyError = exports.SessionManager = exports.PtyManager = exports.ProcessUtils = exports.AsciinemaWriter = void 0;
// Individual components (for advanced usage)
var asciinema_writer_js_1 = require("./asciinema-writer.js");
Object.defineProperty(exports, "AsciinemaWriter", { enumerable: true, get: function () { return asciinema_writer_js_1.AsciinemaWriter; } });
var process_utils_js_1 = require("./process-utils.js");
Object.defineProperty(exports, "ProcessUtils", { enumerable: true, get: function () { return process_utils_js_1.ProcessUtils; } });
// Main service interface
var pty_manager_js_1 = require("./pty-manager.js");
Object.defineProperty(exports, "PtyManager", { enumerable: true, get: function () { return pty_manager_js_1.PtyManager; } });
var session_manager_js_1 = require("./session-manager.js");
Object.defineProperty(exports, "SessionManager", { enumerable: true, get: function () { return session_manager_js_1.SessionManager; } });
// Core types
__exportStar(require("./types.js"), exports);
// Re-export for convenience
var types_js_1 = require("./types.js");
Object.defineProperty(exports, "PtyError", { enumerable: true, get: function () { return types_js_1.PtyError; } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2VydmVyL3B0eS9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7O0dBS0c7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsNkNBQTZDO0FBQzdDLDZEQUF3RDtBQUEvQyxzSEFBQSxlQUFlLE9BQUE7QUFDeEIsdURBQWtEO0FBQXpDLGdIQUFBLFlBQVksT0FBQTtBQUNyQix5QkFBeUI7QUFDekIsbURBQThDO0FBQXJDLDRHQUFBLFVBQVUsT0FBQTtBQUNuQiwyREFBc0Q7QUFBN0Msb0hBQUEsY0FBYyxPQUFBO0FBQ3ZCLGFBQWE7QUFDYiw2Q0FBMkI7QUFFM0IsNEJBQTRCO0FBQzVCLHVDQUFzQztBQUE3QixvR0FBQSxRQUFRLE9BQUEiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFBUWSBNb2R1bGUgRW50cnkgUG9pbnRcbiAqXG4gKiBUaGlzIG1vZHVsZSBleHBvcnRzIGFsbCB0aGUgUFRZLXJlbGF0ZWQgY29tcG9uZW50cyBmb3IgZWFzeSBpbnRlZ3JhdGlvblxuICogd2l0aCB0aGUgZXhpc3Rpbmcgc2VydmVyIGNvZGUuXG4gKi9cblxuLy8gSW5kaXZpZHVhbCBjb21wb25lbnRzIChmb3IgYWR2YW5jZWQgdXNhZ2UpXG5leHBvcnQgeyBBc2NpaW5lbWFXcml0ZXIgfSBmcm9tICcuL2FzY2lpbmVtYS13cml0ZXIuanMnO1xuZXhwb3J0IHsgUHJvY2Vzc1V0aWxzIH0gZnJvbSAnLi9wcm9jZXNzLXV0aWxzLmpzJztcbi8vIE1haW4gc2VydmljZSBpbnRlcmZhY2VcbmV4cG9ydCB7IFB0eU1hbmFnZXIgfSBmcm9tICcuL3B0eS1tYW5hZ2VyLmpzJztcbmV4cG9ydCB7IFNlc3Npb25NYW5hZ2VyIH0gZnJvbSAnLi9zZXNzaW9uLW1hbmFnZXIuanMnO1xuLy8gQ29yZSB0eXBlc1xuZXhwb3J0ICogZnJvbSAnLi90eXBlcy5qcyc7XG5cbi8vIFJlLWV4cG9ydCBmb3IgY29udmVuaWVuY2VcbmV4cG9ydCB7IFB0eUVycm9yIH0gZnJvbSAnLi90eXBlcy5qcyc7XG4iXX0=