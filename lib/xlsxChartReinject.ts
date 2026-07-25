// ExcelJS has a well-known limitation: it does not model charts/drawings at all, so reading
// a workbook and writing it back out silently drops any embedded chart. The CO-PO template
// has 3 charts (a grade-distribution bar chart on GradeSheet, and a CO-attainment + a grade-
// distribution chart on CourseSummary) that would otherwise vanish from the alpha export.
//
// This does the OOXML part-copying by hand: pull the chart/drawing XML parts straight out of
// the (untouched) template zip and splice them into the ExcelJS-produced zip, along with the
// relationships and [Content_Types].xml entries that wire them back to their sheets. The only
// content edit needed is shifting the one chart whose data range/anchor lives inside
// GradeSheet's resized student block (chart1) by the same row offset the sheet itself grew or
// shrank by; the two CourseSummary charts reference fixed rows that never move.
import JSZip from 'jszip';
import fs from 'fs';

const CHART1_PATH = 'xl/charts/chart1.xml';
const CHART2_PATH = 'xl/charts/chart2.xml';
const CHART3_PATH = 'xl/charts/chart3.xml';
const DRAWING1_PATH = 'xl/drawings/drawing1.xml';
const DRAWING2_PATH = 'xl/drawings/drawing2.xml';
const DRAWING1_RELS_PATH = 'xl/drawings/_rels/drawing1.xml.rels';
const DRAWING2_RELS_PATH = 'xl/drawings/_rels/drawing2.xml.rels';
// GradeSheet is always the workbook's 1st sheet and CourseSummary the 3rd (see workbook.xml's
// <sheets> order), so ExcelJS names their parts sheet1.xml / sheet3.xml consistently.
const GRADE_SHEET_PART = 'xl/worksheets/sheet1.xml';
const COURSE_SUMMARY_PART = 'xl/worksheets/sheet3.xml';

function shiftAbsoluteRowRefs(xml: string, shift: number): string {
  if (!shift) return xml;
  return xml.replace(/\$([A-Z]+)\$(\d+)/g, (_match, col, row) => `$${col}$${Number(row) + shift}`);
}

function shiftDrawingAnchorRow(xml: string, shift: number): string {
  if (!shift) return xml;
  // Only the first <xdr:row> (inside <xdr:from>) matters for a oneCellAnchor chart.
  let replaced = false;
  return xml.replace(/<xdr:row>(\d+)<\/xdr:row>/, (match, row) => {
    if (replaced) return match;
    replaced = true;
    return `<xdr:row>${Number(row) + shift}</xdr:row>`;
  });
}

function addDrawingRelToSheet(xml: string): string {
  if (xml.includes('<drawing ')) return xml;
  if (xml.includes('<extLst>')) return xml.replace('<extLst>', '<drawing r:id="rId1"/><extLst>');
  return xml.replace('</worksheet>', '<drawing r:id="rId1"/></worksheet>');
}

const DRAWING_RELS_XML = (target: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/${target}"/></Relationships>`;

/**
 * Re-injects the template's charts into an ExcelJS-produced workbook buffer.
 * @param gradeSheetRowShift how many rows GradeSheet's student block grew (+) or shrank (-)
 *   by relative to the 50-row template - the only thing chart1's range/anchor depends on.
 */
export async function reinjectTemplateCharts(
  workbookBuffer: Buffer,
  templatePath: string,
  gradeSheetRowShift: number,
): Promise<Buffer> {
  const templateZip = await JSZip.loadAsync(fs.readFileSync(templatePath));
  const outZip = await JSZip.loadAsync(workbookBuffer);

  const readTemplatePart = async (partPath: string) => {
    const file = templateZip.file(partPath);
    if (!file) throw new Error(`Template is missing expected part: ${partPath}`);
    return file.async('string');
  };

  const [chart1, chart2, chart3, drawing1, drawing2, drawing1Rels, drawing2Rels] = await Promise.all([
    readTemplatePart(CHART1_PATH),
    readTemplatePart(CHART2_PATH),
    readTemplatePart(CHART3_PATH),
    readTemplatePart(DRAWING1_PATH),
    readTemplatePart(DRAWING2_PATH),
    readTemplatePart(DRAWING1_RELS_PATH),
    readTemplatePart(DRAWING2_RELS_PATH),
  ]);

  outZip.file(CHART1_PATH, shiftAbsoluteRowRefs(chart1, gradeSheetRowShift));
  outZip.file(CHART2_PATH, chart2);
  outZip.file(CHART3_PATH, chart3);
  outZip.file(DRAWING1_PATH, shiftDrawingAnchorRow(drawing1, gradeSheetRowShift));
  outZip.file(DRAWING2_PATH, drawing2);
  // These are the drawings' *own* relationships to their charts (rId1 -> ../charts/chart1.xml,
  // etc) - copied verbatim from the template, since the chart <-> drawing wiring itself never
  // changes. This must not be confused with the *worksheet's* relationship to its drawing
  // (sheet1.xml.rels / sheet3.xml.rels below), which is a different relationship entirely.
  outZip.file(DRAWING1_RELS_PATH, drawing1Rels);
  outZip.file(DRAWING2_RELS_PATH, drawing2Rels);

  const gradeSheetXml = await outZip.file(GRADE_SHEET_PART)?.async('string');
  const courseSummaryXml = await outZip.file(COURSE_SUMMARY_PART)?.async('string');
  if (!gradeSheetXml || !courseSummaryXml) {
    throw new Error('ExcelJS output is missing expected worksheet parts');
  }
  outZip.file(GRADE_SHEET_PART, addDrawingRelToSheet(gradeSheetXml));
  outZip.file(COURSE_SUMMARY_PART, addDrawingRelToSheet(courseSummaryXml));
  outZip.file('xl/worksheets/_rels/sheet1.xml.rels', DRAWING_RELS_XML('drawing1.xml'));
  outZip.file('xl/worksheets/_rels/sheet3.xml.rels', DRAWING_RELS_XML('drawing2.xml'));

  const contentTypesXml = await outZip.file('[Content_Types].xml')?.async('string');
  if (!contentTypesXml) {
    throw new Error('ExcelJS output is missing [Content_Types].xml');
  }
  const chartContentType = 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml';
  const drawingContentType = 'application/vnd.openxmlformats-officedocument.drawing+xml';
  const newOverrides = [
    ['xl/drawings/drawing1.xml', drawingContentType],
    ['xl/drawings/drawing2.xml', drawingContentType],
    ['xl/charts/chart1.xml', chartContentType],
    ['xl/charts/chart2.xml', chartContentType],
    ['xl/charts/chart3.xml', chartContentType],
  ]
    .map(([part, type]) => `<Override PartName="/${part}" ContentType="${type}"/>`)
    .join('');
  outZip.file('[Content_Types].xml', contentTypesXml.replace('</Types>', `${newOverrides}</Types>`));

  // JSZip defaults to no compression at all, which would bloat the file far past what
  // ExcelJS's own (deflated) output was - match ExcelJS's compression instead.
  const result = await outZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return result;
}
