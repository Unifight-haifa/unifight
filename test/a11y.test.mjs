import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const hasPlaywright = spawnSync('python3', ['-c', 'import playwright'], { stdio: 'ignore' }).status === 0;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

test('axe finds no serious or critical WCAG 2.1 AA issues; menu and motion controls work', { skip: !hasPlaywright && 'needs Python Playwright' }, async () => {
  const base = (process.env.BASE_PATH || '/unifight').replace(/\/?$/, '/');
  const srv = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = join(dist, path.slice(base.length));
    if (!path.startsWith(base) || !existsSync(file)) return res.writeHead(404).end();
    if (statSync(file).isDirectory()) file = join(file, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  try {
    const url = `http://127.0.0.1:${srv.address().port}${base}`;
    const out = await new Promise((ok, fail) =>
      execFile('python3', [new URL('a11y_browser.py', import.meta.url).pathname, url], (err, stdout, stderr) => (err ? fail(new Error(stderr)) : ok(stdout))),
    );
    assert.equal(out.trim(), 'ok');
  } finally {
    srv.close();
  }
});
