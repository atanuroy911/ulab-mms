'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PlugZap, ExternalLink, Loader2, Check, AlertTriangle } from 'lucide-react';
import { calculateLetterGrade } from '@/app/utils/grading';
import {
  resolveExtensionId,
  connectAndStartGradeFill,
  URMS_EXTENSION_STORE_URL,
  type ImportSession,
  type UrmsGradeFillStatus,
  type GradeToFill,
  type GradeCodeGroup,
  type GradeNameMismatch,
} from '@/lib/urmsExtensionImport';

interface UrmsAutoFillGradesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: any;
  students: any[];
  calculateFinalGrade: (studentId: string) => { total: number };
  /** Also opens the existing "Calculated Grades" side panel so the user can cross-check. */
  onOpenSidePanel?: () => void;
}

export default function UrmsAutoFillGradesModal({
  open,
  onOpenChange,
  course,
  students,
  calculateFinalGrade,
  onOpenSidePanel,
}: UrmsAutoFillGradesModalProps) {
  const [extensionStatus, setExtensionStatus] = useState<'checking' | 'installed' | 'missing'>('checking');
  const [fillState, setFillState] = useState<'idle' | 'waiting' | 'filled' | 'saved'>('idle');
  const [filledCount, setFilledCount] = useState(0);
  const [notFoundCount, setNotFoundCount] = useState(0);
  const [nameMismatches, setNameMismatches] = useState<GradeNameMismatch[]>([]);
  const [mismatch, setMismatch] = useState<{ courseId: string; expected: string[] } | null>(null);
  const [noMatches, setNoMatches] = useState<{ courseId: string; section: string; expectedSection?: string; rosterCount: number } | null>(
    null
  );

  const extensionIdRef = useRef<string | null>(null);
  const sessionRef = useRef<ImportSession | null>(null);

  useEffect(() => {
    if (!open) return;
    setExtensionStatus('checking');
    resolveExtensionId().then((id) => {
      extensionIdRef.current = id;
      setExtensionStatus(id ? 'installed' : 'missing');
    });
    return () => {
      sessionRef.current?.disconnect();
      sessionRef.current = null;
    };
  }, [open]);

  const hasAliasSplit = Boolean(course?.aliasEnabled && course?.alternateCode);

  const toGradeToFill = (s: any): GradeToFill => {
    const gradeObj = calculateLetterGrade(calculateFinalGrade(s._id).total, course?.gradingScale);
    // URMS's dropdown values are plain (e.g. "A-", "B+", "F") — `display` is
    // the descriptive form ("A- (Minus)", "F (Fail)") meant for UI text, not
    // form submission.
    const modifierSymbol = gradeObj.modifier === '1' ? '-' : gradeObj.modifier === '2' ? '+' : '';
    const plainGrade = `${gradeObj.letter}${modifierSymbol}`;
    return { studentId: s.studentId, name: s.name, grade: plainGrade };
  };

  /**
   * URMS lists old-code/new-code courses as fully separate, disjoint
   * rosters — MMS just tags each student with `useAlias`. Group grades by
   * which real URMS course they belong under (same split UrmsGradeSheet
   * uses) so the extension only fills the group matching whatever code the
   * user actually selected, instead of a merged list.
   */
  const buildCodeGroups = (): GradeCodeGroup[] => {
    const withId = students.filter((s) => s.studentId);
    if (!hasAliasSplit) {
      return course?.code ? [{ code: course.code, grades: withId.map(toGradeToFill) }] : [];
    }
    const groups: GradeCodeGroup[] = [];
    if (course?.code) {
      groups.push({ code: course.code, grades: withId.filter((s) => !s.useAlias).map(toGradeToFill) });
    }
    if (course?.alternateCode) {
      groups.push({ code: course.alternateCode, grades: withId.filter((s) => s.useAlias).map(toGradeToFill) });
    }
    return groups;
  };

  const handleStatus = (status: UrmsGradeFillStatus) => {
    if (status.type === 'GRADES_FILLED') {
      setMismatch(null);
      setNoMatches(null);
      setFilledCount(status.filled);
      setNotFoundCount(status.notFound);
      setNameMismatches(status.nameMismatches || []);
      setFillState('filled');
    } else if (status.type === 'GRADES_SAVED') {
      setFillState('saved');
    } else if (status.type === 'COURSE_MISMATCH') {
      setNoMatches(null);
      setMismatch({ courseId: status.courseId, expected: status.expectedCourseCodes });
    } else if (status.type === 'NO_MATCHES') {
      setMismatch(null);
      setNoMatches({
        courseId: status.courseId,
        section: status.section,
        expectedSection: status.expectedSection,
        rosterCount: status.rosterCount,
      });
    }
  };

  const handleStart = () => {
    if (!extensionIdRef.current) return;
    sessionRef.current?.disconnect();
    setMismatch(null);
    setNoMatches(null);
    setFillState('waiting');
    setFilledCount(0);
    setNotFoundCount(0);
    setNameMismatches([]);
    onOpenSidePanel?.();

    sessionRef.current = connectAndStartGradeFill(
      extensionIdRef.current,
      buildCodeGroups(),
      course?.section,
      handleStatus,
      () => {
        sessionRef.current = null;
      }
    );
  };

  const handleClose = () => {
    sessionRef.current?.disconnect();
    sessionRef.current = null;
    setFillState('idle');
    setFilledCount(0);
    setNotFoundCount(0);
    setNameMismatches([]);
    setMismatch(null);
    setNoMatches(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlugZap className="w-5 h-5" />
            Auto-Fill Grades in URMS
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Beta</Badge>
          </DialogTitle>
          <DialogDescription>
            Opens URMS and automatically fills in the grade dropdowns for you. You review and click{' '}
            <strong>Save</strong> yourself — this never submits anything to URMS on its own.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {extensionStatus === 'checking' && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Checking for the ULAB Faculty Companion extension...
            </div>
          )}

          {extensionStatus === 'missing' && (
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
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setExtensionStatus('checking');
                    resolveExtensionId().then((id) => {
                      extensionIdRef.current = id;
                      setExtensionStatus(id ? 'installed' : 'missing');
                    });
                  }}
                >
                  I&apos;ve installed it — check again
                </Button>
              </div>
            </div>
          )}

          {extensionStatus === 'installed' && (
            <div className="rounded-lg border p-3 space-y-3">
              {fillState === 'idle' && (
                <>
                  <p className="text-sm text-muted-foreground">
                    This will open URMS's Section Wise Result Entry page in a popup. Log in if needed and pick the
                    Course / Section — grades will be filled in automatically for you to review and save.
                  </p>
                  <Button onClick={handleStart} variant="outline" className="w-full">
                    <PlugZap className="w-4 h-4 mr-2" />
                    Start Auto-Fill
                  </Button>
                </>
              )}

              {fillState === 'waiting' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Waiting for you to log in and select a Course / Section on the URMS popup...
                  </div>
                  {mismatch && (
                    <Alert variant="destructive" className="py-2">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <AlertDescription className="text-xs">
                        You selected course <strong>{mismatch.courseId}</strong> in URMS, but this MMS course is{' '}
                        <strong>{mismatch.expected.join(' / ') || 'unset'}</strong>. Please pick the matching
                        course/section in the popup to continue.
                      </AlertDescription>
                    </Alert>
                  )}
                  {noMatches && (
                    <Alert variant="destructive" className="py-2">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <AlertDescription className="text-xs">
                        No MMS students matched the {noMatches.rosterCount} student(s) loaded for course{' '}
                        <strong>{noMatches.courseId}</strong>, section <strong>{noMatches.section}</strong>.
                        {noMatches.expectedSection && noMatches.expectedSection !== noMatches.section && (
                          <>
                            {' '}
                            This MMS course is section <strong>{noMatches.expectedSection}</strong> — try selecting
                            that section in the popup instead.
                          </>
                        )}
                        {(!noMatches.expectedSection || noMatches.expectedSection === noMatches.section) && (
                          <> Open the browser console (F12) on the URMS popup for a full ID comparison.</>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              {fillState === 'filled' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                    <Check className="w-4 h-4" />
                    Filled {filledCount} grade(s) in the URMS popup
                    {notFoundCount > 0 && ` (${notFoundCount} not matched)`}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Go to the URMS popup, verify the grades, then click <strong>Save</strong> there.
                  </p>
                  {nameMismatches.length > 0 && (
                    <Alert variant="destructive" className="py-2">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <AlertDescription className="text-xs space-y-1">
                        <div>{nameMismatches.length} student ID matched but the name differs — please double-check:</div>
                        <ul className="list-disc pl-4">
                          {nameMismatches.map((m) => (
                            <li key={m.studentId}>
                              {m.studentId}: URMS has &quot;{m.urmsName}&quot;, MMS has &quot;{m.mmsName}&quot;
                            </li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              {fillState === 'saved' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                    <Check className="w-4 h-4" />
                    Grades saved in URMS!
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Check the URMS popup — it will prompt you to print the grade sheet.
                  </p>
                  <Button onClick={handleStart} variant="secondary" size="sm">
                    Fill a different section
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
