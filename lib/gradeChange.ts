import mongoose from 'mongoose';
import Course, { type ICourse } from '@/models/Course';
import Department from '@/models/Department';
import Exam from '@/models/Exam';
import Mark from '@/models/Mark';
import Student from '@/models/Student';
import User from '@/models/User';
import { calculateLetterGrade } from '@/app/utils/grading';
import { calculateFinalGradeTotal } from '@/lib/finalGrade';
import { esc } from '@/lib/capstonePrint';
import type { GradeChangeDetails } from '@/models/GradeChange';

// Course status and grade changes.
//
// A teacher marks a course "finished" when its grades are final: every student's grade is
// recorded (Course.finalGrades: the grade at finishing, and the official grade now). Marks stay
// editable; when an edit moves a student to a different grade, that student needs the
// Controller of Examinations' Grade Change Form (EC002).
//
//  - Automatic, once per student: old grade = the official one, new grade = what the marks
//    give now. Marking the form sent records the change (GradeChange) and makes the new grade
//    official.
//  - Manual, any number of times: the full form, every field editable, for any students -
//    for a second change, or anything the automatic one doesn't cover. Recorded the same way.
//
// Every change is its own GradeChange record and is never edited, so the history is complete.

/** "B+", "A-", "F" - how the grade is written on the form. Withdrawn students are "W". */
export function shortGrade(letter: string, modifier?: string) {
  if (letter === 'F') return 'F';
  return `${letter}${modifier === '1' ? '-' : modifier === '2' ? '+' : ''}`;
}

export interface CurrentGrade {
  studentRecordId: string;
  studentId: string;
  name: string;
  withdrawn: boolean;
  grade: string;
  total: number;
}

/** Every student's grade as the marks give it now - the same math as the URMS grade sheet. */
export async function currentGrades(course: Pick<ICourse, '_id' | 'gradingScale' | 'quizWeightage' | 'quizAggregation' | 'assignmentWeightage' | 'assignmentAggregation' | 'projectWeightage'>): Promise<CurrentGrade[]> {
  const [students, exams, marks] = await Promise.all([
    Student.find({ courseId: course._id }).select('studentId name withdrawn').sort({ studentId: 1 }).collation({ locale: 'en', numericOrdering: true }).lean(),
    Exam.find({ courseId: course._id }).select('totalMarks weightage examCategory').lean(),
    Mark.find({ courseId: course._id }).select('studentId examId rawMark weightedMark').lean(),
  ]);
  const ex = exams.map((e) => ({ _id: String(e._id), totalMarks: e.totalMarks, weightage: e.weightage, examCategory: e.examCategory }));
  const mk = marks.map((m) => ({ studentId: String(m.studentId), examId: String(m.examId), rawMark: m.rawMark, weightedMark: m.weightedMark }));
  const config = {
    quizWeightage: course.quizWeightage,
    quizAggregation: course.quizAggregation,
    assignmentWeightage: course.assignmentWeightage,
    assignmentAggregation: course.assignmentAggregation,
    projectWeightage: course.projectWeightage,
  };
  return students.map((s) => {
    const id = String(s._id);
    // The letter from the exact total, as the URMS grade sheet does; the total kept to 2 places.
    const exact = calculateFinalGradeTotal(id, ex, mk, config);
    const letter = calculateLetterGrade(exact, course.gradingScale);
    const total = Math.round(exact * 100) / 100;
    return {
      studentRecordId: id,
      studentId: s.studentId,
      name: s.name,
      withdrawn: !!s.withdrawn,
      grade: s.withdrawn ? 'W' : shortGrade(letter.letter, letter.modifier),
      total,
    };
  });
}

export interface PendingChange {
  studentRecordId: string;
  studentId: string;
  name: string;
  oldGrade: string;
  newGrade: string;
  oldTotal: number;
  newTotal: number;
  /** The student already had a grade change sent: this one goes on the manual form. */
  repeat: boolean;
}

/**
 * Students whose grade now differs from the official one. Students added after finishing have
 * no official grade and are left out. `changedBefore`: students with a grade change already sent.
 */
export function pendingChanges(course: Pick<ICourse, 'finalGrades'>, now: CurrentGrade[], changedBefore: Set<string> = new Set()): PendingChange[] {
  const official = new Map((course.finalGrades || []).map((g) => [String(g.studentRecordId), g]));
  return now.flatMap((s) => {
    const was = official.get(s.studentRecordId);
    if (!was || was.grade === s.grade) return [];
    return [
      {
        studentRecordId: s.studentRecordId,
        studentId: s.studentId,
        name: s.name,
        oldGrade: was.grade,
        newGrade: s.grade,
        oldTotal: was.total,
        newTotal: s.total,
        repeat: changedBefore.has(s.studentRecordId),
      },
    ];
  });
}

/** What the form's header fields say unless the teacher changes them. */
export async function formDefaults(course: Pick<ICourse, 'code' | 'name' | 'section' | 'semester' | 'year' | 'userId'>, department?: CourseDepartment | null): Promise<GradeChangeDetails> {
  const [dept, owner] = await Promise.all([
    department === undefined ? courseDepartment(course) : Promise.resolve(department),
    User.findById(course.userId).select('name').lean<{ name?: string }>(),
  ]);
  return {
    program: dept?.program || '',
    headName: dept?.headName || '',
    teacherName: owner?.name || '',
    term: `${course.semester} ${course.year}`,
    courseCode: course.code,
    courseTitle: course.name,
    section: course.section,
  };
}

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Header fields from the browser: the defaults, with whatever the teacher typed. */
export function cleanDetails(input: unknown, defaults: GradeChangeDetails): GradeChangeDetails {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const pick = (k: keyof GradeChangeDetails, max = 200) => clip(o[k], max) || defaults[k];
  return {
    program: pick('program'),
    headName: pick('headName', 120),
    teacherName: pick('teacherName', 120),
    term: pick('term', 40),
    courseCode: pick('courseCode', 40),
    courseTitle: pick('courseTitle'),
    section: pick('section', 20),
  };
}

export interface ManualRow {
  studentRecordId: string | null;
  studentId: string;
  studentName: string;
  oldGrade: string;
  newGrade: string;
  reason: string;
}

/** Rows of the manual form from the browser; refuses what can't be printed. */
export function cleanRows(input: unknown): { rows: ManualRow[] } | { error: string } {
  if (!Array.isArray(input) || input.length === 0) return { error: 'Add at least one student' };
  if (input.length > 200) return { error: 'At most 200 students on one print' };
  const rows: ManualRow[] = [];
  for (const raw of input) {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const row = {
      studentRecordId: typeof o.studentRecordId === 'string' && mongoose.Types.ObjectId.isValid(o.studentRecordId) ? o.studentRecordId : null,
      studentId: clip(o.studentId, 30),
      studentName: clip(o.studentName, 120),
      oldGrade: clip(o.oldGrade, 10),
      newGrade: clip(o.newGrade, 10),
      reason: typeof o.reason === 'string' ? o.reason.trim().slice(0, 1000) : '',
    };
    if (!row.studentId) return { error: 'Every row needs a student ID' };
    if (!row.oldGrade || !row.newGrade) return { error: `Fill in the previous and new grade for ${row.studentId}` };
    rows.push(row);
  }
  return { rows };
}

export interface CourseDepartment {
  code: string;
  /** The program, as the department is named: "BSc in Computer Science & Engineering". */
  program: string;
  /** The head's name for forms: the name set for the department, else the assigned head's account name. */
  headName: string;
}

/** The course's department: its teacher's department, else the one its course code starts with. */
export async function courseDepartment(course: Pick<ICourse, 'code' | 'userId'>): Promise<CourseDepartment | null> {
  const owner = await User.findById(course.userId).select('departmentId').lean<{ departmentId?: mongoose.Types.ObjectId | null }>();
  let dept = owner?.departmentId ? await Department.findById(owner.departmentId).select('code name headName headUserId').lean() : null;
  if (!dept) {
    const prefix = (course.code.match(/^[A-Za-z]+/)?.[0] || '').toUpperCase();
    if (prefix) {
      const all = await Department.find({ isActive: true }).select('code shortCode name headName headUserId').lean();
      dept = all.find((d) => d.code.toUpperCase() === prefix || d.shortCode.toUpperCase() === prefix) || null;
    }
  }
  if (!dept) return null;
  const headUser = !dept.headName && dept.headUserId ? await User.findById(dept.headUserId).select('name').lean<{ name?: string }>() : null;
  return { code: dept.code, program: dept.name, headName: dept.headName || headUser?.name || '' };
}

/** Loads a course its teacher owns. */
export async function ownCourse(courseId: string, userId: string) {
  if (!mongoose.Types.ObjectId.isValid(courseId)) return null;
  return Course.findOne({ _id: courseId, userId });
}

// ── The form ────────────────────────────────────────────────────────────────────────────

export interface GradeChangeFormData extends GradeChangeDetails {
  studentId: string;
  studentName: string;
  oldGrade: string;
  newGrade: string;
  reason: string;
}

const multiline = (s: string) => esc(s.trim()).replace(/\n/g, '<br>');

function formPage(d: GradeChangeFormData, logo: string) {
  return `<section class="page">
  <header class="top">
    <div class="brand">
      <img src="${logo}" alt="ULAB" />
      <div class="office">Office of the Controller of Examinations</div>
    </div>
    <div class="code">EC002(02)</div>
  </header>
  <h1>Grade Change Form</h1>
  <div class="instr">
    <div class="box"><b>Instruction to Faculty:</b><br>Please complete point 1 to 4; and personally request your Department Head to sign in point 5.</div>
    <div class="box"><b>Instruction to Department Head:</b><br>Please sign in point 5 and send the form in a sealed envelope to the Controller of Examination Office.</div>
  </div>

  <div class="row"><span class="n">1.</span><table><colgroup><col style="width:32%"><col></colgroup>
    <tr><th>Student ID</th><th>Student Name (as in the ULAB records)</th></tr>
    <tr class="v"><td class="big">${esc(d.studentId)}</td><td class="big">${esc(d.studentName)}</td></tr></table></div>

  <div class="row"><span class="n">2.</span><table>
    <tr><th>Name of the Program</th></tr>
    <tr class="v"><td class="big">${esc(d.program)}</td></tr></table></div>

  <div class="row"><span class="n">3.</span><table><colgroup><col style="width:24%"><col style="width:19%"><col style="width:31%"><col></colgroup>
    <tr><th class="c">Term</th><th class="c">Course Code</th><th class="c">Course Title</th><th class="c">Section</th></tr>
    <tr class="v"><td class="c big">${esc(d.term)}</td><td class="c big">${esc(d.courseCode)}</td><td class="c">${esc(d.courseTitle)}</td><td class="c big">${esc(d.section)}</td></tr>
    <tr><th class="c">Old Grade</th><th class="c">New Grade</th><th class="c" colspan="2">Reason(s) for change</th></tr>
    <tr class="tall"><td class="c grade">${esc(d.oldGrade)}</td><td class="c grade">${esc(d.newGrade)}</td><td colspan="2" class="reason">${multiline(d.reason)}</td></tr></table></div>

  <div class="row"><span class="n">4.</span><table><colgroup><col style="width:62%"><col></colgroup>
    <tr><th class="c">Name of the Teacher</th><th class="c">Signature</th></tr>
    <tr class="sig"><td class="c big">${esc(d.teacherName)}</td><td></td></tr></table></div>

  <div class="row"><span class="n">5.</span><table><colgroup><col style="width:62%"><col></colgroup>
    <tr><th class="c">Name of the Head of the Dept.</th><th class="c">Signature</th></tr>
    <tr class="sig"><td class="c big">${esc(d.headName)}</td><td></td></tr></table></div>

  <div class="row"><span class="n">6.</span><table>
    <tr><th class="c">Vice Chancellor’s signature with date</th></tr>
    <tr class="sig"><td></td></tr></table></div>

  <table class="office-use"><colgroup><col style="width:46%"><col></colgroup>
    <tr><th colspan="2" class="c">For use of Controller of Examinations Office</th></tr>
    <tr><td class="coe"><div>New grade confirmed</div><div class="line">Signature of the Controller of Examinations<br>Date:</div></td>
      <td class="coe"><div>New grade uploaded into URMS</div><div class="dots">Posted by: …………………………………………<br><br>Date: …………………………………………</div></td></tr>
  </table>
  <div class="foot">EC002(02) Page 1 of 1</div>
</section>`;
}

export function gradeChangeFormsHtml(forms: GradeChangeFormData[], logo: string, title: string) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 14mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; color: #000; font: 11px/1.3 "Times New Roman", Times, serif; }
    .page { position: relative; break-after: page; page-break-after: always; min-height: 270mm; }
    .page:last-child { break-after: auto; page-break-after: auto; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; }
    .brand { display: flex; gap: 8px; align-items: center; }
    .brand img { height: 40px; }
    .office { font: 15px/1.1 Arial, sans-serif; color: #1f3d7a; }
    .code { font: 15px Arial, sans-serif; }
    h1 { margin: 6px 0 10px; text-align: center; font-size: 15px; }
    .instr { display: flex; justify-content: space-between; gap: 40px; margin: 0 0 18px 6%; }
    .box { width: 45%; border: 1px solid #000; padding: 5px 8px; font-size: 10.5px; text-align: justify; }
    .row { display: flex; align-items: flex-start; margin-bottom: 20px; }
    .n { width: 6%; font-weight: 700; padding-top: 2px; text-align: right; padding-right: 10px; }
    table { width: 94%; border-collapse: collapse; table-layout: fixed; }
    .row table { width: 94%; }
    th { border: 1px solid #000; padding: 2px 6px; text-align: left; font-weight: 700; }
    td { border: 1px solid #000; padding: 4px 6px; vertical-align: middle; overflow-wrap: anywhere; }
    .c { text-align: center; }
    tr.v td { height: 36px; }
    tr.tall td { height: 96px; }
    tr.sig td { height: 46px; }
    .big { font-size: 13px; }
    .grade { font-size: 22px; font-weight: 700; }
    .reason { vertical-align: top; font-size: 11.5px; }
    .office-use { width: 88%; margin-left: 6%; }
    .coe { vertical-align: top; height: 112px; position: relative; }
    .coe .line { position: absolute; left: 6px; right: 30px; bottom: 6px; border-top: 1px solid #000; padding-top: 2px; font-size: 10px; }
    .coe .dots { position: absolute; left: 6px; bottom: 6px; font-size: 10px; }
    .foot { position: absolute; right: 0; bottom: 0; font: 8px Arial, sans-serif; }
    @media screen {
      body { background: #e6e6e6; }
      .page { background: #fff; width: 210mm; min-height: 297mm; margin: 16px auto; padding: 12mm 14mm; box-shadow: 0 1px 4px rgba(0,0,0,.25); }
      .foot { right: 14mm; bottom: 12mm; }
      .print-btn { position: fixed; top: 12px; right: 12px; padding: 8px 14px; font: 13px Arial, sans-serif; cursor: pointer; }
    }
    @media print { .print-btn { display: none; } }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  ${forms.map((f) => formPage(f, logo)).join('\n')}
</body>
</html>`;
}
