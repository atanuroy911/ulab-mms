'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { calculateLetterGrade } from '@/app/utils/grading';
import { calculateFinalGradeTotal } from '@/lib/finalGrade';
import { Copy, Check, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface UrmsSplitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: any;
  students: any[];
  marks: any[];
  exams: any[];
}

export default function UrmsSplitModal({
  open,
  onOpenChange,
  course,
  students,
  marks,
  exams,
}: UrmsSplitModalProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const getStudentGrade = (studentId: string) => {
    const totalScore = calculateFinalGradeTotal(studentId, exams, marks, course || {});
    return calculateLetterGrade(totalScore, course?.gradingScale);
  };

  const handleCopy = (studentId: string, grade: string) => {
    navigator.clipboard.writeText(grade);
    setCopiedId(studentId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] h-[95vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 border-b shrink-0">
          <DialogTitle>Side-by-Side URMS Entry</DialogTitle>
          <DialogDescription>
            Testing iframe embedded split-view for manual entry.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex min-h-0">
          {/* Left Pane: URMS iframe */}
          <div className="w-1/2 border-r flex flex-col">
            <Alert variant="destructive" className="rounded-none border-x-0 border-t-0 bg-red-50 text-red-900 shrink-0">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <strong>Warning:</strong> If the URMS page does not load (grey screen) or you cannot log in, the URMS server has blocked iframe embedding (X-Frame-Options) or your browser is blocking 3rd-party cross-site cookies (SameSite=Lax).
              </AlertDescription>
            </Alert>
            <iframe 
              src="https://urms-awp.ulab.edu.bd/RMS_ggs_result/ResultEntryFromExcel" 
              className="w-full flex-1 bg-white"
              title="URMS Portal"
            />
          </div>

          {/* Right Pane: Grade List */}
          <div className="w-1/2 flex flex-col bg-muted/30">
            <div className="p-4 border-b shrink-0 bg-background">
              <h3 className="font-semibold text-lg">Calculated Grades</h3>
              <p className="text-sm text-muted-foreground">Click the copy button next to each student to easily paste into the portal on the left.</p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              <div className="bg-background rounded-md border shadow-sm">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted text-muted-foreground sticky top-0 shadow-sm z-10">
                    <tr>
                      <th className="px-4 py-3 font-medium">Student ID</th>
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Grade</th>
                      <th className="px-4 py-3 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {students.map((student) => {
                      const gradeObj = getStudentGrade(student._id);
                      const gradeDisplay = gradeObj ? gradeObj.display : 'F';
                      const gradeLetter = gradeObj ? gradeObj.letter : 'F';
                      
                      return (
                        <tr key={student._id} className="hover:bg-muted/50 transition-colors">
                          <td className="px-4 py-3 font-mono text-base">{student.studentId}</td>
                          <td className="px-4 py-3">{student.name}</td>
                          <td className="px-4 py-3 font-bold text-lg">{gradeDisplay}</td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => handleCopy(student.studentId, gradeLetter)}
                            >
                              {copiedId === student.studentId ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <Copy className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className="sr-only">Copy grade</span>
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
