export type ExcelExportField =
  | 'course.code'
  | 'course.name'
  | 'course.section'
  | 'course.semesterYear'
  | 'course.credit'
  | 'instructor'
  | 'student.name'
  | 'student.studentId'
  | 'mark.attendance'
  | 'mark.classPerformance'
  | 'mark.quiz'
  | 'mark.assignment'
  | 'mark.midterm'
  | 'mark.project'
  | 'mark.final'
  | 'weight.attendance'
  | 'weight.classPerformance'
  | 'weight.quiz'
  | 'weight.assignment'
  | 'weight.midterm'
  | 'weight.project'
  | 'weight.final'
  | 'co.midterm.1' | 'co.midterm.2' | 'co.midterm.3' | 'co.midterm.4' | 'co.midterm.5' | 'co.midterm.6'
  | 'co.final.1' | 'co.final.2' | 'co.final.3' | 'co.final.4' | 'co.final.5' | 'co.final.6'
  | 'co.project.1' | 'co.project.2' | 'co.project.3' | 'co.project.4' | 'co.project.5' | 'co.project.6';

export interface ExcelExportSingleCellMapping {
  sheetName?: string;
  field: ExcelExportField;
  cell: string;
}

export interface ExcelExportRangeMapping {
  sheetName?: string;
  field: ExcelExportField;
  from: string;
  to: string;
}

export interface ExcelExportMapping {
  sheetName?: string;
  singleCells?: ExcelExportSingleCellMapping[];
  rangeMappings?: ExcelExportRangeMapping[];
}

export const EXCEL_EXPORT_FIELD_OPTIONS: Array<{ label: string; value: ExcelExportField }> = [
  { label: 'Course Code', value: 'course.code' },
  { label: 'Course Title', value: 'course.name' },
  { label: 'Course Section', value: 'course.section' },
  { label: 'Semester (e.g. Summer 2026)', value: 'course.semesterYear' },
  { label: 'Credit', value: 'course.credit' },
  { label: 'Instructor', value: 'instructor' },
  { label: 'Student Name', value: 'student.name' },
  { label: 'Student ID', value: 'student.studentId' },
  { label: 'Attendance Mark', value: 'mark.attendance' },
  { label: 'Class Performance Mark', value: 'mark.classPerformance' },
  { label: 'Quiz Mark', value: 'mark.quiz' },
  { label: 'Assignment Mark', value: 'mark.assignment' },
  { label: 'Mid Exam Mark', value: 'mark.midterm' },
  { label: 'Project Mark', value: 'mark.project' },
  { label: 'Final Exam Mark', value: 'mark.final' },
  { label: 'CO Midterm 1', value: 'co.midterm.1' },
  { label: 'CO Midterm 2', value: 'co.midterm.2' },
  { label: 'CO Midterm 3', value: 'co.midterm.3' },
  { label: 'CO Midterm 4', value: 'co.midterm.4' },
  { label: 'CO Midterm 5', value: 'co.midterm.5' },
  { label: 'CO Midterm 6', value: 'co.midterm.6' },
  { label: 'CO Final 1', value: 'co.final.1' },
  { label: 'CO Final 2', value: 'co.final.2' },
  { label: 'CO Final 3', value: 'co.final.3' },
  { label: 'CO Final 4', value: 'co.final.4' },
  { label: 'CO Final 5', value: 'co.final.5' },
  { label: 'CO Final 6', value: 'co.final.6' },
  { label: 'CO Project 1', value: 'co.project.1' },
  { label: 'CO Project 2', value: 'co.project.2' },
  { label: 'CO Project 3', value: 'co.project.3' },
  { label: 'CO Project 4', value: 'co.project.4' },
  { label: 'CO Project 5', value: 'co.project.5' },
  { label: 'CO Project 6', value: 'co.project.6' },
];

export const DEFAULT_EXCEL_EXPORT_MAPPING: ExcelExportMapping = {
  sheetName: 'GradeSheet',
  singleCells: [
    { field: 'course.code', cell: 'H2' },
    { field: 'course.name', cell: 'H3' },
    { field: 'course.credit', cell: 'H4' },
    { field: 'instructor', cell: 'H5' },
    { field: 'course.section', cell: 'L2' },
    { field: 'course.semesterYear', cell: 'L3' },
    { field: 'weight.attendance', cell: 'C72' },
    { field: 'weight.classPerformance', cell: 'C73' },
    { field: 'weight.quiz', cell: 'C74' },
    { field: 'weight.assignment', cell: 'C75' },
    { field: 'weight.midterm', cell: 'C76' },
    { field: 'weight.project', cell: 'C77' },
    { field: 'weight.final', cell: 'C78' },
  ],
  // GradeSheet student rows: 10-69 (60 students). CO_PO_AttainmentAnalysis student rows: 15-74
  // (same 60 students, offset by 5 rows since its header block is taller). Keep these in sync
  // with the row layout of public/templates/Sample CO PO.xlsx if the template is ever resized.
  rangeMappings: [
    { field: 'student.studentId', from: 'X10', to: 'X69' },
    { field: 'student.name', from: 'W10', to: 'W69' },
    { field: 'mark.attendance', from: 'P10', to: 'P69' },
    { field: 'mark.classPerformance', from: 'Q10', to: 'Q69' },
    { field: 'mark.quiz', from: 'R10', to: 'R69' },
    { field: 'mark.assignment', from: 'S10', to: 'S69' },
    { field: 'mark.midterm', from: 'T10', to: 'T69' },
    { field: 'mark.project', from: 'U10', to: 'U69' },
    { field: 'mark.final', from: 'V10', to: 'V69' },
    { sheetName: 'CO_PO_AttainmentAnalysis', field: 'co.midterm.1', from: 'D15', to: 'D74' },
    { sheetName: 'CO_PO_AttainmentAnalysis', field: 'co.midterm.2', from: 'E15', to: 'E74' },
    { sheetName: 'CO_PO_AttainmentAnalysis', field: 'co.midterm.3', from: 'F15', to: 'F74' },
    { sheetName: 'CO_PO_AttainmentAnalysis', field: 'co.midterm.4', from: 'G15', to: 'G74' },
    { sheetName: 'CO_PO_AttainmentAnalysis', field: 'co.midterm.5', from: 'H15', to: 'H74' },
    { sheetName: 'CO_PO_AttainmentAnalysis', field: 'co.midterm.6', from: 'I15', to: 'I74' },
    { sheetName: 'CO_PO_AttainmentAnalysis', field: 'co.final.1', from: 'J15', to: 'J74' },
    { sheetName: 'CO_PO_AttainmentAnalysis', field: 'co.final.2', from: 'K15', to: 'K74' },
    { sheetName: 'CO_PO_AttainmentAnalysis', field: 'co.final.3', from: 'L15', to: 'L74' },
    { sheetName: 'CO_PO_AttainmentAnalysis', field: 'co.final.4', from: 'M15', to: 'M74' },
    { sheetName: 'CO_PO_AttainmentAnalysis', field: 'co.final.5', from: 'N15', to: 'N74' },
    { sheetName: 'CO_PO_AttainmentAnalysis', field: 'co.final.6', from: 'O15', to: 'O74' },
    { sheetName: 'CO_PO_AttainmentAnalysis', field: 'co.project.1', from: 'P15', to: 'P74' },
    { sheetName: 'CO_PO_AttainmentAnalysis', field: 'co.project.2', from: 'Q15', to: 'Q74' },
    { sheetName: 'CO_PO_AttainmentAnalysis', field: 'co.project.3', from: 'R15', to: 'R74' },
    { sheetName: 'CO_PO_AttainmentAnalysis', field: 'co.project.4', from: 'S15', to: 'S74' },
    { sheetName: 'CO_PO_AttainmentAnalysis', field: 'co.project.5', from: 'T15', to: 'T74' },
    { sheetName: 'CO_PO_AttainmentAnalysis', field: 'co.project.6', from: 'U15', to: 'U74' },
  ],
};
