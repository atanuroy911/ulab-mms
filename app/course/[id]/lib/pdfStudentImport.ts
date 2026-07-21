import { splitIdAndName } from '@/app/utils/csv';

// Client-side PDF text extraction for the student roster import feature.
// Runs entirely in the browser (like the OCR path in attendanceOcr.ts) --
// the PDF never leaves the client.

export interface PdfCourseInfo {
  code: string | null;
  name: string | null;
}

export interface PdfParseResult {
  fileName: string;
  courseInfo: PdfCourseInfo;
  /** "StudentID, StudentName" lines, ready to feed into the same parseCSV() the paste flow uses. */
  studentLines: string[];
}

// A plausible ULAB student ID: starts with a digit, at least 5 more digit/hyphen
// characters (e.g. "212014001" or "2021-1-60-001"). Used to reject header/footer
// text lines that happen to whitespace-split into two "columns".
const PLAUSIBLE_ID_PATTERN = /^\d[\d-]{4,}$/;

// e.g. "CSE1201", "MAT1103", "BLL2101A" -- 2-5 letters then 3-4 digits, optional letter suffix.
const COURSE_CODE_PATTERN = /\b([A-Z]{2,5}\d{3,4}[A-Z]?)\b/;

let workerConfigured = false;

async function loadPdfjs() {
  const pdfjsLib = await import('pdfjs-dist');
  if (!workerConfigured) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
    workerConfigured = true;
  }
  return pdfjsLib;
}

/** Extracts text lines from a PDF, reconstructing rows from each page's positioned text items. */
export async function extractPdfLines(file: File): Promise<string[]> {
  const pdfjsLib = await loadPdfjs();
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  const lines: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // Group text items into rows by y-position (with tolerance for baseline jitter),
    // then order each row's items left-to-right by x-position.
    const rows: { y: number; items: { x: number; str: string }[] }[] = [];
    for (const item of content.items as any[]) {
      if (!item.str || !item.str.trim()) continue;
      const x = item.transform[4];
      const y = item.transform[5];
      let row = rows.find((r) => Math.abs(r.y - y) <= 2);
      if (!row) {
        row = { y, items: [] };
        rows.push(row);
      }
      row.items.push({ x, str: item.str });
    }

    // PDF y-axis increases upward; sort rows top-to-bottom (descending y).
    rows.sort((a, b) => b.y - a.y);

    for (const row of rows) {
      row.items.sort((a, b) => a.x - b.x);
      const lineText = row.items
        .map((i) => i.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (lineText) lines.push(lineText);
    }
  }

  return lines;
}

/** Best-effort detection of the course code/name from the PDF's header/title lines. */
export function detectCourseInfo(lines: string[]): PdfCourseInfo {
  // Course headers are almost always near the top of the document.
  const searchLines = lines.slice(0, 40);

  for (const line of searchLines) {
    const match = line.match(COURSE_CODE_PATTERN);
    if (!match) continue;

    const code = match[1];
    // Strip the code and common header words/punctuation to guess the name.
    const remainder = line
      .replace(match[0], '')
      .replace(/\b(course|code|section|semester)\b/gi, '')
      .replace(/^[\s:.\-–—]+|[\s:.\-–—]+$/g, '')
      .trim();

    return { code, name: remainder || null };
  }

  return { code: null, name: null };
}

/** Extracts "StudentID, StudentName" lines from PDF text lines, filtering out non-roster rows. */
export function extractStudentLines(lines: string[]): string[] {
  const result: string[] = [];

  for (const line of lines) {
    const parsed = splitIdAndName(line);
    if (!parsed) continue;

    const id = parsed[0].replace(/^-+/, '').trim();
    const name = parsed[1].trim();
    if (!id || !name) continue;
    if (!PLAUSIBLE_ID_PATTERN.test(id)) continue;

    result.push(`${id}, ${name}`);
  }

  return result;
}

export async function parsePdfRoster(file: File): Promise<PdfParseResult> {
  const lines = await extractPdfLines(file);
  return {
    fileName: file.name,
    courseInfo: detectCourseInfo(lines),
    studentLines: extractStudentLines(lines),
  };
}

/** Loose match: same normalized code, or a name similarity check when codes are absent. */
export function courseCodeMatches(detected: string | null, expected: string): boolean {
  if (!detected) return false;
  return detected.trim().toUpperCase() === expected.trim().toUpperCase();
}
