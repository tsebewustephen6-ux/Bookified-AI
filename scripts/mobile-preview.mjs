import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('mobile/dist');
const port = Number(process.env.BOOKIFIED_MOBILE_TEST_PORT || 8083);
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = path.resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    if (!path.extname(file)) file = file === root ? path.join(root, 'index.html') : file + '.html';
    try { await stat(file); } catch { file = path.join(root, 'index.html'); }
    response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-store');
    response.end(await readFile(file));
  } catch { response.writeHead(500).end('Export the mobile preview before starting this server.'); }
}).listen(port, '127.0.0.1', () => console.log('Mobile preview ready on port ' + port));
