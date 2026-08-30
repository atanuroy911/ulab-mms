'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { calculateLetterGrade } from '@/app/utils/grading';
import { calculateFinalGradeTotal } from '@/lib/finalGrade';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import { Card } from '@/components/ui/card';

export default function UrmsGradesPage() {
  const params = useParams();
  const courseId = params.id as string;

  const [course, setCourse] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [marks, setMarks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (courseId) {
      fetchCourseData();
    }
  }, [courseId]);

  const fetchCourseData = async () => {
    try {
      const response = await fetch(`/api/courses/${courseId}`);
      const data = await response.json();
      
      if (response.ok) {
        setCourse(data.course);
        setStudents(data.students || []);
        setExams(data.exams || []);
        setMarks(data.marks || []);
      }
    } catch (err) {
      console.error('Error fetching course data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStudentGrade = (studentId: string) => {
    const totalScore = calculateFinalGradeTotal(studentId, exams, marks, course || {});
    return calculateLetterGrade(totalScore, course?.gradingScale);
  };

  const handleCopy = (studentId: string, grade: string) => {
    navigator.clipboard.writeText(grade);
    setCopiedId(studentId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading grades...</div>;
  }

  if (!course) {
    return <div className="p-8 text-center text-red-500">Failed to load course data.</div>;
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Final Grades for URMS</h1>
          <p className="text-muted-foreground">
            {course.code} - Section {course.section || '1'} ({course.semester} {course.year})
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Tip: Position this window on the right half of your screen, and the URMS window on the left. Click the Copy button next to a student to quickly copy their grade to your clipboard.
          </p>
        </div>

        <Card className="overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted text-muted-foreground">
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
                        className="h-8"
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
        </Card>
      </div>
    </div>
  );
}
