'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { calculateLetterGrade } from '@/app/utils/grading';
import { Copy, Check } from 'lucide-react';

interface UrmsGradeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: any;
  students: any[];
  calculateFinalGrade: (studentId: string) => { total: number };
}

export default function UrmsGradeSheet({
  open,
  onOpenChange,
  course,
  students,
  calculateFinalGrade,
}: UrmsGradeSheetProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeCode, setActiveCode] = useState<'old' | 'new'>('old');

  const hasNewCode = Boolean(course?.aliasEnabled && course?.alternateCode);
  const visibleStudents = hasNewCode
    ? students.filter((student) => (activeCode === 'new' ? student.useAlias : !student.useAlias))
    : students;

  const getStudentGrade = (studentId: string) => {
    const gradeData = calculateFinalGrade(studentId);
    return calculateLetterGrade(gradeData.total, course?.gradingScale);
  };

  const handleCopy = (studentId: string, grade: string) => {
    navigator.clipboard.writeText(grade);
    setCopiedId(studentId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* w-[400px] or sm:w-[540px] provides a nice right-aligned width */}
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0 gap-0">
        <SheetHeader className="p-6 border-b shrink-0 bg-muted z-20 relative">
          <SheetTitle>Calculated Grades</SheetTitle>
          <SheetDescription>
            Copy these grades to the URMS portal opened in the other window.
          </SheetDescription>
        </SheetHeader>

        {hasNewCode && (
          <div className="px-6 pt-4 shrink-0 bg-muted">
            <Tabs value={activeCode} onValueChange={(value) => setActiveCode(value as 'old' | 'new')}>
              <TabsList className="w-full">
                <TabsTrigger value="old">Old Code ({course.code})</TabsTrigger>
                <TabsTrigger value="new">New Code ({course.alternateCode})</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}

        <div className="flex-1 p-4 bg-muted/10 flex flex-col min-h-0">
          <div className="bg-background rounded-md border shadow-sm flex-1 overflow-y-auto relative">
            <table className="w-full text-sm text-left">
              <thead className="bg-background text-muted-foreground sticky top-0 shadow-sm z-20 border-b">
                <tr>
                  <th className="px-4 py-3 font-medium">Student ID</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Grade</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleStudents.map((student) => {
                  const gradeObj = getStudentGrade(student._id);
                  const gradeDisplay = gradeObj ? gradeObj.display : 'F';
                  const gradeLetter = gradeObj ? gradeObj.letter : 'F';

                  return (
                    <tr key={student._id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-sm">{student.studentId}</td>
                      <td className="px-4 py-3 text-xs max-w-[120px] truncate" title={student.name}>{student.name}</td>
                      <td className="px-4 py-3 font-bold text-base">{gradeDisplay}</td>
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
      </SheetContent>
    </Sheet>
  );
}
