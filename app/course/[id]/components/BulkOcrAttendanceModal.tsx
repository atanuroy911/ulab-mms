'use client';

import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, ImagePlus, X, CheckCircle2, HelpCircle, XCircle, Save } from 'lucide-react';
import { notify } from '@/app/utils/notifications';
import { parseCandidates, matchStudents, dedupeByStudent, type MatchResult, type RosterStudent } from '../lib/attendanceMatch';
import { recognizeImages, type OcrProgress } from '../lib/attendanceOcr';

interface Session {
  _id: string;
  open: boolean;
}

interface BulkOcrAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  students: RosterStudent[];
  activeSession: Session | null;
  onSaved: () => Promise<void> | void;
}

function StudentPicker({
  students,
  onSelect,
}: {
  students: RosterStudent[];
  onSelect: (student: RosterStudent) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = students.filter((student) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return student.name.toLowerCase().includes(q) || student.studentId.toLowerCase().includes(q);
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
          Change
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="border-b p-2">
          <Input
            placeholder="Search name or ID..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="h-8"
          />
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <div className="p-3 text-center text-sm text-muted-foreground">No matching student.</div>
          ) : (
            filtered.map((student) => (
              <div
                key={student._id}
                onClick={() => {
                  onSelect(student);
                  setOpen(false);
                  setQuery('');
                }}
                className="cursor-pointer rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
              >
                {student.name} <span className="text-muted-foreground">({student.studentId})</span>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const STATUS_BADGE: Record<MatchResult['status'], { label: string; className: string; icon: typeof CheckCircle2 }> = {
  matched: { label: 'Matched', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30', icon: CheckCircle2 },
  ambiguous: { label: 'Ambiguous', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30', icon: HelpCircle },
  unmatched: { label: 'Unmatched', className: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30', icon: XCircle },
};

export default function BulkOcrAttendanceModal({
  isOpen,
  onClose,
  courseId,
  students,
  activeSession,
  onSaved,
}: BulkOcrAttendanceModalProps) {
  const [pasteText, setPasteText] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);
  const [ocrResults, setOcrResults] = useState<MatchResult[] | null>(null);
  const [overrides, setOverrides] = useState<Record<number, RosterStudent | null>>({});
  const [ignored, setIgnored] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const pasteResults = useMemo<MatchResult[]>(() => {
    if (!pasteText.trim()) return [];
    const candidates = parseCandidates(pasteText);
    return dedupeByStudent(matchStudents(candidates, students));
  }, [pasteText, students]);

  const results = ocrResults ?? pasteResults;

  const resetReviewState = () => {
    setOverrides({});
    setIgnored(new Set());
  };

  const addImages = (files: FileList | File[]) => {
    const next = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (next.length === 0) return;
    setImages((prev) => [...prev, ...next]);
    setOcrResults(null);
    resetReviewState();
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setOcrResults(null);
    resetReviewState();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      addImages(files);
    }
  };

  const runOcr = async () => {
    if (images.length === 0) return;
    setOcrRunning(true);
    setOcrProgress(null);
    try {
      const texts = await recognizeImages(images, setOcrProgress);
      const candidates = texts.flatMap((text) => parseCandidates(text));
      const matched = dedupeByStudent(matchStudents(candidates, students));
      setOcrResults(matched);
      resetReviewState();
    } catch (err) {
      console.error('OCR failed', err);
      notify.error('Failed to run OCR on the uploaded images');
    } finally {
      setOcrRunning(false);
      setOcrProgress(null);
    }
  };

  const resolvedStudent = (result: MatchResult, index: number): RosterStudent | undefined => {
    if (index in overrides) return overrides[index] ?? undefined;
    return result.student;
  };

  const acceptedRows = results
    .map((result, index) => ({ result, index, student: resolvedStudent(result, index) }))
    .filter((row) => !ignored.has(row.index) && row.student);

  const summary = results.reduce(
    (acc, r) => {
      acc[r.status] += 1;
      return acc;
    },
    { matched: 0, ambiguous: 0, unmatched: 0 }
  );

  const handleClose = () => {
    setPasteText('');
    setImages([]);
    setOcrResults(null);
    resetReviewState();
    onClose();
  };

  const handleSave = async () => {
    if (!activeSession) return;
    const studentIds = Array.from(new Set(acceptedRows.map((row) => row.student!._id)));
    if (studentIds.length === 0) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/attendance`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSession._id, status: 'present', studentIds }),
      });
      const data = await res.json();
      if (res.ok) {
        notify.success(`Marked ${studentIds.length} student${studentIds.length !== 1 ? 's' : ''} present`);
        await onSaved();
        handleClose();
      } else {
        notify.error(data.error || 'Failed to save attendance');
      }
    } catch (err) {
      console.error('Error saving bulk attendance', err);
      notify.error('Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Attendance (Paste / Screenshot)</DialogTitle>
          <DialogDescription>
            Paste a list of IDs or names, or drop in Google Meet screenshots. Review the matches below before saving —
            OCR is imperfect, so double-check anything not marked &quot;Matched&quot;.
          </DialogDescription>
        </DialogHeader>

        {!activeSession && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            No attendance session is open. Open a session from the Attendance tab first, then come back here.
          </div>
        )}

        <Tabs defaultValue="paste">
          <TabsList>
            <TabsTrigger value="paste">Paste List</TabsTrigger>
            <TabsTrigger value="screenshots">Screenshots</TabsTrigger>
          </TabsList>

          <TabsContent value="paste">
            <textarea
              value={pasteText}
              onChange={(e) => {
                setPasteText(e.target.value);
                setOcrResults(null);
                resetReviewState();
              }}
              placeholder={'Paste one ID or name per line, e.g.:\n241016007\nNihad Kabir Samir\nMd. Atif Siddiqi (233016007)'}
              rows={6}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
            />
          </TabsContent>

          <TabsContent value="screenshots" className="space-y-3">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                if (e.dataTransfer.files) addImages(e.dataTransfer.files);
              }}
              onPaste={handlePaste}
              tabIndex={0}
              className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors focus:outline-none ${
                dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'
              }`}
            >
              <ImagePlus className="h-6 w-6 text-muted-foreground" />
              <div className="text-muted-foreground">
                Drag and drop screenshots here, click to browse, or paste (Ctrl+V) an image
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                Browse files
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addImages(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>

            {images.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {images.map((file, idx) => (
                  <div key={idx} className="relative">
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="h-16 w-24 rounded border object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-background border p-0.5"
                      aria-label="Remove image"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <Button type="button" onClick={runOcr} disabled={images.length === 0 || ocrRunning} className="w-full">
              {ocrRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {ocrProgress
                    ? `Reading image ${ocrProgress.imageIndex + 1} of ${ocrProgress.totalImages}... ${Math.round(ocrProgress.imageProgress * 100)}%`
                    : 'Loading OCR engine...'}
                </>
              ) : (
                'Run OCR'
              )}
            </Button>
          </TabsContent>
        </Tabs>

        {results.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="outline" className={STATUS_BADGE.matched.className}>{summary.matched} matched</Badge>
              <Badge variant="outline" className={STATUS_BADGE.ambiguous.className}>{summary.ambiguous} ambiguous</Badge>
              <Badge variant="outline" className={STATUS_BADGE.unmatched.className}>{summary.unmatched} unmatched</Badge>
            </div>

            <div className="max-h-72 overflow-y-auto rounded-lg border">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">Detected</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">Student</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">Status</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">Include</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {results.map((result, index) => {
                    const student = resolvedStudent(result, index);
                    const isIgnored = ignored.has(index);
                    const badge = STATUS_BADGE[result.status];
                    const Icon = badge.icon;
                    return (
                      <tr key={index} className={isIgnored ? 'opacity-40' : ''}>
                        <td className="px-3 py-2 text-muted-foreground">{result.candidate.rawText}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {student ? (
                              <span>
                                {student.name} <span className="text-muted-foreground">({student.studentId})</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground italic">No match</span>
                            )}
                            <StudentPicker
                              students={students}
                              onSelect={(picked) => setOverrides((prev) => ({ ...prev, [index]: picked }))}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={`gap-1 ${badge.className}`}>
                            <Icon className="h-3 w-3" />
                            {badge.label}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={!isIgnored}
                            onChange={(e) =>
                              setIgnored((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.delete(index);
                                else next.add(index);
                                return next;
                              })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!activeSession || saving || acceptedRows.length === 0}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Mark {acceptedRows.length} Present
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
