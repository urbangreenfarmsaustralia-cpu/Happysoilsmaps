import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractSoilTestText } from '../src/soil-test';
import type { SoilTestExtraction } from '../src/intelligence-types';

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const document = await getDocument({ data: bytes }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let currentLine = '';
    let previousY: number | null = null;
    for (const item of content.items) {
      if (!('str' in item) || !item.str) continue;
      const y = 'transform' in item ? item.transform[5] : null;
      if (currentLine && y !== null && previousY !== null && Math.abs(y - previousY) > 2) {
        lines.push(currentLine.trim());
        currentLine = '';
      }
      currentLine += `${currentLine ? ' ' : ''}${item.str}`;
      if ('hasEOL' in item && item.hasEOL) {
        lines.push(currentLine.trim());
        currentLine = '';
      }
      previousY = y;
    }
    if (currentLine.trim()) lines.push(currentLine.trim());
    pages.push(lines.filter(Boolean).join('\n'));
  }
  return pages.join('\n');
}

export async function extractSoilTest(
  bytes: Uint8Array,
  filename: string,
  contentType: string,
): Promise<SoilTestExtraction> {
  const isPdf = contentType.includes('pdf') || filename.toLowerCase().endsWith('.pdf');
  const text = isPdf ? await extractPdfText(bytes) : new TextDecoder().decode(bytes);
  return extractSoilTestText(text, filename);
}
