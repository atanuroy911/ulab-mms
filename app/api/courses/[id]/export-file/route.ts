/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Course from '@/models/Course';
import Student from '@/models/Student';
import Exam from '@/models/Exam';
import Mark from '@/models/Mark';
import AttendanceSession from '@/models/AttendanceSession';
import ProjectGroup from '@/models/ProjectGroup';
import fs from 'fs';
import path from 'path';
import XlsxPopulate from 'xlsx-populate';
import {
  DEFAULT_EXCEL_EXPORT_MAPPING,
  type ExcelExportField,
  type ExcelExportMapping,
} from '@/app/course/[id]/lib/excelExportMapping';
import { findFinalExam, computeAttendanceByStudent, ATTENDANCE_AT_RISK_THRESHOLD, getProjectCoMarksByStudent } from '@/lib/coPoCalculations';

function normalizeMapping(mapping: any): ExcelExportMapping {
  if (!mapping) return DEFAULT_EXCEL_EXPORT_MAPPING;

  return {
    sheetName: mapping.sheetName || 'GradeSheet',
    singleCells: Array.isArray(mapping.singleCells) ? mapping.singleCells : DEFAULT_EXCEL_EXPORT_MAPPING.singleCells || [],
    rangeMappings: Array.isArray(mapping.rangeMappings) ? mapping.rangeMappings : DEFAULT_EXCEL_EXPORT_MAPPING.rangeMappings || [],
  };
}

function getMark(studentId: string, examId: string, marks: any[]) {
  return marks.find(m => String(m.studentId) === String(studentId) && String(m.examId) === String(examId));
}

function getMarkValue(student: any, exams: any[], marks: any[], category: string) {
  const exam = exams.find(e => e.examCategory === category);
  if (!exam) return 0;
  const mark = getMark(student._id, exam._id, marks);
  if (!mark) return 0;
  const weighted = getWeightedContribution(mark.rawMark, exam.totalMarks, exam.weightage || 0);
  return Math.round(weighted * 100) / 100;
}

function getMarkValueForMid(student: any, exams: any[], marks: any[]) {
  const exam = exams.find(e => e.examType === 'midterm' || e.displayName?.toLowerCase().includes('mid'));
  if (!exam) return 0;
  const mark = getMark(student._id, exam._id, marks);
  return mark ? mark.rawMark : 0;
}

function getMarkValueForFinal(student: any, exams: any[], marks: any[]) {
  const exam = exams.find(e => e.examType === 'final' || e.displayName?.toLowerCase().includes('final'));
  if (!exam) return 0;
  const mark = getMark(student._id, exam._id, marks);
  return mark ? mark.rawMark : 0;
}

function getExamWeight(exams: any[], category: string) {
  const exam = exams.find(e => e.examCategory === category);
  return exam ? (exam.weightage || 0) : 0;
}

function getMidtermWeight(exams: any[]) {
  const exam = exams.find(e => e.examType === 'midterm' || e.displayName?.toLowerCase().includes('mid'));
  return exam ? (exam.weightage || 0) : 0;
}

function getFinalWeight(exams: any[]) {
  const exam = exams.find(e => e.examType === 'final' || e.displayName?.toLowerCase().includes('final'));
  return exam ? (exam.weightage || 0) : 0;
}

function getExamPercentage(rawMark: number, totalMarks: number) {
  if (!totalMarks || totalMarks <= 0) return 0;
  return (rawMark / totalMarks) * 100;
}

function getCOMarkValueForMid(student: any, exams: any[], marks: any[], coIndex: number) {
  const exam = exams.find(e => e.examType === 'midterm' || e.displayName?.toLowerCase().includes('mid'));
  if (!exam) return 0;
  const mark = getMark(student._id, exam._id, marks);
  return mark?.coMarks?.[coIndex] !== undefined ? mark.coMarks[coIndex] : 0;
}

function getCOMarkValueForFinal(student: any, exams: any[], marks: any[], coIndex: number) {
  const exam = exams.find(e => e.examType === 'final' || e.displayName?.toLowerCase().includes('final'));
  if (!exam) return 0;
  const mark = getMark(student._id, exam._id, marks);
  return mark?.coMarks?.[coIndex] !== undefined ? mark.coMarks[coIndex] : 0;
}

function getCOMarkValueForProject(
  student: any,
  exams: any[],
  marks: any[],
  coIndex: number,
  projectCoByStudent: Record<string, number[]> = {}
) {
  // Combined Project/OEL CO marks live on ProjectGroup.groups[].coMarks (shared across every
  // Project-category exam), not on any single exam's Mark record - check that first.
  const combined = projectCoByStudent[String(student._id)];
  if (combined) return combined[coIndex] ?? 0;

  const exam = exams.find(e => e.examCategory === 'Project');
  if (!exam) return 0;
  const mark = getMark(student._id, exam._id, marks);
  return mark?.coMarks?.[coIndex] !== undefined ? mark.coMarks[coIndex] : 0;
}

function getWeightedContribution(rawMark: number, totalMarks: number, weightage: number) {
  return (getExamPercentage(rawMark, totalMarks) * weightage) / 100;
}

function getAggregatedMarkValue(student: any, exams: any[], marks: any[], category: 'Quiz' | 'Assignment', course: any) {
  const categoryExams = exams.filter(e => e.examCategory === category);
  if (categoryExams.length === 0) return 0;

  const categoryMarks = categoryExams
    .map(exam => getMark(student._id, exam._id, marks))
    .filter(mark => mark !== undefined);

  if (categoryMarks.length === 0) return 0;

  const aggregationMethod = category === 'Quiz'
    ? course?.quizAggregation || 'average'
    : course?.assignmentAggregation || 'average';

  const categoryWeightage = category === 'Quiz'
    ? Number(course?.quizWeightage || 0)
    : Number(course?.assignmentWeightage || 0);

  if (aggregationMethod === 'best') {
    let bestMark = categoryMarks[0];
    let bestValue = -1;

    categoryMarks.forEach(mark => {
      const exam = categoryExams.find(e => String(e._id) === String(mark.examId));
      if (exam) {
        const percentage = getExamPercentage(mark.rawMark, exam.totalMarks);
        if (percentage > bestValue) {
          bestValue = percentage;
          bestMark = mark;
        }
      }
    });

    const bestExam = categoryExams.find(e => String(e._id) === String(bestMark.examId));
    return bestExam ? getWeightedContribution(bestMark.rawMark, bestExam.totalMarks, categoryWeightage) : 0;
  } else if (aggregationMethod === 'sum') {
    const sumRaw = categoryMarks.reduce((sum, mark) => sum + mark.rawMark, 0);
    const sumTotal = categoryMarks.reduce((sum, mark) => {
      const exam = categoryExams.find(e => String(e._id) === String(mark.examId));
      return exam ? sum + exam.totalMarks : sum;
    }, 0);

    return sumTotal > 0 ? (getExamPercentage(sumRaw, sumTotal) * categoryWeightage) / 100 : 0;
  } else {
    const averagePercentage = categoryMarks.reduce((sum, mark) => {
      const exam = categoryExams.find(e => String(e._id) === String(mark.examId));
      if (!exam) return sum;
      return sum + getExamPercentage(mark.rawMark, exam.totalMarks);
    }, 0) / categoryMarks.length;

    return (averagePercentage * categoryWeightage) / 100;
  }
}

function getProjectAggregatedMarkValue(student: any, exams: any[], marks: any[], course: any) {
  const projectExams = exams.filter(e => e.examCategory === 'Project');
  if (projectExams.length === 0) return 0;
  
  const projectMarks = projectExams
    .map(e => ({ exam: e, mark: getMark(student._id, e._id, marks) }))
    .filter(x => x.mark !== undefined);
    
  if (projectMarks.length === 0) return 0;
  
  const sumRaw = projectMarks.reduce((s, x) => s + Number(x.mark!.rawMark || 0), 0);
  const sumTotal = projectExams.reduce((s, e) => s + Number(e.totalMarks || 0), 0);
  const projectWeightage = Number(course?.projectWeightage || 0);
  
  const weighted = sumTotal > 0 ? (sumRaw / sumTotal) * projectWeightage : 0;
  return Math.round(weighted * 100) / 100;
}

function parseCellAddress(cell: string) {
  const match = /^([A-Z]+)(\d+)$/i.exec(cell.trim());
  if (!match) return null;
  return { column: match[1].toUpperCase(), row: Number(match[2]) };
}

function resolveFieldValue(
  field: ExcelExportField,
  course: any,
  student: any,
  instructorName: string,
  exams: any[] = [],
  marks: any[] = [],
  projectCoByStudent: Record<string, number[]> = {}
) {
  const fieldStr = field as string;
  if (fieldStr.startsWith('co.midterm.')) {
    const coIndex = parseInt(fieldStr.split('.')[2]) - 1;
    return getCOMarkValueForMid(student, exams, marks, coIndex);
  }
  if (fieldStr.startsWith('co.final.')) {
    const coIndex = parseInt(fieldStr.split('.')[2]) - 1;
    return getCOMarkValueForFinal(student, exams, marks, coIndex);
  }
  if (fieldStr.startsWith('co.project.')) {
    const coIndex = parseInt(fieldStr.split('.')[2]) - 1;
    return getCOMarkValueForProject(student, exams, marks, coIndex, projectCoByStudent);
  }

  switch (field) {
    case 'course.code':
      return course.code || '';
    case 'course.name':
      return course.name || '';
    case 'course.section':
      return course.section || '';
    case 'course.semesterYear':
      return `${course.semester} ${course.year}`.trim();
    case 'course.credit':
      return course.courseType === 'Theory' ? 3 : 1;
    case 'instructor':
      return instructorName || '';
    case 'student.name':
      return student?.name || '';
    case 'student.studentId':
      return student?.studentId || '';
    case 'mark.attendance':
      return getMarkValue(student, exams, marks, 'Attendance');
    case 'mark.classPerformance':
      return getMarkValue(student, exams, marks, 'ClassPerformance');
    case 'mark.quiz':
      return getAggregatedMarkValue(student, exams, marks, 'Quiz', course);
    case 'mark.assignment':
      return getAggregatedMarkValue(student, exams, marks, 'Assignment', course);
    case 'mark.project':
      return getProjectAggregatedMarkValue(student, exams, marks, course);
    case 'mark.midterm':
      return getMarkValueForMid(student, exams, marks);
    case 'mark.final':
      return getMarkValueForFinal(student, exams, marks);
    case 'weight.attendance':
      return getExamWeight(exams, 'Attendance');
    case 'weight.classPerformance':
      return getExamWeight(exams, 'ClassPerformance');
    case 'weight.quiz': {
      const hasQuizzes = exams.some(e => e.examCategory === 'Quiz');
      return hasQuizzes ? (course.quizWeightage || 0) : 0;
    }
    case 'weight.assignment': {
      const hasAssignments = exams.some(e => e.examCategory === 'Assignment');
      return hasAssignments ? (course.assignmentWeightage || 0) : 0;
    }
    case 'weight.midterm':
      return getMidtermWeight(exams);
    case 'weight.project': {
      const hasProjects = exams.some(e => e.examCategory === 'Project');
      return hasProjects ? (course.projectWeightage || 0) : 0;
    }
    case 'weight.final':
      return getFinalWeight(exams);
    default:
      return '';
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: courseId } = await params;

    await dbConnect();

    const course = await Course.findOne({ _id: courseId, userId: session.user.id });

    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const group = body?.group === 'alias' ? 'alias' : 'main';
    const useSplit = Boolean(course.aliasEnabled && course.alternateCode);

    const allStudents = await Student.find({ courseId })
      .sort({ studentId: 1, _id: 1 })
      .collation({ locale: 'en', numericOrdering: true });
    const students = useSplit
      ? allStudents.filter((s) => (group === 'alias' ? s.useAlias : !s.useAlias))
      : allStudents;
    const exams = await Exam.find({ courseId });
    const marks = await Mark.find({ courseId });
    const projectGroupDoc = await ProjectGroup.findOne({ courseId });
    const projectCoByStudent = getProjectCoMarksByStudent(projectGroupDoc?.groups || []);

    // When exporting the alias group, resolveFieldValue('course.code', ...) should
    // reflect the alternate code, not the course's primary code.
    const courseForExport = useSplit && group === 'alias'
      ? { ...course.toObject(), code: course.alternateCode }
      : course;

    // Use the strict default mapping for the beta export template
    const mapping = DEFAULT_EXCEL_EXPORT_MAPPING;

    // Use public/templates so the file persists across builds
    const templatePath = path.join(process.cwd(), 'public', 'templates', 'Sample CO PO.xlsx');
    if (!fs.existsSync(templatePath)) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Load workbook using xlsx-populate to preserve styles/formatting
    const workbook = await XlsxPopulate.fromFileAsync(templatePath);

    const instructorName = session.user?.name || '';

    for (const singleCell of mapping.singleCells || []) {
      const targetSheetName = singleCell.sheetName || mapping.sheetName || 'GradeSheet';
      const sheet = workbook.sheet(targetSheetName);
      if (!sheet) continue;
      
      const value = resolveFieldValue(singleCell.field, courseForExport, null, instructorName, exams, marks, projectCoByStudent);
      sheet.cell(singleCell.cell).value(value === undefined || value === null ? '' : value);
    }

    for (const rangeMapping of mapping.rangeMappings || []) {
      const targetSheetName = rangeMapping.sheetName || mapping.sheetName || 'GradeSheet';
      const sheet = workbook.sheet(targetSheetName);
      if (!sheet) continue;
      
      const fromCell = parseCellAddress(rangeMapping.from);
      const toCell = parseCellAddress(rangeMapping.to);

      if (!fromCell || !toCell || fromCell.column !== toCell.column) {
        continue;
      }

      const maxRows = Math.max(0, toCell.row - fromCell.row + 1);
      const targetStudents = students.slice(0, maxRows);

      targetStudents.forEach((student, index) => {
        const row = fromCell.row + index;
        const value = resolveFieldValue(rangeMapping.field, courseForExport, student, instructorName, exams, marks, projectCoByStudent);
        sheet.cell(`${fromCell.column}${row}`).value(value === undefined || value === null ? '' : value);
      });
    }

    // Write "W" for withdrawn students in column M (M10 to M69) without touching other cells
    const gradeSheet = workbook.sheet(mapping.sheetName || 'GradeSheet');
    if (gradeSheet) {
      // Labs inherit the Assignment exam from Theory, but the column header/labels should read "CLA"
      if (course.courseType === 'Lab') {
        gradeSheet.cell('S8').value('CLA');
        gradeSheet.cell('B75').value('CLA');
        gradeSheet.cell('G9').formula('CONCATENATE("CLA (",GradeSheet!$C$75,")")');
      }

      const targetStudents = students.slice(0, 60);
      targetStudents.forEach((student, index) => {
        if (student.withdrawn) {
          const row = 10 + index;
          gradeSheet.cell(`M${row}`).value('W (Withdrawn)');
        }
      });
    }

    // Write CO-PO Mapping data to CO_PO_AttainmentAnalysis sheet
    const copoSheet = workbook.sheet('CO_PO_AttainmentAnalysis');
    if (copoSheet && course.coPoMapping) {
      const { maxMarks: maxMarksObj, mapping: copoMatrix } = course.coPoMapping;
      
      const midtermExam = exams.find(e => e.examType === 'midterm' || e.displayName?.toLowerCase().includes('mid'));
      const finalExam = exams.find(e => e.examType === 'final' || e.displayName?.toLowerCase().includes('final'));
      const projectExam = exams.find(e => e.examCategory === 'Project');

      const colLetters = ['D', 'E', 'F', 'G', 'H', 'I'];
      
      if (midtermExam && maxMarksObj?.[midtermExam._id.toString()]) {
        for (let i = 0; i < 6; i++) {
          const val = maxMarksObj[midtermExam._id.toString()][i];
          copoSheet.cell(`${colLetters[i]}3`).value(val || '');
        }
      }
      
      if (finalExam && maxMarksObj?.[finalExam._id.toString()]) {
        for (let i = 0; i < 6; i++) {
          const val = maxMarksObj[finalExam._id.toString()][i];
          copoSheet.cell(`${colLetters[i]}4`).value(val || '');
        }
      }

      // Combined Project/OEL CO max marks are stored under the literal key 'Project' (shared
      // across every Project-category exam), not under any individual exam's ObjectId.
      if (projectExam && maxMarksObj?.['Project']) {
        for (let i = 0; i < 6; i++) {
          const val = maxMarksObj['Project'][i];
          copoSheet.cell(`${colLetters[i]}5`).value(val || '');
        }
      }

      // Matrix: AT3 to BE8 (rows 3-8, cols 46-57)
      if (copoMatrix && copoMatrix.length === 6) {
        for (let co = 0; co < 6; co++) {
          const row = co + 3;
          for (let po = 0; po < 12; po++) {
            const col = po + 46;
            const isTicked = copoMatrix[co][po];
            copoSheet.cell(row, col).value(isTicked ? 1 : 0);
          }
        }
      }
    }

    // Auto-fill system-derived stats on the CourseSummary sheet (rest of the sheet is
    // hand-filled by the instructor - only these cells have a value the app already knows).
    const courseSummarySheet = workbook.sheet('CourseSummary');
    if (courseSummarySheet) {
      // G32 "Students who took final exam" - non-withdrawn students with a recorded final-exam mark.
      const finalExam = findFinalExam(exams);
      if (finalExam) {
        const finalTakenCount = students.filter(
          (s) => !s.withdrawn && getMark(s._id.toString(), finalExam._id.toString(), marks)
        ).length;
        courseSummarySheet.cell('G32').value(finalTakenCount);
      }

      // G39 "Absent Students" and AG23/AG39 "Number of Sessions" (Lectures) - derived from
      // attendance sessions. Attendance is tracked course-wide, independent of the alias
      // main/new-code split, so this always uses the full roster rather than `students`.
      const attendanceSessions = await AttendanceSession.find({ courseId });
      if (attendanceSessions.length > 0) {
        const attendanceByStudent = computeAttendanceByStudent(allStudents, attendanceSessions);
        const absentStudentCount = allStudents.filter((s) => {
          const stat = attendanceByStudent.get(String(s._id));
          if (!stat || stat.total === 0) return false;
          return stat.present / stat.total < ATTENDANCE_AT_RISK_THRESHOLD;
        }).length;
        courseSummarySheet.cell('G39').value(absentStudentCount);

        courseSummarySheet.cell('AG23').value(attendanceSessions.length);
        courseSummarySheet.cell('AG39').value(attendanceSessions.length);
      }
    }

    const outBuf = await workbook.outputAsync();

    const filenameSuffix = useSplit ? (group === 'alias' ? '_newcode' : '_oldcode') : '';
    return new NextResponse(outBuf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${courseForExport.code}_${course.name}_course_file${filenameSuffix}_${new Date().toISOString().split('T')[0]}.xlsx"`,
      },
    });
  } catch (error) {
    console.error('Export file error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
