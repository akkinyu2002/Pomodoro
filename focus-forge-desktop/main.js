const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const WEB_ROOT = path.join(__dirname, 'build', 'web');
let server;
let mainWindow;

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js': return 'application/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.webmanifest': return 'application/manifest+json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.ico': return 'image/x-icon';
    case '.txt': return 'text/plain; charset=utf-8';
    default: return 'application/octet-stream';
  }
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

function resolveRequestPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const normalized = path.normalize(decoded).replace(/^([.]{2}[\\/])+/, '').replace(/^[\\/]+/, '');
  if (normalized === '/' || normalized === '.' || normalized === path.sep) {
    return path.join(WEB_ROOT, 'index.html');
  }
  return path.join(WEB_ROOT, normalized);
}

function createServer() {
  return http.createServer((req, res) => {
    const urlPath = new URL(req.url, 'http://127.0.0.1').pathname;

    if (urlPath === '/api/auth-config') {
      return sendJson(res, 200, { google: false });
    }

    if (urlPath === '/api/me') {
      return sendJson(res, 401, { error: 'Not signed in' });
    }

    if (urlPath === '/api/signout' && req.method === 'POST') {
      return sendJson(res, 200, { ok: true });
    }

    if (urlPath === '/api/local-signin' && req.method === 'POST') {
      return sendJson(res, 501, { error: 'Local sign-in is not enabled in the desktop wrapper.' });
    }

    if (urlPath === '/api/sync' && req.method === 'GET') {
      return sendJson(res, 401, { error: 'Not signed in' });
    }

    const filePath = resolveRequestPath(urlPath);
    const candidate = fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? filePath : path.join(WEB_ROOT, 'index.html');
    const buffer = safeRead(candidate);

    if (!buffer) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentTypeFor(candidate),
      'Cache-Control': 'no-store'
    });
    res.end(buffer);
  });
}

async function startApp() {
  server = createServer();

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const { port } = server.address();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 1040,
    minWidth: 980,
    minHeight: 720,
    backgroundColor: '#071016',
    title: 'Focus Forge',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(startApp);

app.on('window-all-closed', () => {
  if (server) {
    server.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    startApp();
  }
});
