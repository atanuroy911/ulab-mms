'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Upload, Info, Copy, Check, FileText, Loader2, AlertTriangle, X, PlugZap, ExternalLink } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { parseCSV } from '@/app/utils/csv';
import { parsePdfRoster, courseCodeMatches, type PdfParseResult } from '@/lib/pdfStudentImport';
import {
  resolveExtensionId,
  connectAndStartImport,
  URMS_EXTENSION_STORE_URL,
  type ImportSession,
  type UrmsStudentsMessage,
  type UrmsMismatchMessage,
} from '@/lib/urmsExtensionImport';
import { toast } from 'sonner';

const FORMAT_HELP_PROMPT = `I will paste a student roster copied from the URMS Attendance Sheet page (https://urms-awp.ulab.edu.bd/AttendanceSheet), which contains student IDs, names, and possibly other columns such as email, section, or program.

Extract only the student ID and the student name for each row. Remove any leading "-" from the student ID. Ignore all other columns, including email addresses, section, program, and any other metadata.

Preserve the original order of the students exactly as they appear in the sheet.

Output only one student per line, in the following format:

Student ID, Student Name

Wrap the entire output inside a plain text code block (text) so it can be copied directly into another application.

Do not include tables, bullet points, explanations, summaries, notes, or any additional text. Output only the formatted list.`;

interface Student {
  _id: string;
  studentId: string;
  name: string;
}

interface ImportCourseInfo {
  code: string;
  name?: string;
  aliasEnabled?: boolean;
  alternateCode?: string;
  classTime?: string;
  classRoom?: string;
}

interface ImportStudentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  courseId: string;
  course: ImportCourseInfo;
  onImportComplete: () => Promise<void>;
  /** Called after the PDF's detected Class Time/Room are used to fill in blanks on the course. */
  onCourseUpdated?: () => void;
}

interface PdfSlotState {
  key: string;
  expectedCode: string;
  file: File | null;
  parsing: boolean;
  result: PdfParseResult | null;
  mismatchConfirmed: boolean;
}

function makeSlots(course: ImportCourseInfo): PdfSlotState[] {
  const slots: PdfSlotState[] = [
    { key: 'primary', expectedCode: course.code, file: null, parsing: false, result: null, mismatchConfirmed: false },
  ];
  if (course.aliasEnabled && course.alternateCode) {
    slots.push({
      key: 'alias',
      expectedCode: course.alternateCode,
      file: null,
      parsing: false,
      result: null,
      mismatchConfirmed: false,
    });
  }
  return slots;
}

export function ImportStudentsModal({
  isOpen,
  onClose,
  students,
  courseId,
  course,
  onImportComplete,
  onCourseUpdated,
}: ImportStudentsModalProps) {
  const [csvInput, setCsvInput] = useState('');
  const [deleteMissing, setDeleteMissing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState('');
  const [showFormatHelp, setShowFormatHelp] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [pdfSlots, setPdfSlots] = useState<PdfSlotState[]>(() => makeSlots(course));
  const [scheduleFilled, setScheduleFilled] = useState(false);
  const [urmsExtensionStatus, setUrmsExtensionStatus] = useState<'checking' | 'installed' | 'missing'>('checking');
  const [urmsImportState, setUrmsImportState] = useState<'idle' | 'waiting' | 'received'>('idle');
  const [urmsStudentCount, setUrmsStudentCount] = useState(0);
  const [urmsMismatch, setUrmsMismatch] = useState<{ courseId: string; expected: string[] } | null>(null);
  const urmsSessionRef = useRef<ImportSession | null>(null);
  const urmsExtensionIdRef = useRef<string | null>(null);
  const urmsWaitingRef = useRef(false);
  const urmsResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urmsWaitSinceRef = useRef(0);

  // The extension's service worker can go idle (and lose its in-memory port
  // reference) during a long URMS login, dropping our connection before the
  // student list ever arrives. Silently reconnect (without reopening the
  // URMS window) until either the result shows up or we give up.
  const URMS_RESUME_DELAY_MS = 3000;
  const URMS_WAIT_TIMEOUT_MS = 20 * 60 * 1000;

  const clearUrmsResumeTimer = () => {
    if (urmsResumeTimerRef.current) {
      clearTimeout(urmsResumeTimerRef.current);
      urmsResumeTimerRef.current = null;
    }
  };

  const checkUrmsExtension = () => {
    setUrmsExtensionStatus('checking');
    resolveExtensionId().then((id) => {
      urmsExtensionIdRef.current = id;
      setUrmsExtensionStatus(id ? 'installed' : 'missing');
    });
  };

  useEffect(() => {
    if (isOpen) checkUrmsExtension();
    return () => {
      urmsWaitingRef.current = false;
      clearUrmsResumeTimer();
      urmsSessionRef.current?.disconnect();
      urmsSessionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const urmsExpectedCourseCodes = [course.code, ...(course.aliasEnabled && course.alternateCode ? [course.alternateCode] : [])].filter(
    (code): code is string => Boolean(code)
  );

  const handleUrmsStudents = (message: UrmsStudentsMessage) => {
    urmsWaitingRef.current = false;
    clearUrmsResumeTimer();
    setUrmsMismatch(null);
    const lines = message.students.map((s) => `${s.studentId}, ${s.name}`);
    setCsvInput(lines.join('\n'));
    setUrmsStudentCount(message.students.length);
    setUrmsImportState('received');
    toast.success(`Received ${message.students.length} student(s) from URMS`);
  };

  const handleUrmsMismatch = (message: UrmsMismatchMessage) => {
    setUrmsMismatch({ courseId: message.courseId, expected: message.expectedCourseCodes });
  };

  const handleUrmsDisconnect = () => {
    urmsSessionRef.current = null;
    if (!urmsWaitingRef.current) return;

    if (Date.now() - urmsWaitSinceRef.current > URMS_WAIT_TIMEOUT_MS) {
      urmsWaitingRef.current = false;
      setUrmsImportState('idle');
      toast.error('Timed out waiting for the student list from URMS. Please try again.');
      return;
    }

    clearUrmsResumeTimer();
    urmsResumeTimerRef.current = setTimeout(() => {
      if (!urmsWaitingRef.current || !urmsExtensionIdRef.current) return;
      urmsSessionRef.current = connectAndStartImport(
        urmsExtensionIdRef.current,
        'resume',
        urmsExpectedCourseCodes,
        handleUrmsStudents,
        handleUrmsMismatch,
        handleUrmsDisconnect
      );
    }, URMS_RESUME_DELAY_MS);
  };

  const handleStartUrmsImport = () => {
    if (!urmsExtensionIdRef.current) return;
    clearUrmsResumeTimer();
    urmsSessionRef.current?.disconnect();
    urmsWaitingRef.current = true;
    urmsWaitSinceRef.current = Date.now();
    setUrmsImportState('waiting');
    setUrmsStudentCount(0);
    setUrmsMismatch(null);

    urmsSessionRef.current = connectAndStartImport(
      urmsExtensionIdRef.current,
      'start',
      urmsExpectedCourseCodes,
      handleUrmsStudents,
      handleUrmsMismatch,
      handleUrmsDisconnect
    );
  };

  const applyPdfSlotsToInput = (slots: PdfSlotState[]) => {
    const lines = slots
      .filter((slot) => slot.result && (courseCodeMatches(slot.result.courseInfo.code, slot.expectedCode) || slot.mismatchConfirmed))
      .flatMap((slot) => slot.result!.studentLines);
    setCsvInput(lines.join('\n'));
  };

  // If the course doesn't have a class time/room yet, fill them in from a trustworthy
  // (matched or confirmed) PDF's detected schedule -- one-shot per modal session.
  const maybeFillSchedule = async (result: PdfParseResult) => {
    if (scheduleFilled) return;
    const { classTime, classRoom } = result.courseInfo;
    const update: { classTime?: string; classRoom?: string } = {};
    if (!course.classTime?.trim() && classTime) update.classTime = classTime;
    if (!course.classRoom?.trim() && classRoom) update.classRoom = classRoom;
    if (Object.keys(update).length === 0) return;

    setScheduleFilled(true);
    try {
      const res = await fetch(`/api/courses/${courseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      if (res.ok) {
        toast.success('Filled in class time/room from the PDF');
        onCourseUpdated?.();
      }
    } catch (err) {
      console.error('Failed to auto-fill class time/room', err);
    }
  };

  const handlePdfFileSelect = async (slotKey: string, file: File) => {
    setPdfSlots((prev) => {
      const next = prev.map((s) => (s.key === slotKey ? { ...s, file, parsing: true, result: null, mismatchConfirmed: false } : s));
      return next;
    });

    try {
      const result = await parsePdfRoster(file);
      setPdfSlots((prev) => {
        const next = prev.map((s) => (s.key === slotKey ? { ...s, parsing: false, result } : s));
        applyPdfSlotsToInput(next);
        return next;
      });
      if (courseCodeMatches(result.courseInfo.code, pdfSlots.find((s) => s.key === slotKey)?.expectedCode || course.code)) {
        maybeFillSchedule(result);
      }
    } catch (err) {
      console.error('Failed to parse PDF', err);
      toast.error('Failed to read this PDF. Make sure it is a text-based (not scanned-image) PDF.');
      setPdfSlots((prev) => prev.map((s) => (s.key === slotKey ? { ...s, parsing: false } : s)));
    }
  };

  const handlePdfRemove = (slotKey: string) => {
    setPdfSlots((prev) => {
      const next = prev.map((s) => (s.key === slotKey ? { ...s, file: null, result: null, mismatchConfirmed: false } : s));
      applyPdfSlotsToInput(next);
      return next;
    });
  };

  const confirmPdfMismatch = (slotKey: string) => {
    setPdfSlots((prev) => {
      const next = prev.map((s) => (s.key === slotKey ? { ...s, mismatchConfirmed: true } : s));
      applyPdfSlotsToInput(next);
      const confirmedSlot = next.find((s) => s.key === slotKey);
      if (confirmedSlot?.result) maybeFillSchedule(confirmedSlot.result);
      return next;
    });
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(FORMAT_HELP_PROMPT);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy prompt', err);
      toast.error('Failed to copy prompt to clipboard');
    }
  };

  // Diffing logic
  const diffResult = useMemo(() => {
    if (!csvInput.trim()) {
      return { toAdd: [], unchanged: [], missing: [] };
    }

    const parsedStudents = parseCSV(csvInput);
    if (parsedStudents.length === 0) {
      return { toAdd: [], unchanged: [], missing: [] };
    }

    const currentStudentIds = new Set(students.map(s => s.studentId));
    const parsedStudentIds = new Set(parsedStudents.map(s => s.id));

    const toAdd = parsedStudents.filter(s => !currentStudentIds.has(s.id));
    const unchanged = parsedStudents.filter(s => currentStudentIds.has(s.id));
    
    // Find missing students (they exist in the course, but are not in the CSV)
    const missing = students.filter(s => !parsedStudentIds.has(s.studentId));

    return { toAdd, unchanged, missing };
  }, [csvInput, students]);

  const handleImport = async () => {
    try {
      if (diffResult.toAdd.length === 0 && diffResult.missing.length === 0) {
        setError('No new students to add or missing students to process.');
        return;
      }

      setIsImporting(true);
      setError('');

      let addedCount = 0;
      let deletedCount = 0;

      // 1. Add new students
      if (diffResult.toAdd.length > 0) {
        const response = await fetch('/api/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            courseId,
            students: diffResult.toAdd.map(s => ({
              studentId: s.id,
              name: s.name,
            })),
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Error adding students');
        }
        addedCount = data.students?.length || 0;
      }

      // 2. Delete missing students (if requested)
      if (deleteMissing && diffResult.missing.length > 0) {
        const studentIdsToDelete = diffResult.missing.map(s => s._id);
        const deleteResponse = await fetch(`/api/courses/${courseId}/students`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentIds: studentIdsToDelete }),
        });

        const deleteData = await deleteResponse.json().catch(() => ({}));
        if (!deleteResponse.ok) {
          throw new Error(deleteData.error || 'Error deleting missing students');
        }
        deletedCount = deleteData.deletedStudents || 0;
      }

      toast.success(`Import completed. Added ${addedCount} student(s)${deleteMissing ? `, removed ${deletedCount} student(s)` : ''}.`);
      setCsvInput('');
      setDeleteMissing(false);
      await onImportComplete();
      onClose();
    } catch (err: any) {
      setError(err.message || 'An error occurred during import');
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setCsvInput('');
    setDeleteMissing(false);
    setError('');
    setShowFormatHelp(false);
    setPdfSlots(makeSlots(course));
    setScheduleFilled(false);
    urmsWaitingRef.current = false;
    clearUrmsResumeTimer();
    urmsSessionRef.current?.disconnect();
    urmsSessionRef.current = null;
    setUrmsImportState('idle');
    setUrmsStudentCount(0);
    setUrmsMismatch(null);
    onClose();
  };

  const needsTwoPdfs = Boolean(course.aliasEnabled && course.alternateCode);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Import Students
            <button
              type="button"
              onClick={() => setShowFormatHelp(true)}
              className="text-muted-foreground hover:text-primary transition-colors"
              title="How to get your roster in this format"
              aria-label="How to get your roster in this format"
            >
              <Info className="w-4 h-4" />
            </button>
          </DialogTitle>
          <DialogDescription>
            Import multiple students by pasting a list or uploading a roster PDF. The list will be compared against
            the current roster.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="px-6 shrink-0 pt-4">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        <div className="space-y-4 overflow-y-auto min-h-0 flex-1 px-6 py-4">
          <Tabs defaultValue="paste">
            <TabsList>
              <TabsTrigger value="paste">Paste Text</TabsTrigger>
              <TabsTrigger value="pdf">Upload PDF</TabsTrigger>
              <TabsTrigger value="urms" className="gap-1.5">
                Import from URMS
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Beta</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="paste">
              <Label>Student List (ID and Name per line - comma, space, or hyphen separated)</Label>
              <textarea
                value={csvInput}
                onChange={(e) => setCsvInput(e.target.value)}
                className="w-full h-32 px-4 py-3 bg-background border rounded-lg focus:ring-2 focus:ring-ring text-foreground placeholder-muted-foreground mt-2 font-mono text-sm"
                placeholder="e.g.&#10;212014001, John Doe&#10;221016002 Jane Smith&#10;231016003 - Alex Roy"
              />
            </TabsContent>

            <TabsContent value="pdf" className="space-y-3">
              {needsTwoPdfs && (
                <Alert>
                  <AlertDescription className="text-xs">
                    This course has two codes ({course.code} and {course.alternateCode}). Upload both roster/attendance
                    PDFs for this course, one for each code.
                  </AlertDescription>
                </Alert>
              )}

              {pdfSlots.map((slot) => (
                <div key={slot.key} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">PDF for {slot.expectedCode}</Label>
                    {slot.file && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-xs text-muted-foreground"
                        onClick={() => handlePdfRemove(slot.key)}
                      >
                        <X className="w-3 h-3 mr-1" />
                        Remove
                      </Button>
                    )}
                  </div>

                  {!slot.file ? (
                    <label className="flex flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed p-4 text-center text-xs text-muted-foreground cursor-pointer hover:border-primary/50">
                      <FileText className="w-5 h-5" />
                      Click to select a PDF
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handlePdfFileSelect(slot.key, file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  ) : slot.parsing ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Reading {slot.file.name}...
                    </div>
                  ) : slot.result ? (
                    <div className="space-y-2">
                      <div className="text-xs text-muted-foreground">
                        {slot.file.name} &middot; {slot.result.studentLines.length} student row(s) found
                      </div>

                      {slot.result.courseInfo.code && courseCodeMatches(slot.result.courseInfo.code, slot.expectedCode) ? (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                          <Check className="w-3.5 h-3.5" />
                          Detected course {slot.result.courseInfo.code} matches {slot.expectedCode}
                        </div>
                      ) : slot.result.courseInfo.code ? (
                        <Alert variant="destructive" className="py-2">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <AlertDescription className="text-xs space-y-1.5">
                            <div>
                              This PDF looks like it&apos;s for course <strong>{slot.result.courseInfo.code}</strong>
                              {slot.result.courseInfo.name ? <> ({slot.result.courseInfo.name})</> : null}, not{' '}
                              <strong>{slot.expectedCode}</strong>.
                            </div>
                            {!slot.mismatchConfirmed ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                className="h-6 text-xs"
                                onClick={() => confirmPdfMismatch(slot.key)}
                              >
                                Use it anyway
                              </Button>
                            ) : (
                              <div className="text-xs italic">Using this PDF anyway.</div>
                            )}
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <Alert className="py-2">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <AlertDescription className="text-xs space-y-1.5">
                            <div>Couldn&apos;t detect a course code in this PDF -- please confirm it&apos;s the right file for {slot.expectedCode}.</div>
                            {!slot.mismatchConfirmed ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-6 text-xs"
                                onClick={() => confirmPdfMismatch(slot.key)}
                              >
                                Confirm and use
                              </Button>
                            ) : (
                              <div className="text-xs italic">Confirmed.</div>
                            )}
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  ) : null}
                </div>
              ))}
            </TabsContent>

            <TabsContent value="urms" className="space-y-3">
              <Alert>
                <AlertDescription className="text-xs">
                  Beta feature — imports the student list straight from URMS's Section Wise Result Entry
                  page using the ULAB Faculty Companion Chrome extension.
                </AlertDescription>
              </Alert>

              {urmsExtensionStatus === 'checking' && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Checking for the ULAB Faculty Companion extension...
                </div>
              )}

              {urmsExtensionStatus === 'missing' && (
                <div className="rounded-lg border p-3 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    This feature needs the <strong>ULAB Faculty Companion</strong> Chrome extension installed.
                  </p>
                  <div className="flex gap-2">
                    <Button asChild variant="outline" size="sm">
                      <a href={URMS_EXTENSION_STORE_URL} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                        Install Extension
                      </a>
                    </Button>
                    <Button variant="secondary" size="sm" onClick={checkUrmsExtension}>
                      I've installed it — check again
                    </Button>
                  </div>
                </div>
              )}

              {urmsExtensionStatus === 'installed' && (
                <div className="rounded-lg border p-3 space-y-3">
                  {urmsImportState === 'idle' && (
                    <>
                      <p className="text-sm text-muted-foreground">
                        This will open URMS's Section Wise Result Entry page in a popup. Log in if needed and
                        pick the Course / Section — once selected, the extension fetches the student list
                        automatically and closes the popup for you.
                      </p>
                      <Button onClick={handleStartUrmsImport} variant="outline" className="w-full">
                        <PlugZap className="w-4 h-4 mr-2" />
                        Start Import from URMS
                      </Button>
                    </>
                  )}

                  {urmsImportState === 'waiting' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Waiting for you to log in and select a Course / Section on the URMS popup...
                      </div>
                      {urmsMismatch && (
                        <Alert variant="destructive" className="py-2">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <AlertDescription className="text-xs">
                            You selected course <strong>{urmsMismatch.courseId}</strong> in URMS, but this MMS
                            course is <strong>{urmsMismatch.expected.join(' / ') || 'unset'}</strong>. Please pick
                            the matching course/section in the popup to continue.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}

                  {urmsImportState === 'received' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                        <Check className="w-4 h-4" />
                        Received {urmsStudentCount} student(s) from URMS
                      </div>
                      <Button onClick={handleStartUrmsImport} variant="secondary" size="sm">
                        Import a different section
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>

          {csvInput.trim() && diffResult.toAdd.length === 0 && diffResult.unchanged.length === 0 && diffResult.missing.length === 0 && (
             <Alert>
               <AlertDescription className="text-xs">
                 Please ensure the format is correct. Expected one student per line: StudentID followed by StudentName (comma, space, or hyphen separated).
               </AlertDescription>
             </Alert>
          )}

          {(diffResult.toAdd.length > 0 || diffResult.unchanged.length > 0 || diffResult.missing.length > 0) && (
            <div className="bg-muted/30 p-4 rounded-lg space-y-3 text-sm border">
              <h4 className="font-semibold text-foreground border-b pb-2">Import Summary</h4>
              <div className="grid grid-cols-3 gap-2 text-center pt-2">
                <div className="bg-green-500/10 text-green-600 dark:text-green-400 p-2 rounded">
                  <div className="font-bold text-lg">{diffResult.toAdd.length}</div>
                  <div className="text-xs">To Add</div>
                </div>
                <div className="bg-blue-500/10 text-blue-600 dark:text-blue-400 p-2 rounded">
                  <div className="font-bold text-lg">{diffResult.unchanged.length}</div>
                  <div className="text-xs">Unchanged</div>
                </div>
                <div className="bg-orange-500/10 text-orange-600 dark:text-orange-400 p-2 rounded">
                  <div className="font-bold text-lg">{diffResult.missing.length}</div>
                  <div className="text-xs">Missing</div>
                </div>
              </div>

              {diffResult.toAdd.length > 0 && (
                <div className="pt-2">
                  <div className="text-xs font-medium text-muted-foreground mb-1.5">
                    Students that will be added ({diffResult.toAdd.length}):
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-md border bg-background">
                    {diffResult.toAdd.map((s, idx) => (
                      <div
                        key={`${s.id}-${idx}`}
                        className="flex items-center justify-between px-3 py-1.5 text-xs border-b last:border-b-0"
                      >
                        <span className="text-foreground">{s.name}</span>
                        <span className="text-muted-foreground font-mono">{s.id}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {diffResult.missing.length > 0 && (
                <div className="pt-2">
                  <div className="text-xs font-medium text-muted-foreground mb-1.5">
                    Currently enrolled but not in this list ({diffResult.missing.length}):
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-md border bg-background">
                    {diffResult.missing.map((s) => (
                      <div
                        key={s._id}
                        className="flex items-center justify-between px-3 py-1.5 text-xs border-b last:border-b-0"
                      >
                        <span className="text-foreground">{s.name}</span>
                        <span className="text-muted-foreground font-mono">{s.studentId}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {diffResult.missing.length > 0 && (
                <div className="mt-4 pt-3 border-t">
                  <div className="flex items-start space-x-2">
                    <Checkbox 
                      id="deleteMissing" 
                      checked={deleteMissing} 
                      onCheckedChange={(checked) => setDeleteMissing(checked === true)}
                      className="mt-1"
                    />
                    <div className="grid gap-1.5 leading-none">
                      <label
                        htmlFor="deleteMissing"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-1.5 cursor-pointer text-destructive"
                      >
                        Delete missing students
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="w-4 h-4 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-[250px]">
                              <p>Checking this will permanently remove students (and their marks) who are currently enrolled but are missing from the imported CSV.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </label>
                      <p className="text-[13px] text-muted-foreground mt-1">
                        {diffResult.missing.length} student(s) likely dropped the course during Add/Drop and will be removed.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={handleClose} disabled={isImporting}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={isImporting || (!csvInput.trim()) || (diffResult.toAdd.length === 0 && (!deleteMissing || diffResult.missing.length === 0))}
          >
            {isImporting ? 'Processing...' : 'Confirm Import'}
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={showFormatHelp} onOpenChange={setShowFormatHelp}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Getting your roster into this format</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            If you copied a roster from the{' '}
            <a
              href="https://urms-awp.ulab.edu.bd/AttendanceSheet"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-primary"
            >
              URMS Attendance Sheet
            </a>{' '}
            (or any sheet with extra columns like email or section), paste the prompt below into an AI assistant
            (ChatGPT, Gemini, etc.), then paste your roster right after it. The AI will return a clean list you can
            paste directly into the box above.
          </DialogDescription>

          <div className="relative">
            <pre className="whitespace-pre-wrap break-words rounded-lg border bg-muted/30 p-4 text-xs max-h-80 overflow-y-auto">
              {FORMAT_HELP_PROMPT}
            </pre>
            <Button onClick={copyPrompt} size="sm" variant="secondary" className="absolute top-2 right-2">
              {promptCopied ? (
                <>
                  <Check className="w-4 h-4 mr-1.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-1.5" />
                  Copy
                </>
              )}
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFormatHelp(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
