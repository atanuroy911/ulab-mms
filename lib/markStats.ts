export interface StatStudent {
  _id: string;
  studentId: string;
  name: string;
  withdrawn?: boolean;
}

export interface StatExam {
  _id: string;
  displayName: string;
  totalMarks: number;
  examType?: string;
  examCategory?: string;
}

export interface StatMark {
  studentId: string;
  examId: string;
  rawMark: number;
}

export interface CategoryStatEntry {
  student: StatStudent;
  obtained: number;
  total: number;
  percentage: number;
}

export interface CategoryStats {
  key: 'midterm' | 'final' | 'project';
  label: string;
  examCount: number;
  entries: CategoryStatEntry[];
  average: number | null;
  highest: CategoryStatEntry | null;
  lowest: CategoryStatEntry | null;
  closestToAverage: CategoryStatEntry | null;
}

function computeCategoryStats(
  key: CategoryStats['key'],
  label: string,
  categoryExams: StatExam[],
  students: StatStudent[],
  marks: StatMark[]
): CategoryStats {
  const activeStudents = students.filter(s => !s.withdrawn);
  const entries: CategoryStatEntry[] = [];

  for (const student of activeStudents) {
    let obtained = 0;
    let total = 0;
    let hasAllMarks = true;

    for (const exam of categoryExams) {
      const mark = marks.find(m => m.studentId === student._id && m.examId === exam._id);
      if (!mark) {
        hasAllMarks = false;
        break;
      }
      obtained += mark.rawMark;
      total += exam.totalMarks;
    }

    if (!hasAllMarks || total === 0) continue;
    entries.push({ student, obtained, total, percentage: (obtained / total) * 100 });
  }

  if (entries.length === 0) {
    return { key, label, examCount: categoryExams.length, entries: [], average: null, highest: null, lowest: null, closestToAverage: null };
  }

  const average = entries.reduce((sum, e) => sum + e.percentage, 0) / entries.length;
  const highest = entries.reduce((a, b) => (b.percentage > a.percentage ? b : a));
  const lowest = entries.reduce((a, b) => (b.percentage < a.percentage ? b : a));
  const closestToAverage = entries.reduce((a, b) =>
    Math.abs(b.percentage - average) < Math.abs(a.percentage - average) ? b : a
  );

  return { key, label, examCount: categoryExams.length, entries, average, highest, lowest, closestToAverage };
}

export function computeAllCategoryStats(exams: StatExam[], students: StatStudent[], marks: StatMark[]): CategoryStats[] {
  const categories: { key: CategoryStats['key']; label: string; exams: StatExam[] }[] = [
    { key: 'midterm', label: 'Midterm', exams: exams.filter(e => e.examType === 'midterm') },
    { key: 'final', label: 'Final', exams: exams.filter(e => e.examType === 'final') },
    { key: 'project', label: 'Project / OEL', exams: exams.filter(e => e.examCategory === 'Project') },
  ];

  return categories
    .filter(c => c.exams.length > 0)
    .map(c => computeCategoryStats(c.key, c.label, c.exams, students, marks));
}
