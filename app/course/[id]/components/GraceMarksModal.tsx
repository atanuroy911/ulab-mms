'use client';

import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Sparkles, ArrowRight } from 'lucide-react';
import { computeGraceCandidates, GraceCandidate, GraceCourseConfig, GraceExam, GraceMark, GraceStudent } from '@/lib/graceMarks';

interface GraceMarksModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: GraceStudent[];
  exams: GraceExam[];
  marks: GraceMark[];
  course: GraceCourseConfig;
  calculateFinalGrade: (studentId: string) => { total: number };
  calculateLetterGrade: (percentage: number, gradingScale: string | undefined | null) => { display: string };
  onApply: (candidates: GraceCandidate[]) => Promise<void>;
}

export default function GraceMarksModal({
  isOpen,
  onClose,
  students,
  exams,
  marks,
  course,
  calculateFinalGrade,
  calculateLetterGrade,
  onApply,
}: GraceMarksModalProps) {
  const [isApplying, setIsApplying] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const candidates = useMemo(
    () => (isOpen ? computeGraceCandidates(students, exams, marks, course, calculateFinalGrade, calculateLetterGrade) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOpen, students, exams, marks, course]
  );

  const handleClose = () => {
    if (isApplying) return;
    setConfirmed(false);
    onClose();
  };

  const handleApply = async () => {
    setIsApplying(true);
    try {
      await onApply(candidates);
      setConfirmed(false);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Grace Marks
          </DialogTitle>
          <DialogDescription>
            Finds students within 1 mark of the next grade boundary and bumps a Quiz, Assignment, Attendance,
            or Class Performance column just enough to push them over - never Midterm, Final, or Project (CO-linked).
          </DialogDescription>
        </DialogHeader>

        {candidates.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground border-2 border-dashed rounded-lg">
            No students are within 1 mark of their next grade boundary right now.
          </div>
        ) : !confirmed ? (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {candidates.length} student{candidates.length === 1 ? '' : 's'} eligible for grace. Review before applying:
            </div>
            <div className="overflow-x-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[160px]">Student</TableHead>
                    <TableHead className="text-center">Grade</TableHead>
                    <TableHead className="min-w-[140px]">Column</TableHead>
                    <TableHead className="text-center">Mark Change</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates.map(c => (
                    <TableRow key={c.student._id}>
                      <TableCell>
                        <div className="font-medium">{c.student.name}</div>
                        <div className="text-xs text-muted-foreground">{c.student.studentId} &middot; {c.currentPercentage}% &rarr; {c.targetPercentage}%</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                          <Badge variant="secondary">{c.currentGradeDisplay}</Badge>
                          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                          <Badge>{c.nextGradeDisplay}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{c.target.exam.displayName}</TableCell>
                      <TableCell className="text-center text-sm font-medium whitespace-nowrap">
                        {c.target.rawMarkBefore} &rarr; {c.target.rawMarkAfter}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-3 bg-violet-500/10 border border-violet-500/30 rounded-lg text-sm">
              <p className="font-semibold">Final confirmation</p>
              <p className="text-muted-foreground mt-1">
                This will write new marks for {candidates.length} student{candidates.length === 1 ? '' : 's'} listed above. Each student&apos;s
                original mark is preserved and shown on the graded cell.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="flex gap-2">
          <Button variant="ghost" onClick={confirmed ? () => setConfirmed(false) : handleClose} disabled={isApplying}>
            {confirmed ? 'Back' : 'Cancel'}
          </Button>
          {candidates.length > 0 && !confirmed && (
            <Button onClick={() => setConfirmed(true)} className="bg-primary">
              Review & Confirm
            </Button>
          )}
          {candidates.length > 0 && confirmed && (
            <Button onClick={handleApply} disabled={isApplying} className="bg-primary">
              {isApplying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Applying...
                </>
              ) : (
                `Apply Grace to ${candidates.length} Student${candidates.length === 1 ? '' : 's'}`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
