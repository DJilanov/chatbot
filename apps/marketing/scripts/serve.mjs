import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createServer } from 'node:http';

const root = new URL('../public/', import.meta.url);
const port = Number(process.env.PORT || 4173);
const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${port}`);
  const safePath = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
  const relative = safePath === '/' ? 'index.html' : safePath.replace(/^[/\\]/, '');
  const candidates = candidateFiles(relative);
  try {
    const file = await firstExistingFile(candidates);
    res.writeHead(200, { 'Content-Type': types.get(extname(file)) || 'application/octet-stream' });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}).listen(port, () => {
  process.stdout.write(`Marketing page listening on http://localhost:${port}\n`);
});

function candidateFiles(relative) {
  const normalized = relative.replace(/^[/\\]/, '');
  const candidates = [join(root.pathname, normalized)];
  if (normalized.endsWith('/')) {
    candidates.push(join(root.pathname, normalized, 'index.html'));
  } else if (!extname(normalized)) {
    candidates.push(join(root.pathname, `${normalized}.html`));
    candidates.push(join(root.pathname, normalized, 'index.html'));
  }
  return candidates;
}

async function firstExistingFile(candidates) {
  for (const file of candidates) {
    const info = await stat(file).catch(() => null);
    if (info?.isFile()) return file;
  }
  throw new Error('not_found');
}
