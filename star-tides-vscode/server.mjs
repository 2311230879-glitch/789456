// 零第三方依赖的本地预览服务器。npm run dev 即可启动。
import { createServer } from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.task': 'application/octet-stream', '.wasm': 'application/wasm' };
const liveReload = `<script>
  const changes = new EventSource('/__stars_events');
  changes.onmessage = event => {
    const update = JSON.parse(event.data);
    if (update.type === 'css') {
      document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
        const url = new URL(link.href); url.searchParams.set('v', Date.now()); link.href = url.href;
      });
    } else location.reload();
  };
</script>`;

export function createPreviewServer() {
  const clients = new Set(), watchers = [];
  let pending = null;
  const server = createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400); res.end('Bad request'); return; }
    if (pathname === '/__stars_events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': connected\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
    }
    if (pathname === '/') pathname = '/index.html';
    // 只提供网站内容；开发配置、测试和服务器源文件不会通过 HTTP 暴露。
    if (!['/index.html', '/styles.css'].includes(pathname) && !/^\/(src|assets)\/[a-zA-Z0-9_./-]+$/.test(pathname)) {
      res.writeHead(404); res.end('Not found'); return;
    }
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
    try {
      const resolved = await realpath(file);
      if (!resolved.startsWith(root + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
      if (!(await stat(resolved)).isFile()) throw new Error('Not a file');
      let body = await readFile(resolved);
      if (pathname === '/index.html') body = Buffer.from(body.toString().replace('</body>', liveReload + '</body>'));
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  for (const dir of [root, path.join(root, 'src'), path.join(root, 'assets')]) {
    const watcher = watch(dir, (_event, filename) => {
      if (!filename || !/\.(html|css|js|svg)$/.test(String(filename))) return;
      clearTimeout(pending);
      pending = setTimeout(() => {
        const type = String(filename).endsWith('.css') ? 'css' : 'reload';
        for (const client of clients) client.write(`data: ${JSON.stringify({ type })}\n\n`);
      }, 150);
    });
    watchers.push(watcher);
  }
  const heartbeat = setInterval(() => { for (const client of clients) client.write(': heartbeat\n\n'); }, 15000);
  heartbeat.unref();
  const dispose = () => {
    clearTimeout(pending); clearInterval(heartbeat);
    for (const watcher of watchers) watcher.close();
    for (const client of clients) client.end();
    server.close();
  };
  return { server, dispose };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--port');
  const port = Number(index > -1 ? process.argv[index + 1] : process.env.PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be 1–65535');
  const preview = createPreviewServer();
  console.log('STARS preview starting');
  preview.server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `Port ${port} is busy. Stop the other preview or run: npm run dev -- --port 4174` : error.message);
    preview.dispose(); process.exitCode = 1;
  });
  preview.server.listen(port, '127.0.0.1', () => {
    console.log(`STARS preview ready: http://127.0.0.1:${port}`);
    console.log('Save HTML / JS to reload. CSS updates without resetting the game. Ctrl+C to stop.');
  });
  process.on('SIGINT', () => { preview.dispose(); process.exit(0); });
  process.on('SIGTERM', () => { preview.dispose(); process.exit(0); });
}
