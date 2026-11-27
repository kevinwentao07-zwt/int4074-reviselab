import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import worker from '../dist/server/index.js';

const env = { ...process.env };
const port = Number(env.PORT ?? 8787);

createServer(async (request, response) => {
  try {
    const hasBody = !['GET', 'HEAD'].includes(request.method);
    const result = await worker.fetch(new Request(new URL(request.url, `http://${request.headers.host}`), {
      method: request.method,
      headers: request.headers,
      ...(hasBody ? { body: Readable.toWeb(request), duplex: 'half' } : {}),
    }), env);
    response.writeHead(result.status, Object.fromEntries(result.headers));
    if (result.body) Readable.fromWeb(result.body).pipe(response);
    else response.end();
  } catch {
    response.writeHead(500).end();
  }
}).listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}/`));
