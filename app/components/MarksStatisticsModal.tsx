'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Gauge } from 'lucide-react';

interface Student {
  _id: string;
  studentId: string;
  name: string;
}

interface Exam {
  _id: string;
  displayName: string;
  totalMarks: number;
  examCategory?: string;
}

interface Mark {
  _id: string;
  studentId: string;
  examId: string;
  rawMark: number;
}

interface MarksStatisticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  exams: Exam[];
  marks: Mark[];
}

interface ExamStats {
  exam: Exam;
  entered: number;
  average: number;
  highest: { student: Student; mark: number }[];
  lowest: { student: Student; mark: number }[];
}

function computeExamStats(exam: Exam, students: Student[], marks: Mark[]): ExamStats {
  const studentById = new Map(students.map(s => [s._id, s]));
  const examMarks = marks
    .filter(m => m.examId === exam._id)
    .map(m => ({ student: studentById.get(m.studentId), mark: m.rawMark }))
    .filter((entry): entry is { student: Student; mark: number } => !!entry.student);

  if (examMarks.length === 0) {
    return { exam, entered: 0, average: 0, highest: [], lowest: [] };
  }

  const values = examMarks.map(e => e.mark);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const average = values.reduce((sum, v) => sum + v, 0) / values.length;

  return {
    exam,
    entered: examMarks.length,
    average: Math.round(average * 100) / 100,
    highest: examMarks.filter(e => e.mark === max),
    lowest: examMarks.filter(e => e.mark === min),
  };
}

function StudentList({ entries }: { entries: { student: Student; mark: number }[] }) {
  if (entries.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="space-y-0.5">
      {entries.map(({ student, mark }) => (
        <div key={student._id} className="whitespace-nowrap">
          <span className="font-medium">{student.name}</span>
          <span className="text-muted-foreground"> · {student.studentId} · {mark}</span>
        </div>
      ))}
    </div>
  );
}

export default function MarksStatisticsModal({ isOpen, onClose, students, exams, marks }: MarksStatisticsModalProps) {
  const stats = exams.map(exam => computeExamStats(exam, students, marks));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-primary" />
            Marks Statistics
          </DialogTitle>
          <DialogDescription>
            Highest, lowest, and average marks for each exam.
          </DialogDescription>
        </DialogHeader>

        {stats.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground border-2 border-dashed rounded-lg">
            No exams found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[160px]">Exam</TableHead>
                  <TableHead className="text-center w-[110px]">Entered</TableHead>
                  <TableHead className="text-center w-[100px]">Average</TableHead>
                  <TableHead className="min-w-[220px]">
                    <span className="inline-flex items-center gap-1 text-emerald-500">
                      <TrendingUp className="w-3.5 h-3.5" /> Highest
                    </span>
                  </TableHead>
                  <TableHead className="min-w-[220px]">
                    <span className="inline-flex items-center gap-1 text-amber-500">
                      <TrendingDown className="w-3.5 h-3.5" /> Lowest
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.map(({ exam, entered, average, highest, lowest }) => (
                  <TableRow key={exam._id}>
                    <TableCell className="font-medium">
                      {exam.displayName}
                      <span className="block text-xs text-muted-foreground mt-0.5">Total: {exam.totalMarks}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={entered === students.length ? 'default' : 'secondary'}>
                        {entered}/{students.length}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center font-medium">
                      {entered > 0 ? average : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell><StudentList entries={highest} /></TableCell>
                    <TableCell><StudentList entries={lowest} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
