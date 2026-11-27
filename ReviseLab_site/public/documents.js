let wordReader;

function loadWordReader() {
  wordReader ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('vendor/mammoth.js', import.meta.url).href;
    script.onload = () => resolve(window.mammoth);
    script.onerror = () => {
      wordReader = undefined;
      script.remove();
      reject(new Error('Could not load the Word reader.'));
    };
    document.head.append(script);
  });
  return wordReader;
}

async function readPdf(file) {
  const pdfjs = await import('./vendor/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.mjs', import.meta.url).href;
  const loading = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    standardFontDataUrl: new URL('vendor/standard_fonts/', import.meta.url).href,
    cMapUrl: new URL('vendor/cmaps/', import.meta.url).href,
    cMapPacked: true,
    isEvalSupported: false,
    useWasm: false,
  });
  const pages = [];
  try {
    const pdf = await loading.promise;
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const page = await pdf.getPage(index);
      const { items } = await page.getTextContent();
      pages.push(items.map(item => item.str === undefined ? '' : item.str + (item.hasEOL ? '\n' : '')).join('').trim());
      page.cleanup();
    }
    return pages.join('\n\n');
  } finally {
    await loading.destroy();
  }
}

export async function readDocument(file) {
  if (/\.(txt|md)$/i.test(file.name)) return (await file.text()).trim();
  try {
    if (/\.pdf$/i.test(file.name)) return (await readPdf(file)).trim();
    if (/\.docx$/i.test(file.name)) {
      const mammoth = await loadWordReader();
      return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value.trim();
    }
  } catch {
    throw new Error('Could not read this document. Try a text file or photo.');
  }
  throw new Error('Choose a PDF, DOCX or text file.');
}
