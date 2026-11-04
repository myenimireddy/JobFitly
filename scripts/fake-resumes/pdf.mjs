/**
 * Sample resume PDF writer via PDFKit (produces pdf-parse-compatible files).
 * Helvetica only; non-ASCII is stripped to ASCII.
 *
 * Requires: (cd scripts/fake-resumes && npm install)
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadPdfkit() {
  try {
    return require('pdfkit');
  } catch {
    try {
      return require(path.join(__dirname, 'node_modules', 'pdfkit'));
    } catch {
      throw new Error(
        'Missing pdfkit. Run: (cd scripts/fake-resumes && npm install)',
      );
    }
  }
}

const PDFDocument = loadPdfkit();

function toAscii(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[^\x20-\x7E\n]/g, '');
}

/**
 * @param {string[]} lines - plain text lines (markdown-ish markers from generate.mjs)
 * @param {{ title?: string }} [meta]
 * @returns {Promise<Buffer>}
 */
export function buildTextPdf(lines, meta = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: 54,
      // Uncompressed streams parse more reliably with older extractors.
      compress: false,
      info: {
        Title: toAscii(meta.title || 'Resume'),
        Producer: 'JobFitly fake-resume generator',
        Creator: 'JobFitly',
      },
    });

    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const pageWidth = 612;
    const left = 54;
    const maxWidth = pageWidth - 54 * 2;
    let y = 54;

    const ensureSpace = (need = 14) => {
      if (y + need > 742) {
        doc.addPage();
        y = 54;
      }
    };

    const drawLine = (text, size = 10, style = '') => {
      const t = toAscii(text);
      ensureSpace(size + 4);
      doc.font(style === 'B' ? 'Helvetica-Bold' : style === 'I' ? 'Helvetica-Oblique' : 'Helvetica');
      doc.fontSize(size);
      doc.fillColor('#000000');
      doc.text(t, left, y, { width: maxWidth, lineBreak: false });
      y += size * 1.3;
    };

    for (const raw of lines) {
      if (raw === '---') {
        ensureSpace(12);
        doc
          .save()
          .strokeColor('#666666')
          .lineWidth(0.5)
          .moveTo(left, y + 2)
          .lineTo(pageWidth - 54, y + 2)
          .stroke()
          .restore();
        y += 10;
        continue;
      }
      if (raw.startsWith('## ')) {
        y += 4;
        drawLine(raw.slice(3), 11, 'B');
        continue;
      }
      if (raw.startsWith('# ')) {
        drawLine(raw.slice(2), 18, 'B');
        y += 4;
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
      if (!String(raw).trim()) {
        y += 6;
        continue;
      }
      ensureSpace(14);
      doc.font('Helvetica').fontSize(10).fillColor('#000000');
      const h = doc.heightOfString(toAscii(raw), { width: maxWidth });
      ensureSpace(h);
      doc.text(toAscii(raw), left, y, { width: maxWidth });
      y += h + 2;
    }

    doc
      .font('Helvetica-Oblique')
      .fontSize(8)
      .fillColor('#666666')
      .text('Fictional JobFitly demo resume - not a real person', left, 760, {
        width: maxWidth,
      });

    doc.end();
  });
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
