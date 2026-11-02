/**
 * Minimal single-page (or multi-page) text PDF writer — no npm deps.
 * Helvetica only; ASCII-safe text recommended.
 */

function pdfEscape(text) {
  return String(text)
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
  const maxY = pageHeight - 54;

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
    content.push('BT');
    content.push(`/${font} ${size} Tf`);
    content.push(`${marginLeft} ${y} Td`);
    content.push(`(${pdfEscape(text)}) Tj`);
    content.push('ET');
    y -= lineHeight * (size / fontSize);
  };

  for (const raw of lines) {
    if (raw === '---') {
      // thin rule
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

  // footer on last page buffer before flush
  const footer = 'Fictional JobFitly demo resume - not a real person';
  if (y < 40) flushPage();
  content.push('BT');
  content.push('/F3 8 Tf');
  content.push(`${marginLeft} 28 Td`);
  content.push(`(${pdfEscape(footer)}) Tj`);
  content.push('ET');
  flushPage();

  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };

  add('<< /Type /Catalog /Pages 2 0 R >>');
  const kids = [];
  const pageObjIndexes = [];

  // placeholder for pages dict — object 2
  add('PAGES_PLACEHOLDER');

  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'); // 3 F1
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'); // 4 F2
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>'); // 5 F3

  const contentIds = [];
  for (const pageContent of pages) {
    const stream = pageContent;
    const id = add(
      `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`,
    );
    contentIds.push(id);
  }

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
    pageObjIndexes.push(id);
    kids.push(`${id} 0 R`);
  }

  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;

  const title = pdfEscape(meta.title || 'Resume');
  add(`<< /Title (${title}) /Producer (JobFitly fake-resume generator) >>`);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefPos = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\n`;
  pdf += `startxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

/** @param {string} text @param {number} maxChars */
export function wrapText(text, maxChars = 88) {
  const words = String(text).split(/\s+/);
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
