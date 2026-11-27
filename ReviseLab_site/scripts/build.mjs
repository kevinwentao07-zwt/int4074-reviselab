import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';

const root = new URL('../', import.meta.url);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.pfb': 'application/octet-stream',
  '.ttf': 'font/ttf',
  '.bcmap': 'application/octet-stream',
};
const textExtensions = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.txt']);
async function readAsset(route, filename) {
  const extension = extname(route);
  const type = types[extension];
  if (!type) return [];
  const binary = !textExtensions.has(extension);
  const content = await readFile(new URL(filename, root), binary ? 'base64' : 'utf8');
  return [[route, { type, content, binary }]];
}

async function readDirectory(route, directory) {
  const entries = await readdir(new URL(directory, root), { withFileTypes: true });
  const contents = await Promise.all(entries.map(entry => {
    const name = entry.name;
    if (entry.isDirectory()) return readDirectory(`${route}${name}/`, `${directory}${name}/`);
    if (entry.isFile()) return readAsset(`${route}${name}`, `${directory}${name}`);
    return [];
  }));
  return contents.flat();
}

const files = await Promise.all([
  readDirectory('/', 'public/'),
  readAsset('/vendor/pdf.min.mjs', 'node_modules/pdfjs-dist/legacy/build/pdf.min.mjs'),
  readAsset('/vendor/pdf.worker.min.mjs', 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'),
  readDirectory('/vendor/standard_fonts/', 'node_modules/pdfjs-dist/standard_fonts/'),
  readDirectory('/vendor/cmaps/', 'node_modules/pdfjs-dist/cmaps/'),
  readAsset('/vendor/mammoth.js', 'node_modules/mammoth/mammoth.browser.min.js'),
  readAsset('/vendor/pdf-license.txt', 'node_modules/pdfjs-dist/LICENSE'),
  readAsset('/vendor/standard_fonts/foxit-license.txt', 'node_modules/pdfjs-dist/standard_fonts/LICENSE_FOXIT'),
  readAsset('/vendor/standard_fonts/liberation-license.txt', 'node_modules/pdfjs-dist/standard_fonts/LICENSE_LIBERATION'),
  readAsset('/vendor/cmaps/adobe-license.txt', 'node_modules/pdfjs-dist/cmaps/LICENSE'),
  readAsset('/vendor/mammoth-license.txt', 'node_modules/mammoth/LICENSE'),
]);
const assets = Object.fromEntries(files.flat());
const worker = await readFile(new URL('worker.js', root), 'utf8');
await mkdir(new URL('dist/server/', root), { recursive: true });
await writeFile(new URL('dist/server/index.js', root), `const assets = ${JSON.stringify(assets)};\n${worker}`);
