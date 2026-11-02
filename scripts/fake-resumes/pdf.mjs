/**
 * Minimal text PDF writer — no npm deps.
 * Builds with Buffers so xref byte offsets stay valid (string/UTF-8 drift caused "bad XRef entry").
 * Helvetica only; non-ASCII is stripped to ASCII.
 */

function toAscii(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[^\x20-\x7E\n]/g, '');
}

function pdfEscape(text) {
  return toAscii(text)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * @param {string[]} lines - plain text lines (will wrap externally)
 * @param {{ title?: string }} [meta]
 * @returns {Buffer}
 */
export function buildTextPdf(lines, meta = {}) {
  const pageWidth = 612;
  const pageHeight = 792;
  const marginLeft = 54;
  const marginTop = 54;
  const fontSize = 10;
  const lineHeight = 13;

  const pages = [];
  let y = pageHeight - marginTop;
  let content = [];

  const flushPage = () => {
    pages.push(content.join('\n'));
    content = [];
    y = pageHeight - marginTop;
  };

  const drawLine = (text, size = fontSize, style = '') => {
    if (y < 54) flushPage();
    const font = style === 'B' ? 'F2' : style === 'I' ? 'F3' : 'F1';
    const yPos = Math.round(y * 100) / 100;
    content.push('BT');
    content.push(`/${font} ${size} Tf`);
    content.push(`${marginLeft} ${yPos} Td`);
    content.push(`(${pdfEscape(text)}) Tj`);
    content.push('ET');
    y -= lineHeight * (size / fontSize);
  };

  for (const raw of lines) {
    if (raw === '---') {
      if (y < 54) flushPage();
      content.push('0.4 w');
      content.push(`${marginLeft} ${y + 4} m ${pageWidth - marginLeft} ${y + 4} l S`);
      y -= 8;
      continue;
    }
    if (raw.startsWith('## ')) {
      drawLine(raw.slice(3), 11, 'B');
      continue;
    }
    if (raw.startsWith('# ')) {
      drawLine(raw.slice(2), 18, 'B');
      y -= 4;
      continue;
    }
    if (raw.startsWith('**') && raw.endsWith('**')) {
      drawLine(raw.slice(2, -2), 10, 'B');
      continue;
    }
    if (raw.startsWith('_') && raw.endsWith('_')) {
      drawLine(raw.slice(1, -1), 9, 'I');
      continue;
    }
    drawLine(raw, fontSize, '');
  }

  const footer = 'Fictional JobFitly demo resume - not a real person';
  if (y < 40) flushPage();
  content.push('BT');
  content.push('/F3 8 Tf');
  content.push(`${marginLeft} 28 Td`);
  content.push(`(${pdfEscape(footer)}) Tj`);
  content.push('ET');
  flushPage();

  /** @type {Buffer[]} */
  const objects = [];
  const add = (body) => {
    objects.push(Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'ascii'));
    return objects.length;
  };

  add('<< /Type /Catalog /Pages 2 0 R >>');
  add(Buffer.from('PAGES_PLACEHOLDER', 'ascii')); // object 2 — replaced below

  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>');

  const contentIds = [];
  for (const pageContent of pages) {
    const stream = Buffer.from(pageContent, 'ascii');
    const id = add(
      Buffer.concat([
        Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'ascii'),
        stream,
        Buffer.from('\nendstream', 'ascii'),
      ]),
    );
    contentIds.push(id);
  }

  const kids = [];
  for (let i = 0; i < pages.length; i++) {
    const id = add(
      [
        '<< /Type /Page',
        `/Parent 2 0 R`,
        `/MediaBox [0 0 ${pageWidth} ${pageHeight}]`,
        `/Contents ${contentIds[i]} 0 R`,
        '/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >>',
        '>>',
      ].join(' '),
    );
    kids.push(`${id} 0 R`);
  }

  objects[1] = Buffer.from(
    `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`,
    'ascii',
  );

  const title = pdfEscape(meta.title || 'Resume');
  add(`<< /Title (${title}) /Producer (JobFitly fake-resume generator) >>`);

  const header = Buffer.from('%PDF-1.4\n', 'ascii');
  const chunks = [header];
  const offsets = [0];
  let size = header.length;

  for (let i = 0; i < objects.length; i++) {
    offsets.push(size);
    const objHeader = Buffer.from(`${i + 1} 0 obj\n`, 'ascii');
    const objFooter = Buffer.from('\nendobj\n', 'ascii');
    chunks.push(objHeader, objects[i], objFooter);
    size += objHeader.length + objects[i].length + objFooter.length;
  }

  const xrefPos = size;
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\n`;
  xref += `startxref\n${xrefPos}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'ascii'));

  return Buffer.concat(chunks);
}

/** @param {string} text @param {number} maxChars */
export function wrapText(text, maxChars = 88) {
  const words = toAscii(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
