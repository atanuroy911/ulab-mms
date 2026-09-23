import path from 'path';
import { readFile } from 'fs/promises';

// Shared pieces for the printable capstone marking sheets (presentation + report). Like the
// attendance/CO-PO exports, these are styled HTML pages the browser prints to PDF.

export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export async function getLogoDataUri(): Promise<string> {
  const svg = await readFile(path.join(process.cwd(), 'app', 'ulab.svg'));
  return `data:image/svg+xml;base64,${svg.toString('base64')}`;
}

export { REPORT_RUBRICS, type ReportCriterion } from '@/lib/capstoneRubrics';
