import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { SourcePage } from '../shared/blueprint';

export const MAX_PDF_BYTES = 15 * 1024 * 1024;
export const MAX_PAGES = 60;

export class PdfError extends Error {
  constructor(
    public code: 'NOT_PDF' | 'TOO_LARGE' | 'ENCRYPTED' | 'UNREADABLE' | 'NO_TEXT' | 'EMPTY',
    message: string,
    public hint?: string,
  ) {
    super(message);
  }
}

export function checkPdfBytes(bytes: Uint8Array) {
  if (bytes.length === 0) throw new PdfError('EMPTY', 'The uploaded file is empty.');
  if (bytes.length > MAX_PDF_BYTES) throw new PdfError('TOO_LARGE', `The file is ${(bytes.length / 1048576).toFixed(1)} MB. The limit is 15 MB.`, 'Split the PDF or export only the chapter you are studying.');
  const head = Buffer.from(bytes.subarray(0, 1024)).toString('latin1');
  if (!head.includes('%PDF-')) throw new PdfError('NOT_PDF', 'That file is not a PDF.', 'Choose a .pdf file. Word documents and images need to be exported to PDF first.');
}

// Extract readable text per page. The PDF is parsed in memory only; nothing is written to disk,
// and text content is treated as inert data (never evaluated).
export async function extractPages(bytes: Uint8Array): Promise<{ pages: SourcePage[]; totalPages: number; truncated: boolean }> {
  checkPdfBytes(bytes);
  const task = getDocument({ data: new Uint8Array(bytes), disableFontFace: true, useSystemFonts: false, verbosity: 0 });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    await task.destroy().catch(() => {});
    const name = (e as { name?: string })?.name;
    if (name === 'PasswordException') throw new PdfError('ENCRYPTED', 'This PDF is password-protected.', 'Remove the password (e.g. print to a new PDF) and upload again.');
    throw new PdfError('UNREADABLE', 'This PDF could not be read. It may be damaged.', 'Try re-exporting it from the original application.');
  }
  try {
    const totalPages = doc.numPages;
    const n = Math.min(totalPages, MAX_PAGES);
    const pages: SourcePage[] = [];
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let text = '';
      for (const item of content.items) {
        if (!('str' in item)) continue;
        text += item.str;
        text += item.hasEOL ? '\n' : item.str.endsWith(' ') ? '' : ' ';
      }
      text = text
        .replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      pages.push({ page: i, text });
      page.cleanup();
    }
    const chars = pages.reduce((s, p) => s + p.text.replace(/\s/g, '').length, 0);
    if (chars < 200 || chars / n < 40) {
      throw new PdfError(
        'NO_TEXT',
        'Almost no selectable text was found. This looks like a scanned or image-only PDF.',
        'SlothWorld does not include OCR yet. Run the PDF through an OCR tool (e.g. OCRmyPDF) so it has a text layer, then upload it again.',
      );
    }
    return { pages: pages.filter((p) => p.text.length > 0), totalPages, truncated: totalPages > MAX_PAGES };
  } finally {
    await task.destroy();
  }
}
