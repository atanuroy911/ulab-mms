'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BookOpen, FlaskConical, Upload, Download, Plus, ClipboardList, AlertTriangle, ExternalLink, FileText, Sparkles } from 'lucide-react';
import UrmsGradeSheet from './UrmsGradeSheet';
import UrmsAutoFillGradesModal from './UrmsAutoFillGradesModal';

interface Course {
  _id: string;
  name: string;
  code: string;
  alternateCode?: string;
  aliasEnabled?: boolean;
  semester: string;
  year: number;
  courseType: 'Theory' | 'Lab';
  showFinalGrade: boolean;
  quizWeightage?: number | string;
  assignmentWeightage?: number | string;
  projectWeightage?: number | string;
}
interface OverviewViewProps {
  course: Course;
  students: any[];
  exams: any[];
  marks: any[];
  calculateFinalGrade: (studentId: string) => { total: number };
  onImportStudents: () => void;
  onAddExam: () => void;
  onImportCourse: () => void;
  onExportCSV: () => void;
  exportingCSV: boolean;
  onExportCourseFile?: () => void;
  exportingCourseFile?: boolean;
  onExportCourseFileGroup?: (group: 'main' | 'alias') => void;
  exportingCourseFileGroup?: 'main' | 'alias' | null;
  onExportCourseFileAlpha?: () => void;
  exportingCourseFileAlpha?: boolean;
  onExportCourseFileAlphaGroup?: (group: 'main' | 'alias') => void;
  exportingCourseFileAlphaGroup?: 'main' | 'alias' | null;
  /** CO-PO mapping status for export warning */
  coPoStatus?: 'no-mapping' | 'no-max-marks' | 'ok';
  onGoToCoPo?: () => void;
}
export default function OverviewView({
  course,
  students,
  exams,
  marks,
  calculateFinalGrade,
  onImportStudents,
  onAddExam,
  onImportCourse,
  onExportCSV,
  exportingCSV,
  onExportCourseFile,
  exportingCourseFile,
  onExportCourseFileGroup,
  exportingCourseFileGroup,
  onExportCourseFileAlpha,
  exportingCourseFileAlpha,
  onExportCourseFileAlphaGroup,
  exportingCourseFileAlphaGroup,
  coPoStatus = 'ok',
  onGoToCoPo,
}: OverviewViewProps) {
  const [showExportDisclaimer, setShowExportDisclaimer] = useState(false);
  // Which export flow the code-chooser modal is currently serving - null when closed. Shared
  // between the Beta and Alpha excel exports since both need the same "pick one code, download
  // it, come back for the other" treatment for aliased courses.
  const [exportCodeChooserKind, setExportCodeChooserKind] = useState<'beta' | 'alpha' | null>(null);
  const [showChecklist, setShowChecklist] = useState(false);
  const [showUrmsModal, setShowUrmsModal] = useState(false);
  const [showUrmsAutoFillModal, setShowUrmsAutoFillModal] = useState(false);
  const [alphaDisclaimerTarget, setAlphaDisclaimerTarget] = useState<'excel' | 'pdf' | null>(null);

  const confirmAlphaDisclaimer = () => {
    const target = alphaDisclaimerTarget;
    setAlphaDisclaimerTarget(null);
    if (target === 'excel') {
      const useSplit = Boolean(course.aliasEnabled && course.alternateCode && onExportCourseFileAlphaGroup);
      if (useSplit) {
        setExportCodeChooserKind('alpha');
      } else {
        onExportCourseFileAlpha?.();
      }
    } else if (target === 'pdf') {
      openPdfExport();
    }
  };

  const openPdfExport = () => {
    const useSplit = Boolean(course.aliasEnabled && course.alternateCode);
    if (useSplit) {
      window.open(`/api/courses/${course._id}/export-copo-pdf-alpha?group=main`, '_blank');
      window.open(`/api/courses/${course._id}/export-copo-pdf-alpha?group=alias`, '_blank');
    } else {
      window.open(`/api/courses/${course._id}/export-copo-pdf-alpha`, '_blank');
    }
  };

  const hasQuizzes = exams.some(exam => exam.examCategory === 'Quiz');
  const hasAssignments = exams.some(exam => exam.examCategory === 'Assignment');
  const hasProjects = exams.some(exam => exam.examCategory === 'Project');

  let totalWeightage = exams.reduce((sum, exam) => {
    if (exam.examCategory === 'Quiz' || exam.examCategory === 'Assignment' || exam.examCategory === 'Project') {
      return sum; // these are handled at course level below
    }
    return sum + (Number(exam.weightage) || 0);
  }, 0);

  if (hasQuizzes && course.quizWeightage) {
    totalWeightage += Number(course.quizWeightage);
  }

  if (hasAssignments && course.assignmentWeightage) {
    totalWeightage += Number(course.assignmentWeightage);
  }

  if (hasProjects && course.projectWeightage) {
    totalWeightage += Number(course.projectWeightage);
  }

  const studentsWithMarks = students.filter(student => 
    marks.some(mark => mark.studentId === student._id)
  ).length;

  const handleSideBySideUrms = () => {
    const screenWidth = window.screen.availWidth;
    const screenHeight = window.screen.availHeight;
    const halfWidth = Math.floor(screenWidth / 2);

    const commonFeatures = 'popup=yes,menubar=no,toolbar=no,location=no,status=no';

    // Launch URMS portal on the left in a new window
    window.open(
      'https://urms-awp.ulab.edu.bd/RMS_ggs_result/ResultEntryFromExcel',
      'urmsWindow',
      `${commonFeatures},left=0,top=0,width=${halfWidth},height=${screenHeight}`
    );

    // Open the right-sided sliding sheet inside the app
    setShowUrmsModal(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Course Overview</h1>
        <p className="text-sm mt-1 text-muted-foreground">
          Manage your course structure and view statistics
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Students</CardTitle>
            <span className="text-2xl">👨‍🎓</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{students.length}</div>
            <p className="text-xs text-muted-foreground">
              {studentsWithMarks} with marks
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Exams</CardTitle>
            <span className="text-2xl">📝</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{exams.length}</div>
            <p className="text-xs text-muted-foreground">
              {totalWeightage}% total weightage
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Marks Recorded</CardTitle>
            <span className="text-2xl">✏️</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{marks.length}</div>
            <p className="text-xs text-muted-foreground">
              Total entries
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completion</CardTitle>
            <span className="text-2xl">📊</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {students.length > 0 && exams.length > 0
                ? Math.round((marks.length / (students.length * exams.length)) * 100)
                : 0}%
            </div>
            <Progress 
              value={students.length > 0 && exams.length > 0
                ? (marks.length / (students.length * exams.length)) * 100
                : 0
              } 
              className="mt-2"
            />
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks and operations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left column */}
            <div className="space-y-6">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Student Management</h3>
                <Button
                  onClick={onImportStudents}
                  variant="outline"
                  className="w-full justify-start"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Import Students (CSV/PDF)
                </Button>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Course Data</h3>
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={onImportCourse}
                    variant="outline"
                    className="w-full justify-start"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Import Course Data
                  </Button>
                  <Button
                    onClick={onExportCSV}
                    disabled={exportingCSV}
                    variant="outline"
                    className="w-full justify-start"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {exportingCSV ? 'Exporting...' : 'Export CSV'}
                  </Button>
                  <Button
                    onClick={() => setShowExportDisclaimer(true)}
                    disabled={exportingCourseFile}
                    variant="outline"
                    className="w-full justify-start"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {exportingCourseFile ? 'Exporting...' : 'Export course file'}
                    <span className="ml-2 text-xs text-muted-foreground">Beta</span>
                  </Button>
                  <Button
                    onClick={() => setShowChecklist(true)}
                    variant="outline"
                    className="w-full justify-start"
                  >
                    <ClipboardList className="w-4 h-4 mr-2" />
                    Course File Checklist
                  </Button>
                  <Button
                    onClick={() => {
                      const a = document.createElement('a');
                      a.href = '/templates/Sample CO PO.xlsx';
                      a.download = 'Empty_CO_PO_File.xlsx';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                    }}
                    variant="outline"
                    className="w-full justify-start"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download empty CO PO File
                  </Button>
                </div>
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-6">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Exam Management</h3>
                <Button
                  onClick={onAddExam}
                  variant="outline"
                  className="w-full justify-start"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add New Exam
                </Button>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold">External Systems</h3>
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={handleSideBySideUrms}
                    variant="default"
                    className="w-full justify-start bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Side-by-Side URMS Entry
                  </Button>
                  <Button
                    onClick={() => setShowUrmsAutoFillModal(true)}
                    variant="outline"
                    className="w-full justify-start gap-1.5"
                  >
                    <Sparkles className="w-4 h-4" />
                    Auto-Fill Grades in URMS
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-auto">Beta</Badge>
                  </Button>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  Experimental Exports
                  <span className="text-xs font-normal text-muted-foreground">Alpha</span>
                </h3>
                <div className="flex flex-col gap-2">
                  {onExportCourseFileAlpha && (
                    <Button
                      onClick={() => setAlphaDisclaimerTarget('excel')}
                      disabled={exportingCourseFileAlpha}
                      variant="outline"
                      className="w-full justify-start"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      {exportingCourseFileAlpha ? 'Exporting...' : 'Export course file (unlimited students)'}
                    </Button>
                  )}
                  <Button
                    onClick={() => setAlphaDisclaimerTarget('pdf')}
                    variant="outline"
                    className="w-full justify-start"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Export course file PDF
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Course Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {course.courseType === 'Theory' ? (
              <BookOpen className="w-5 h-5" />
            ) : (
              <FlaskConical className="w-5 h-5" />
            )}
            Course Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Course Code</div>
              <div className="font-medium">{course.code}</div>
            </div>
            {course.aliasEnabled && course.alternateCode && (
              <div>
                <div className="text-sm text-muted-foreground">New Code</div>
                <div className="font-medium">{course.alternateCode}</div>
              </div>
            )}
            <div>
              <div className="text-sm text-muted-foreground">Course Type</div>
              <Badge variant={course.courseType === 'Theory' ? 'default' : 'secondary'}>
                {course.courseType}
              </Badge>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Semester</div>
              <div className="font-medium">{course.semester}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Year</div>
              <div className="font-medium">{course.year}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alpha Disclaimer Modal - shown before either experimental export */}
      <Dialog open={alphaDisclaimerTarget !== null} onOpenChange={(open) => !open && setAlphaDisclaimerTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center text-amber-500">
              <AlertTriangle className="w-5 h-5 mr-2" />
              {alphaDisclaimerTarget === 'pdf' ? 'Export Course File PDF (Alpha)' : 'Export Course File (Alpha)'}
            </DialogTitle>
            <DialogDescription>
              Please read the following before exporting:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <ul className="list-disc pl-5 space-y-2 text-sm text-foreground">
              <li><strong>This feature is experimental (Alpha).</strong> It&apos;s newer and less battle-tested than the Beta export - please double-check the generated file.</li>
              <li>Unlike the Beta export, it supports <strong>any number of students</strong> (not capped at 50).</li>
              <li>
                {alphaDisclaimerTarget === 'pdf'
                  ? 'It is generated entirely from calculations - no Excel template involved - and opens as a print-ready page in a new tab.'
                  : 'It dynamically resizes the spreadsheet template to fit your roster instead of relying on a fixed 50-row layout.'}
              </li>
              <li>It may malfunction for <strong>Lab</strong> courses or unusual exam configurations that haven&apos;t been tested yet.</li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlphaDisclaimerTarget(null)}>
              Cancel
            </Button>
            <Button onClick={confirmAlphaDisclaimer} disabled={alphaDisclaimerTarget === 'excel' && exportingCourseFileAlpha}>
              {alphaDisclaimerTarget === 'excel' && exportingCourseFileAlpha ? 'Exporting...' : 'I Understand, Export'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Disclaimer Modal */}
      <Dialog open={showExportDisclaimer} onOpenChange={setShowExportDisclaimer}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center text-amber-500">
              <AlertTriangle className="w-5 h-5 mr-2" />
              Export Course File (Beta)
            </DialogTitle>
            <DialogDescription>
              Please read the following before exporting the course file:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* CO-PO mapping warning */}
            {coPoStatus !== 'ok' && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 text-sm">
                    <p className="font-semibold text-red-300 mb-1">
                      {coPoStatus === 'no-mapping'
                        ? 'CO-PO Mapping Not Configured'
                        : 'CO Maximum Marks Not Set'}
                    </p>
                    <p className="text-red-200/80 text-xs leading-relaxed">
                      {coPoStatus === 'no-mapping'
                        ? 'No CO-PO mapping has been set for this course. Without it, the exported Course File will show PO attainment as 0% for all Program Outcomes.'
                        : 'Some CO-enabled exams are missing CO maximum marks in the CO-PO Mapping. The exported Course File may show incorrect or 0% PO attainment for those exams.'}
                    </p>
                    {onGoToCoPo && (
                      <button
                        onClick={() => { setShowExportDisclaimer(false); onGoToCoPo(); }}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-red-300 hover:text-red-100 underline underline-offset-2 transition-colors"
                      >
                        → Go to CO-PO Mapping to fix this
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <ul className="list-disc pl-5 space-y-2 text-sm text-foreground">
              <li><strong>This feature is in Beta.</strong> Please double-check the generated file.</li>
              <li>It supports a maximum of <strong>50 students, 6 COs and 12 POs</strong>.</li>
              <li>It expects a predefined strict amount of exams for theory: <em>Attendance, Performance, Quiz, Assignment, Midterm Exam, Project, Final Exam</em>.</li>
              <li>It may malfunction for <strong>Lab</strong> courses because labs often follow different structures than theory courses.</li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportDisclaimer(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowExportDisclaimer(false);
                const useSplit = Boolean(course.aliasEnabled && course.alternateCode && onExportCourseFileGroup);
                if (useSplit) {
                  setExportCodeChooserKind('beta');
                } else if (onExportCourseFile) {
                  onExportCourseFile();
                }
              }}
              disabled={exportingCourseFile}
              variant={coPoStatus !== 'ok' ? 'destructive' : 'default'}
            >
              {exportingCourseFile ? 'Exporting...' : coPoStatus !== 'ok' ? 'Export Anyway' : 'I Understand, Export'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export code chooser - one download per click. Firing both the old-code and new-code
          downloads back-to-back with no user gesture in between trips Chrome's multi-file
          download warning, so each code gets its own explicit button instead. Serves both the
          Beta and Alpha excel exports. */}
      <Dialog open={exportCodeChooserKind !== null} onOpenChange={(open) => !open && setExportCodeChooserKind(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Download className="w-5 h-5 mr-2" />
              Export Course File ({exportCodeChooserKind === 'alpha' ? 'Alpha' : 'Beta'})
            </DialogTitle>
            <DialogDescription>
              This course has two codes. Download each file separately - browsers can flag
              back-to-back automatic downloads as suspicious.
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const activeGroup = exportCodeChooserKind === 'alpha' ? exportingCourseFileAlphaGroup : exportingCourseFileGroup;
            const isBusy = activeGroup !== null && activeGroup !== undefined;
            const download = (group: 'main' | 'alias') => {
              if (exportCodeChooserKind === 'alpha') {
                onExportCourseFileAlphaGroup?.(group);
              } else {
                onExportCourseFileGroup?.(group);
              }
            };
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
                <Button
                  onClick={() => download('main')}
                  disabled={isBusy}
                  variant="outline"
                  className="h-auto flex-col items-start gap-1 py-4 text-left"
                >
                  <span className="flex items-center gap-2 font-semibold text-sm">
                    <Download className="w-4 h-4" />
                    {activeGroup === 'main' ? 'Downloading...' : 'Download for Old Code'}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">{course.code}</span>
                </Button>
                <Button
                  onClick={() => download('alias')}
                  disabled={isBusy}
                  variant="outline"
                  className="h-auto flex-col items-start gap-1 py-4 text-left"
                >
                  <span className="flex items-center gap-2 font-semibold text-sm">
                    <Download className="w-4 h-4" />
                    {activeGroup === 'alias' ? 'Downloading...' : 'Download for New Code'}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">{course.alternateCode}</span>
                </Button>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExportCodeChooserKind(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Course File Checklist Modal */}
      <Dialog open={showChecklist} onOpenChange={setShowChecklist}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <ClipboardList className="w-5 h-5 mr-2 text-primary" />
              Course File Checklist
            </DialogTitle>
            <DialogDescription>
              List of documents needed for final course file submission.
              <br/>
              <strong>Instruction:</strong> Please submit soft copy in concerned Google Drive Folder and Hard copy to Dept. Admin Officer.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-2">
            {course.courseType === 'Lab' ? (
              <div className="space-y-4">
                <h4 className="font-semibold text-lg border-b pb-2">Lab Courses Requirements</h4>
                <ol className="list-decimal pl-5 space-y-2 text-sm">
                  <li>Course Outline - (Soft and Hard copy)</li>
                  <li>Attendances - (Hard copy)
                    <ul className="list-[lower-alpha] pl-5 mt-1 space-y-1 text-muted-foreground">
                      <li>Class Attendance</li>
                      <li>Mid Term Attendance</li>
                      <li>Final Term Attendance</li>
                    </ul>
                  </li>
                  <li>Final Grade Report - (Soft and Hard copy)</li>
                  <li>Marks Excel breakdown - (Soft and Hard copy)</li>
                  <li>List of Lab Tasks (for all Lab course) - (Soft and Hard copy)</li>
                  <li>Open-Ended Lab Form (for all Lab course) - (Soft and Hard copy)</li>
                  <li>Open-Ended Lab Report + Rubrics (Highest, Medium and Lowest) - (Hard copy)</li>
                  <li>Complex Engineering Project form (For Dominant Lab Courses) - (Soft and Hard copy)</li>
                  <li>Complex Engineering Project report + Rubrics (Highest, Medium and Lowest) (For Dominant Lab Courses) - (Hard copy)</li>
                  <li>CO-PO Excel file (including CO-PO attainment, Semester Course Report/Course Summary) – (Soft and Hard copy)</li>
                  <li>CQI Form</li>
                  <li>Excuse Absent Form</li>
                  <li>Class Summary Report</li>
                </ol>
              </div>
            ) : (
              <div className="space-y-4">
                <h4 className="font-semibold text-lg border-b pb-2">Theory Courses Requirements</h4>
                <ol className="list-decimal pl-5 space-y-2 text-sm">
                  <li>Course Outline (Soft and Hard copy)</li>
                  <li>Attendances (Hard copy)
                    <ul className="list-[lower-alpha] pl-5 mt-1 space-y-1 text-muted-foreground">
                      <li>Class Attendance</li>
                      <li>Mid Term Attendance</li>
                      <li>Final Term Attendance</li>
                    </ul>
                  </li>
                  <li>Mid Term Question Moderation, Mid Term Question and Sample Answer Scripts (Highest, Medium and Lowest) - (Hard copy)</li>
                  <li>Final Question Moderation, Final Question and Sample Answer Scripts (Highest, Medium and Lowest) - (Hard copy)</li>
                  <li>Final Grade Report - (Soft and Hard copy)</li>
                  <li>Marks Excel breakdown - (Soft and Hard copy)</li>
                  <li>Complex Engineering Project form (For Dominant Courses only) - (Hard copy)</li>
                  <li>Complex Engineering Project report+ Rubrics (Highest, Medium and Lowest) (For Dominant Courses only) - (Hard copy)</li>
                  <li>CO-PO Excel file (including CO-PO attainment, Semester Course Report/Course Summary) – (Soft and Hard copy)</li>
                  <li>CQI Form</li>
                  <li>Excuse Absent Form</li>
                  <li>Class Summary Report</li>
                </ol>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button onClick={() => setShowChecklist(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UrmsGradeSheet
        open={showUrmsModal}
        onOpenChange={setShowUrmsModal}
        course={course}
        students={students}
        calculateFinalGrade={calculateFinalGrade}
      />

      <UrmsAutoFillGradesModal
        open={showUrmsAutoFillModal}
        onOpenChange={setShowUrmsAutoFillModal}
        course={course}
        students={students}
        calculateFinalGrade={calculateFinalGrade}
        onOpenSidePanel={() => setShowUrmsModal(true)}
      />
    </div>
  );
}
