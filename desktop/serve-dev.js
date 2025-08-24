const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 1420;
const DIST_DIR = path.join(__dirname, 'dist');

const server = http.createServer((req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  
  let filePath = path.join(DIST_DIR, req.url === '/' ? 'index.html' : req.url);
  
  // Security check
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    filePath = path.join(DIST_DIR, 'index.html'); // Fallback to index.html for SPA
  }
  
  // Determine content type
  const ext = path.extname(filePath);
  const contentType = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon'
  }[ext] || 'text/plain';
  
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end(content);
  } catch (error) {
    console.error('Error serving file:', error);
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 Dev server running at http://localhost:${PORT}`);
  console.log(`📁 Serving files from: ${DIST_DIR}`);
  console.log(`🔧 Ready for Tauri dev mode\n`);
});
