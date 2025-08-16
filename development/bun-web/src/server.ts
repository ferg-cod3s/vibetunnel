import { serve } from "bun";
import { join } from "path";

const GO_SERVER_URL = process.env.GO_SERVER_URL || "http://localhost:4021";
const PORT = process.env.PORT || 3000;

console.log(`🚀 Starting VibeTunnel Bun Web Interface on port ${PORT}`);
console.log(`🔗 Go server backend: ${GO_SERVER_URL}`);

// Serve static files and proxy API calls to Go server
const server = serve({
  port: PORT,
  
  async fetch(req, server) {
    const url = new URL(req.url);
    
    // Handle WebSocket upgrade requests
    if (url.pathname.startsWith("/ws")) {
      console.log(`🔌 Proxying WebSocket connection: ${url.pathname}`);
      
      // Upgrade to WebSocket and proxy to Go server
      if (server.upgrade(req, {
        data: {
          url: url.toString(),
          pathname: url.pathname,
          search: url.search
        }
      })) {
        return; // Connection was upgraded
      }
      
      return new Response("Failed to upgrade WebSocket connection", { status: 400 });
    }
    
    // Proxy API calls to Go server
    if (url.pathname.startsWith("/api/")) {
      console.log(`📡 Proxying API request: ${req.method} ${url.pathname}`);
      
      // Forward the request to the Go server
      const goUrl = new URL(url.pathname + url.search, GO_SERVER_URL);
      
      try {
        const response = await fetch(goUrl.toString(), {
          method: req.method,
          headers: req.headers,
          body: req.body,
        });
        
        // Return the response from Go server
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } catch (error) {
        console.error(`❌ Error proxying to Go server:`, error);
        return new Response(
          JSON.stringify({ error: "Backend server unavailable" }),
          { 
            status: 502, 
            headers: { "Content-Type": "application/json" }
          }
        );
      }
    }
    
    // Serve static files
    const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const fullPath = join(process.cwd(), "public", filePath);
    
    try {
      const file = Bun.file(fullPath);
      const exists = await file.exists();
      
      if (exists) {
        return new Response(file);
      }
      
      // Fallback to index.html for client-side routing
      if (!url.pathname.startsWith("/api/")) {
        const indexFile = Bun.file(join(process.cwd(), "public", "index.html"));
        return new Response(indexFile);
      }
      
      return new Response("Not Found", { status: 404 });
    } catch (error) {
      console.error(`❌ Error serving file ${filePath}:`, error);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
  
  error(error) {
    console.error("🔥 Server error:", error);
    return new Response("Internal Server Error", { status: 500 });
  },
  
  websocket: {
    async open(ws) {
      const { url, pathname, search } = ws.data;
      console.log(`🔌 WebSocket opened for: ${pathname}${search}`);
      
      try {
        // Create WebSocket connection to Go server
        const goWsUrl = GO_SERVER_URL.replace('http:', 'ws:').replace('https:', 'wss:') + pathname + search;
        ws.goSocket = new WebSocket(goWsUrl);
        
        ws.goSocket.onopen = () => {
          console.log(`✅ Connected to Go server WebSocket: ${goWsUrl}`);
        };
        
        ws.goSocket.onmessage = (event) => {
          // Forward messages from Go server to client
          ws.send(event.data);
        };
        
        ws.goSocket.onclose = (event) => {
          console.log(`🔌 Go server WebSocket closed: ${event.code} ${event.reason}`);
          ws.close(event.code, event.reason);
        };
        
        ws.goSocket.onerror = (error) => {
          console.error(`❌ Go server WebSocket error:`, error);
          ws.close(1011, "Backend WebSocket error");
        };
        
      } catch (error) {
        console.error(`❌ Failed to connect to Go server WebSocket:`, error);
        ws.close(1011, "Failed to connect to backend");
      }
    },
    
    async message(ws, message) {
      // Forward messages from client to Go server
      if (ws.goSocket && ws.goSocket.readyState === WebSocket.OPEN) {
        ws.goSocket.send(message);
      }
    },
    
    async close(ws, code, reason) {
      console.log(`🔌 Client WebSocket closed: ${code} ${reason}`);
      if (ws.goSocket) {
        ws.goSocket.close(code, reason);
      }
    },
    
    async error(ws, error) {
      console.error(`❌ Client WebSocket error:`, error);
      if (ws.goSocket) {
        ws.goSocket.close(1011, "Client WebSocket error");
      }
    }
  }
});

console.log(`✅ VibeTunnel Bun Web Interface running at http://localhost:${server.port}`);
