const externalTopicBank = 'https://www.ielts.international/teaching-materials/writing-task-2-question-bank';
let onlineTopics;
let topicSource = 'bundled';
let nextTopicRefresh = 0;
let topicRefresh;

const upstreamOrigin = 'https://revise-lab.kevinwentao07.workers.dev';
const endpoints = new Set(['ocr', 'score', 'check', 'practice-task', 'practice', 'tutor', 'hint', 'plan']);
const recent = new Map();
let windowEnd = 0;

const headers = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-cache',
};

function json(data, status = 200) {
  return Response.json(data, { status, headers: { ...headers, 'Cache-Control': 'no-store' } });
}

async function readBody(request, limit) {
  if (Number(request.headers.get('Content-Length')) > limit) return null;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

const externalTypes = new Map([
  ['Opinion (agree or disagree)', 'Opinion'],
  ['Discussion (both views and your opinion)', 'Discussion'],
  ['Advantages and disadvantages', 'Advantages / Disadvantages'],
  ['Problem and solution', 'Problem / Solution'],
  ['Two-part question', 'Two-part question'],
]);

function decodeTopicText(html) {
  const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return html.replace(/<[^>]*>/g, '').replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (raw, code) => {
    if (code.startsWith('#x')) return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCodePoint(Number(code.slice(1)));
    return entities[code] ?? raw;
  }).trim();
}

function parseExternalTopics(html) {
  const topics = [];
  const ids = new Set();
  const types = new Set();
  for (const [, heading, list] of html.matchAll(/<h3\b[^>]*>([^<]+)<\/h3>\s*<p\b[^>]*>[\s\S]*?<\/p>\s*<ol\b[^>]*>([\s\S]*?)<\/ol>/gi)) {
    const type = externalTypes.get(decodeTopicText(heading));
    if (!type) continue;

    for (const [, number, content] of list.matchAll(/<li\b[^>]*>\s*<span\b[^>]*>(\d+)\s*(?:<!--.*?-->)?\.<\/span>\s*<span\b[^>]*>([\s\S]*?)<\/span>\s*<\/li>/gi)) {
      const id = 'ielts-international-' + number;
      const prompt = decodeTopicText(content);
      if (!prompt || ids.has(id)) throw new Error('Invalid external question');
      ids.add(id);
      types.add(type);
      const sentence = prompt.split(/[.!?](?:\s|$)/, 1)[0];
      const words = sentence.split(/\s+/);
      const title = words.length > 9 ? words.slice(0, 9).join(' ') + '…' : sentence;
      topics.push({ id, title, type, theme: 'IELTS.international', prompt, online: true });
    }
  }
  if (types.size !== externalTypes.size) throw new Error('Incomplete external topic bank');
  return topics;
}

async function refreshTopics() {
  try {
    const response = await fetch(externalTopicBank, { signal: AbortSignal.timeout(4_000) });
    if (!response.ok) throw new Error('External topic bank unavailable');
    const bytes = await readBody(response, 2 * 1024 * 1024);
    if (!bytes) throw new Error('External topic bank is too large');
    onlineTopics = parseExternalTopics(new TextDecoder().decode(bytes));
    topicSource = 'ielts.international';
    nextTopicRefresh = Date.now() + 5 * 60_000;
  } catch {
    topicSource = onlineTopics ? 'cached-online' : 'bundled';
    nextTopicRefresh = Date.now() + 60_000;
  }
}

async function topics(method) {
  if (Date.now() >= nextTopicRefresh) {
    topicRefresh ??= refreshTopics().finally(() => { topicRefresh = undefined; });
    await topicRefresh;
  }
  const bank = JSON.parse(assets['/topics.json'].content);
  if (onlineTopics) bank[2].push(...onlineTopics);
  return new Response(method === 'HEAD' ? null : JSON.stringify(bank), {
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'X-Task-2-Source': topicSource },
  });
}

function allowRequest(request) {
  const now = Date.now();
  if (now >= windowEnd) {
    recent.clear();
    windowEnd = now + 60_000;
  }
  const client = request.headers.get('CF-Connecting-IP') || 'local';
  const count = recent.get(client) || 0;
  if (count >= 30) return false;
  recent.set(client, count + 1);
  return true;
}

async function coach(request, env, url) {
  const endpoint = url.pathname.slice(5);
  if (!endpoints.has(endpoint)) return json({ error: 'Not found' }, 404);
  if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);
  const origin = request.headers.get('Origin');
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site' ||
      (origin && origin !== url.origin && origin !== env.REVISELAB_SITE_ORIGIN)) {
    return json({ error: 'Invalid origin' }, 403);
  }
  if (!env.REVISELAB_APP_KEY) return json({ error: 'The writing coach is unavailable.' }, 503);
  if (!allowRequest(request)) return json({ error: 'Too many requests. Try again in a minute.' }, 429);

  const isPhoto = endpoint === 'ocr';
  try {
    const body = await readBody(request, isPhoto ? 15 * 1024 ** 2 : 256 * 1024);
    if (!body) return json({ error: 'Upload is too large.' }, 413);
    const response = await fetch(`${upstreamOrigin}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': isPhoto ? 'application/octet-stream' : 'application/json',
        'X-App-Key': env.REVISELAB_APP_KEY,
      },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(125_000),
    });
    if (response.status >= 300 && response.status < 400) {
      return json({ error: 'The writing coach could not finish this request. Try again.' }, 502);
    }
    const result = await response.json();
    if (response.ok) return json(result);
    if ([400, 413, 415, 422, 429].includes(response.status)) return json(result, response.status);
    if (response.status === 401) return json({ error: 'The writing coach is unavailable.' }, 503);
    return json({ error: 'The writing coach could not finish this request. Try again.' }, 502);
  } catch {
    return json({ error: 'Could not reach the writing coach. Try again.' }, 502);
  }
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return coach(request, env, url);
    if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Use GET' }, 405);
    if (url.pathname === '/health') return json({ ok: true, coach: Boolean(env.REVISELAB_APP_KEY) });
    if (url.pathname === '/topics.json') return topics(request.method);
    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    if (!Object.hasOwn(assets, path)) return json({ error: 'Not found' }, 404);
    const { type, content, binary } = assets[path];
    let body = null;
    if (request.method === 'GET') body = binary ? Uint8Array.from(atob(content), char => char.charCodeAt(0)) : content;
    return new Response(body, { headers: { ...headers, 'Content-Type': type } });
  },
};
