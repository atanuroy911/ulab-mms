'use client';

import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Upload, AlertTriangle, Check, ArrowRight, ArrowLeft, FileSpreadsheet, PartyPopper } from 'lucide-react';

type ExamCategory = 'Quiz' | 'Assignment' | 'Project' | 'Attendance' | 'MainExam' | 'ClassPerformance' | 'Others';
type ExamType = 'midterm' | 'final' | 'labFinal' | 'oel' | 'custom';

interface ParsedStudent {
  studentId: string;
  name: string;
}

interface ParsedAssessment {
  label: string;
  weightage: number | null;
  totalMarksGuess: number;
  rawMarksByStudentId: Record<string, number>;
  suggestedCategory: ExamCategory;
  suggestedExamType: ExamType;
  suggestedCoGroupLabel: string | null;
}

interface CoGroup {
  label: string;
  maxMarks: (number | null)[];
  marksByStudentId: Record<string, (number | null)[]>;
}

interface ParsedMeta {
  courseCode: string | null;
  courseTitle: string | null;
  credit: number | null;
  instructor: string | null;
  section: string | null;
  semester: string | null;
  looksLikeBlankTemplate: boolean;
}

interface ParsedCourseFile {
  meta: ParsedMeta;
  warnings: string[];
  students: ParsedStudent[];
  assessments: ParsedAssessment[];
  coGroups: CoGroup[];
  attainmentThresholdPct: number | null;
}

interface EditableStudent extends ParsedStudent {
  include: boolean;
}

interface EditableAssessment {
  label: string;
  include: boolean;
  category: ExamCategory;
  examType: ExamType;
  totalMarks: number;
  weightage: number;
  coGroupLabel: string | null;
  rawMarksByStudentId: Record<string, number>;
  enteredCount: number;
}

const CATEGORY_OPTIONS: { value: ExamCategory; label: string }[] = [
  { value: 'MainExam', label: 'Main Exam (Midterm/Final)' },
  { value: 'Quiz', label: 'Quiz' },
  { value: 'Assignment', label: 'Assignment' },
  { value: 'Project', label: 'Project / OEL' },
  { value: 'ClassPerformance', label: 'Class Performance' },
  { value: 'Attendance', label: 'Attendance' },
  { value: 'Others', label: 'Others' },
];

function guessSemesterEnum(text: string | null): 'Spring' | 'Summer' | 'Fall' {
  if (text && /summer/i.test(text)) return 'Summer';
  if (text && /fall/i.test(text)) return 'Fall';
  return 'Spring';
}

function guessYear(text: string | null): number {
  const m = text?.match(/(20\d{2})/);
  return m ? parseInt(m[1], 10) : new Date().getFullYear();
}

interface ImportCourseFileWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
}

export default function ImportCourseFileWizard({ isOpen, onClose, onImported }: ImportCourseFileWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [parsed, setParsed] = useState<ParsedCourseFile | null>(null);
  const [acknowledgedWarnings, setAcknowledgedWarnings] = useState(false);

  const [courseCode, setCourseCode] = useState('');
  const [courseTitle, setCourseTitle] = useState('');
  const [courseType, setCourseType] = useState<'Theory' | 'Lab'>('Theory');
  const [semester, setSemester] = useState<'Spring' | 'Summer' | 'Fall'>('Spring');
  const [year, setYear] = useState(new Date().getFullYear());
  const [section, setSection] = useState('1');

  const [students, setStudents] = useState<EditableStudent[]>([]);
  const [assessments, setAssessments] = useState<EditableAssessment[]>([]);
  const [coGroups, setCoGroups] = useState<CoGroup[]>([]);

  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState('');
  const [resultCourseId, setResultCourseId] = useState<string | null>(null);

  const reset = () => {
    setStep(1);
    setFile(null);
    setParsing(false);
    setParseError('');
    setParsed(null);
    setAcknowledgedWarnings(false);
    setStudents([]);
    setAssessments([]);
    setCoGroups([]);
    setCommitting(false);
    setCommitError('');
    setResultCourseId(null);
  };

  const handleClose = () => {
    if (parsing || committing) return;
    reset();
    onClose();
  };

  const handleUpload = async () => {
    if (!file) return;
    setParsing(true);
    setParseError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/courses/import-alpha/parse', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setParseError(data.error || 'Could not read this file.');
        return;
      }
      const p: ParsedCourseFile = data.parsed;
      setParsed(p);
      setCourseCode(p.meta.courseCode || '');
      setCourseTitle(p.meta.courseTitle || '');
      setCourseType(/lab/i.test(p.meta.courseTitle || '') || (p.meta.credit === 1) ? 'Lab' : 'Theory');
      setSemester(guessSemesterEnum(p.meta.semester));
      setYear(guessYear(p.meta.semester));
      setSection(p.meta.section || '1');
      setStudents(p.students.map((s) => ({ ...s, include: true })));
      setCoGroups(p.coGroups);
      setAssessments(
        p.assessments.map((a) => ({
          label: a.label,
          include: true,
          category: a.suggestedCategory,
          examType: a.suggestedExamType,
          totalMarks: a.totalMarksGuess,
          weightage: a.weightage ?? 0,
          coGroupLabel: a.suggestedCoGroupLabel,
          rawMarksByStudentId: a.rawMarksByStudentId,
          enteredCount: Object.keys(a.rawMarksByStudentId).length,
        }))
      );
      setStep(2);
    } catch (err) {
      console.error(err);
      setParseError('Network error while uploading the file.');
    } finally {
      setParsing(false);
    }
  };

  const includedStudentCount = useMemo(() => students.filter((s) => s.include).length, [students]);
  const includedAssessments = useMemo(() => assessments.filter((a) => a.include), [assessments]);
  const weightageSum = useMemo(() => includedAssessments.reduce((sum, a) => sum + (a.weightage || 0), 0), [includedAssessments]);

  const handleCommit = async () => {
    setCommitting(true);
    setCommitError('');
    try {
      const res = await fetch('/api/courses/import-alpha/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseCode,
          courseTitle,
          courseType,
          semester,
          year,
          section,
          students: students.filter((s) => s.include).map(({ studentId, name }) => ({ studentId, name })),
          assessments,
          coGroups,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCommitError(data.error || 'Import failed.');
        return;
      }
      setResultCourseId(data.courseId);
      setStep(6);
      onImported();
    } catch (err) {
      console.error(err);
      setCommitError('Network error while importing.');
    } finally {
      setCommitting(false);
    }
  };

  const updateAssessment = (index: number, patch: Partial<EditableAssessment>) => {
    setAssessments((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  };

  const stepLabels = ['Upload', 'Course Details', 'Students', 'Assessments', 'Review', 'Done'];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            Import Course File
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Alpha</Badge>
          </DialogTitle>
          <DialogDescription>
            {step < 6 ? `Step ${step} of 5 — ${stepLabels[step - 1]}` : 'Import complete'}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Upload */}
        {step === 1 && (
          <div className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Alpha feature.</strong> This reads a hand-filled CO-PO course-file gradesheet (.xlsx) and
                creates a new course from it. Every uploaded file is parsed with heuristics since teachers fill these
                in differently — you&apos;ll review and confirm everything before anything is saved, and should
                double-check Marks/Students/CO-PO after import.
              </AlertDescription>
            </Alert>
            <div>
              <Label htmlFor="import-alpha-file">Course file (.xlsx)</Label>
              <input
                id="import-alpha-file"
                type="file"
                accept=".xlsx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="mt-1.5 w-full text-sm border rounded-md px-3 py-2 bg-background"
              />
            </div>
            {parseError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{parseError}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Step 2: Course details */}
        {step === 2 && parsed && (
          <div className="space-y-4">
            {parsed.warnings.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {parsed.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Course Code</Label>
                <Input value={courseCode} onChange={(e) => setCourseCode(e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label>Course Title</Label>
                <Input value={courseTitle} onChange={(e) => setCourseTitle(e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label>Course Type</Label>
                <Select value={courseType} onValueChange={(v) => setCourseType(v as 'Theory' | 'Lab')}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Theory">Theory</SelectItem>
                    <SelectItem value="Lab">Lab</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Section</Label>
                <Input value={section} onChange={(e) => setSection(e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label>Semester</Label>
                <Select value={semester} onValueChange={(v) => setSemester(v as 'Spring' | 'Summer' | 'Fall')}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Spring">Spring</SelectItem>
                    <SelectItem value="Summer">Summer</SelectItem>
                    <SelectItem value="Fall">Fall</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Year</Label>
                <Input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value, 10) || year)} className="mt-1.5" />
              </div>
            </div>
            {parsed.meta.instructor && (
              <p className="text-xs text-muted-foreground">Instructor on file: {parsed.meta.instructor}</p>
            )}
            {parsed.warnings.length > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={acknowledgedWarnings} onChange={(e) => setAcknowledgedWarnings(e.target.checked)} />
                I&apos;ve reviewed the warnings above and want to continue anyway
              </label>
            )}
          </div>
        )}

        {/* Step 3: Students */}
        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {includedStudentCount} of {students.length} students will be imported. Uncheck any that shouldn&apos;t be.
            </p>
            <div className="max-h-96 overflow-y-auto border rounded-lg divide-y">
              {students.map((s, i) => (
                <label key={i} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40">
                  <input
                    type="checkbox"
                    checked={s.include}
                    onChange={(e) => setStudents((prev) => prev.map((st, idx) => (idx === i ? { ...st, include: e.target.checked } : st)))}
                  />
                  <span className="font-mono text-primary">{s.studentId}</span>
                  <span className="text-muted-foreground">{s.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Step 4: Assessment mapping */}
        {step === 4 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Confirm each detected assessment. Category/CO-source are best guesses — check every row.
              {' '}Weightages currently sum to <strong className={weightageSum === 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>{weightageSum}%</strong>.
            </p>
            <div className="space-y-2 max-h-[26rem] overflow-y-auto">
              {assessments.map((a, i) => (
                <div key={i} className={`border rounded-lg p-3 ${a.include ? '' : 'opacity-50'}`}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <label className="flex items-center gap-2 font-medium text-sm">
                      <input type="checkbox" checked={a.include} onChange={(e) => updateAssessment(i, { include: e.target.checked })} />
                      {a.label}
                    </label>
                    <span className="text-xs text-muted-foreground">{a.enteredCount} / {includedStudentCount} marks entered</span>
                  </div>
                  {a.include && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Category</Label>
                        <Select value={a.category} onValueChange={(v) => updateAssessment(i, { category: v as ExamCategory })}>
                          <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CATEGORY_OPTIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Total Marks</Label>
                        <Input
                          type="number"
                          value={a.totalMarks}
                          onChange={(e) => updateAssessment(i, { totalMarks: parseFloat(e.target.value) || 0 })}
                          className="mt-1 h-8 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Weightage %</Label>
                        <Input
                          type="number"
                          value={a.weightage}
                          onChange={(e) => updateAssessment(i, { weightage: parseFloat(e.target.value) || 0 })}
                          className="mt-1 h-8 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">CO source</Label>
                        <Select
                          value={a.coGroupLabel ?? '__none__'}
                          onValueChange={(v) => updateAssessment(i, { coGroupLabel: v === '__none__' ? null : v })}
                        >
                          <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">No CO tracking</SelectItem>
                            {coGroups.map((g) => <SelectItem key={g.label} value={g.label}>{g.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 5: Review */}
        {step === 5 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="border rounded-lg p-3">
                <div className="text-xs text-muted-foreground">Course</div>
                <div className="font-medium">{courseCode} — {courseTitle}</div>
                <div className="text-xs text-muted-foreground mt-1">{courseType} · {semester} {year} · Section {section}</div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-xs text-muted-foreground">Roster</div>
                <div className="font-medium">{includedStudentCount} students</div>
              </div>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Exam</th>
                    <th className="text-left px-3 py-2">Category</th>
                    <th className="text-right px-3 py-2">Total</th>
                    <th className="text-right px-3 py-2">Weight</th>
                    <th className="text-left px-3 py-2">CO source</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {includedAssessments.map((a, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">{a.label}</td>
                      <td className="px-3 py-2">{a.category}</td>
                      <td className="px-3 py-2 text-right">{a.totalMarks}</td>
                      <td className="px-3 py-2 text-right">{a.weightage}%</td>
                      <td className="px-3 py-2 text-muted-foreground">{a.coGroupLabel || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {weightageSum !== 100 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>Weightages sum to {weightageSum}%, not 100% — you can fix this after import in Course Settings, or go back and adjust now.</AlertDescription>
              </Alert>
            )}
            {commitError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{commitError}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Step 6: Success */}
        {step === 6 && resultCourseId && (
          <div className="text-center py-8">
            <PartyPopper className="w-12 h-12 mx-auto mb-3 text-emerald-600 dark:text-emerald-400" />
            <p className="font-medium mb-1">Course imported</p>
            <p className="text-sm text-muted-foreground mb-4">Spot-check the Marks, Students, and CO-PO tabs before relying on this data.</p>
            <Button asChild>
              <a href={`/course/${resultCourseId}`}>Open Course →</a>
            </Button>
          </div>
        )}

        <DialogFooter className="flex gap-2">
          {step > 1 && step < 6 && (
            <Button variant="outline" onClick={() => setStep((s) => (s - 1) as typeof step)} disabled={parsing || committing}>
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
            </Button>
          )}
          <Button variant="ghost" onClick={handleClose} disabled={parsing || committing}>
            {step === 6 ? 'Close' : 'Cancel'}
          </Button>
          {step === 1 && (
            <Button onClick={handleUpload} disabled={!file || parsing}>
              {parsing ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Parsing...</> : <><Upload className="w-4 h-4 mr-1.5" /> Upload & Parse</>}
            </Button>
          )}
          {step === 2 && (
            <Button onClick={() => setStep(3)} disabled={!courseCode.trim() || !courseTitle.trim() || (parsed!.warnings.length > 0 && !acknowledgedWarnings)}>
              Next <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          )}
          {step === 3 && (
            <Button onClick={() => setStep(4)} disabled={includedStudentCount === 0}>
              Next <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          )}
          {step === 4 && (
            <Button onClick={() => setStep(5)} disabled={includedAssessments.length === 0}>
              Next <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          )}
          {step === 5 && (
            <Button onClick={handleCommit} disabled={committing}>
              {committing ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Importing...</> : <><Check className="w-4 h-4 mr-1.5" /> Import Course</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
