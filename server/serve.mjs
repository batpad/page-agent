#!/usr/bin/env node
// Tiny optional save server: static files + PUT-to-save (the classic
// TiddlyWiki pattern). Zero dependencies.
//
//   node server/serve.mjs [root] [port]
//
// GET      serves files under root
// OPTIONS  advertises PUT support (the page probes this)
// PUT      writes the request body back to the file (previous version
//          is kept next to it as <name>.bak)

import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const port = Number(process.argv[3] ?? 8440);

const TYPES = {
  '.html': 'text/html;charset=utf-8',
  '.htm': 'text/html;charset=utf-8',
  '.js': 'text/javascript;charset=utf-8',
  '.mjs': 'text/javascript;charset=utf-8',
  '.css': 'text/css;charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function resolveSafe(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const fsPath = path.normalize(path.join(root, clean));
  if (!fsPath.startsWith(root)) return null;
  return fsPath;
}

const server = createServer(async (req, res) => {
  const fsPath = resolveSafe(req.url ?? '/');
  if (!fsPath) {
    res.writeHead(403).end('forbidden');
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(200, { allow: 'GET, PUT, OPTIONS', 'x-pa-save': '1' }).end();
    return;
  }

  if (req.method === 'PUT') {
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      try {
        await fs.copyFile(fsPath, fsPath + '.bak');
      } catch { /* first save of a new file */ }
      await fs.writeFile(fsPath, body);
      console.log(`saved ${path.relative(root, fsPath)} (${body.length} bytes)`);
      res.writeHead(204).end();
    } catch (e) {
      console.error('save failed:', e.message);
      res.writeHead(500).end('save failed');
    }
    return;
  }

  if (req.method === 'GET') {
    let file = fsPath;
    try {
      if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
      const data = await fs.readFile(file);
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' }).end(data);
    } catch {
      res.writeHead(404).end('not found');
    }
    return;
  }

  res.writeHead(405).end();
});

server.listen(port, () => {
  console.log(`Page Agent save server`);
  console.log(`  root: ${root}`);
  console.log(`  open: http://localhost:${port}/template/blank.html`);
  console.log(`Pages served from here save themselves back on Save (old version kept as .bak).`);
});
