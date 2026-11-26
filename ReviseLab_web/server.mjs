import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import worker from './worker.mjs';

const env = process.env;
const upstream = env.REVISELAB_UPSTREAM;
const demo = env.REVISELAB_DEMO === '1';
const prefix = (env.BASE_PATH || '').replace(/\/+$/, '');
const endpoints = new Set(['ocr', 'score', 'check', 'practice-task', 'practice', 'tutor', 'hint', 'plan', 'document']);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.wav': 'audio/wav' };
const recent = new Map();
const reset = setInterval(() => recent.clear(), 60_000);
reset.unref();

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const { pathname } = new URL(req.url, 'http://localhost');
  if (prefix && pathname === prefix) {
    res.writeHead(308, { Location: prefix + '/' }).end();
    return;
  }
  if (!pathname.startsWith(prefix + '/')) return json(res, 404, { error: 'Not found' });
  const path = pathname.slice(prefix.length);
  if (path === '/health') return json(res, 200, { ok: true, demo });
  if (path.startsWith('/api/')) {
    const endpoint = path.slice(5);
    if (!endpoints.has(endpoint)) return json(res, 404, { error: 'Not found' });
    if (req.method !== 'POST') return json(res, 405, { error: 'Use POST' });
    if (req.headers.origin) {
      const host = env.PUBLIC_ORIGIN || ('https://' + req.headers.host);
      if (req.headers.origin !== host && req.headers.origin !== 'http://' + req.headers.host)
        return json(res, 403, { error: 'Invalid origin' });
    }
    const client = env.TRUST_PROXY === '1'
      ? String(req.headers['x-forwarded-for'] || '').split(',').at(-1).trim() || req.socket.remoteAddress
      : req.socket.remoteAddress;
    const count = recent.get(client) || 0;
    if (count >= 30) return json(res, 429, { error: 'Too many requests. Try again in a minute.' });
    recent.set(client, count + 1);
    const limit = ['ocr', 'document'].includes(endpoint) ? 15 * 1024 ** 2 : 256 * 1024;
    if (Number(req.headers['content-length']) > limit) return json(res, 413, { error: 'Upload is too large' });
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > limit) {
          req.resume();
          return json(res, 413, { error: 'Upload is too large' });
        }
        chunks.push(chunk);
      }
      if (endpoint === 'document') {
        const bytes = Buffer.concat(chunks);
        try {
          let extracted;
          if (req.headers['content-type'] === 'application/pdf') {
            const { PDFParse } = await import('pdf-parse');
            const parser = new PDFParse({ data: bytes });
            try { extracted = (await parser.getText({ pageJoiner: '' })).text; }
            finally { await parser.destroy(); }
          } else if (req.headers['content-type'] === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const { default: mammoth } = await import('mammoth');
            extracted = (await mammoth.extractRawText({ buffer: bytes })).value;
          }
          if (!extracted?.trim()) return json(res, 422, { error: 'No selectable text found. Try a text file or photo.' });
          return json(res, 200, { text: extracted.trim() });
        } catch {
          return json(res, 422, { error: 'Could not read this document. Try a text file or photo.' });
        }
      }
      const url = new URL('/' + endpoint, upstream || 'http://localhost');
      if (demo) url.searchParams.set('demo', '1');
      const request = new Request(url, {
        method: 'POST',
        headers: { 'Content-Type': endpoint === 'ocr' ? 'application/octet-stream' : 'application/json',
          'X-App-Key': env.APP_KEY || '' },
        body: Buffer.concat(chunks),
        signal: AbortSignal.timeout(125_000)
      });
      const response = upstream ? await fetch(request) : await worker.fetch(request, env);
      res.writeHead(response.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(await response.text());
    } catch {
      if (!res.headersSent) json(res, 502, { error: 'Could not reach the writing coach. Try again.' });
      else res.end();
    }
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Use GET' });
  const file = path === '/' ? 'index.html' : path.slice(1);
  if (!/^(?:[\w-]+\.(?:html|css|js|json)|assets\/[\w-]+\.(?:png|wav|js|mjs))$/.test(file))
    return json(res, 404, { error: 'Not found' });
  try {
    const data = await readFile(new URL('./public/' + file, import.meta.url));
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'text/javascript',
      'Cache-Control': 'no-cache', 'Content-Length': data.length });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    json(res, 404, { error: 'Not found' });
  }
}).listen(Number(env.PORT || 8787), env.HOST || '127.0.0.1', () => {
  console.log('ReviseLab at http://' + (env.HOST || '127.0.0.1') + ':' + (env.PORT || 8787) + prefix + '/');
});
