// 零依赖 HTTP 服务：静态文件 + JSON API + 独立岛屿链接
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listIslands, getIsland, searchIslands } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function sendFile(res, file) {
  try {
    const buf = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

const ID_RE = /^MY\d{3,}$/i;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = decodeURIComponent(url.pathname);

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }

  // ---- API ----
  if (path === '/api/islands') {
    return sendJson(res, 200, { islands: listIslands({ type: url.searchParams.get('type') }) });
  }
  if (path === '/api/search') {
    const q = url.searchParams.get('q') || '';
    return sendJson(res, 200, { query: q, results: searchIslands(q) });
  }
  const m = path.match(/^\/api\/islands\/([^/]+)$/);
  if (m) {
    if (!ID_RE.test(m[1])) return sendJson(res, 400, { error: 'invalid_id', message: '岛屿 ID 格式应为 MY001' });
    const island = getIsland(m[1]);
    return island ? sendJson(res, 200, { island }) : sendJson(res, 404, { error: 'not_found', message: '找不到这座岛屿' });
  }
  if (path.startsWith('/api/')) return sendJson(res, 404, { error: 'not_found' });

  // ---- 独立岛屿链接：/island/MY003 → 同一个前端页面，由前端读取路径 ----
  if (/^\/island\/[^/]+\/?$/.test(path)) return sendFile(res, join(PUBLIC_DIR, 'index.html'));

  // ---- 静态文件 ----
  const rel = path === '/' ? 'index.html' : normalize(path).replace(/^([/\\])+/, '');
  if (rel.includes('..')) return sendJson(res, 400, { error: 'bad_path' });
  return sendFile(res, join(PUBLIC_DIR, rel));
});

server.listen(PORT, () => console.log(`Malaysia 3D Explore 运行中：http://localhost:${PORT}`));
