'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Loader2, Lock, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { JOURNAL_SECTIONS, composeJournal, emptyAnswers, parseJournal, type JournalAnswers } from '@/lib/journalSections';

export interface WizardTarget {
  groupId: string;
  week: number;
  /** Weeks the student may pick instead (unwritten ones) - empty when editing an entry. */
  weekChoices: number[];
  existingText: string | null;
  totalWeeks: number;
}

const MAX_LENGTH = 10000;
const draftKey = (groupId: string, week: number) => `capstone-journal-draft:${groupId}:${week}`;
function readDraft(key: string): JournalAnswers | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? { ...emptyAnswers(), ...parsed } : null;
  } catch {
    return null;
  }
}
function writeDraft(key: string, value: JournalAnswers | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable - drafts just aren't kept */
  }
}

/**
 * Writing one week's journal, one question per step, then a review screen before submitting.
 * Only the first question is required. An unsent draft is kept on this device.
 */
export function JournalWizard({
  target,
  onClose,
  onSaved,
}: {
  target: WizardTarget | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [week, setWeek] = useState(0);
  const [answers, setAnswers] = useState<JournalAnswers>(emptyAnswers());
  const [step, setStep] = useState(0);
  const [restored, setRestored] = useState(false);
  const [saving, setSaving] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Reset when a new target opens: saved text, else a draft from this device, else empty.
  const [openedFor, setOpenedFor] = useState<WizardTarget | null>(null);
  if (target && target !== openedFor) {
    setOpenedFor(target);
    setWeek(target.week);
    const saved = target.existingText ? parseJournal(target.existingText).answers : null;
    const draft = readDraft(draftKey(target.groupId, target.week));
    const useDraft = !!draft && composeJournal(draft) !== (target.existingText || '') && !!composeJournal(draft);
    setAnswers(useDraft ? draft! : saved || emptyAnswers());
    setRestored(useDraft);
    setStep(0);
  }
  if (!target && openedFor) setOpenedFor(null);

  const reviewStep = JOURNAL_SECTIONS.length;
  const section = JOURNAL_SECTIONS[step];
  const editing = !!target?.existingText;

  useEffect(() => {
    textRef.current?.focus();
  }, [step, target]);

  const update = (key: keyof JournalAnswers, value: string) => {
    const next = { ...answers, [key]: value };
    setAnswers(next);
    if (target) writeDraft(draftKey(target.groupId, week), next);
  };

  const changeWeek = (w: number) => {
    if (!target) return;
    // Carry what's typed over to the newly chosen week.
    writeDraft(draftKey(target.groupId, week), null);
    writeDraft(draftKey(target.groupId, w), answers);
    setWeek(w);
  };

  const composed = composeJournal(answers);
  const canContinue = !section?.required || answers[section.key].trim().length > 0;

  const submit = async () => {
    if (!target || !answers.worked.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/student/capstone/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `isNew`: the server refuses if this week was written meanwhile (another tab or device)
        // rather than silently replacing it.
        body: JSON.stringify({ groupId: target.groupId, weekNumber: week, workDone: composed, isNew: !editing }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      writeDraft(draftKey(target.groupId, week), null);
      toast.success(editing ? `Week ${week} updated - your supervisor has been told` : `Week ${week} submitted - your supervisor has been told`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 p-0 sm:max-w-2xl">
        {/* Header with week and step progress */}
        <div className="space-y-3 border-b px-5 pt-5 pb-4">
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <DialogTitle className="text-lg">{editing ? 'Edit' : 'New'} journal entry</DialogTitle>
            {target && target.weekChoices.length > 1 ? (
              <Select value={String(week)} onValueChange={(v) => changeWeek(Number(v))}>
                <SelectTrigger className="h-8 w-auto gap-1 font-medium" aria-label="Week">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {target.weekChoices.map((w) => (
                    <SelectItem key={w} value={String(w)}>
                      Week {w} of {target.totalWeeks}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="rounded-md border px-2 py-0.5 text-sm font-medium">
                Week {week} of {target?.totalWeeks}
              </span>
            )}
          </div>
          <DialogDescription className="sr-only">Answer a few short questions about your week.</DialogDescription>
          <div className="flex gap-1.5" aria-hidden>
            {[...JOURNAL_SECTIONS.map((s) => s.key), 'review'].map((k, i) => (
              <div key={k} className={cn('h-1.5 flex-1 rounded-full', i <= step ? 'bg-primary' : 'bg-muted')} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Step {Math.min(step + 1, reviewStep + 1)} of {reviewStep + 1}
            {restored && ' · restored your unsaved draft from this device'}
          </p>
        </div>

        {/* Step body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {step < reviewStep && section ? (
            <div className="space-y-3">
              <label htmlFor="journal-answer" className="block text-xl font-semibold leading-snug">
                {section.question}
                {!section.required && <span className="ml-2 text-sm font-normal text-muted-foreground">(optional)</span>}
              </label>
              <p className="text-sm text-muted-foreground">{section.hint}</p>
              <Textarea
                id="journal-answer"
                ref={textRef}
                rows={7}
                maxLength={MAX_LENGTH}
                value={answers[section.key]}
                onChange={(e) => update(section.key, e.target.value)}
                className="min-h-40 text-base leading-relaxed"
                placeholder="Write a few sentences or bullet points…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canContinue) {
                    e.preventDefault();
                    setStep(step + 1);
                  }
                }}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xl font-semibold">Check and submit</p>
              <div className="space-y-2">
                {JOURNAL_SECTIONS.map((s, i) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setStep(i)}
                    className="block w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/40"
                  >
                    <span className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {s.heading}
                      <span className="font-normal normal-case text-primary">Edit</span>
                    </span>
                    <span className={cn('mt-1 block whitespace-pre-wrap wrap-break-word text-sm', !answers[s.key].trim() && 'italic text-muted-foreground')}>
                      {answers[s.key].trim() || (s.required ? 'Required - tap to answer' : 'Skipped')}
                    </span>
                  </button>
                ))}
              </div>
              <p className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                Your supervisor is emailed when you submit. You can still edit it until they review it - after that it&apos;s locked.
              </p>
            </div>
          )}
        </div>

        {/* Big, obvious next step */}
        <div className="flex items-center gap-2 border-t px-5 py-4">
          {step > 0 ? (
            <Button variant="outline" size="lg" onClick={() => setStep(step - 1)} disabled={saving}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
          ) : (
            <Button variant="ghost" size="lg" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            {step < reviewStep ? (
              <>
                {!section?.required && !answers[section!.key].trim() && (
                  <Button variant="ghost" size="lg" onClick={() => setStep(step + 1)}>
                    Skip
                  </Button>
                )}
                <Button size="lg" onClick={() => setStep(step + 1)} disabled={!canContinue} className="min-w-32">
                  {step === reviewStep - 1 ? 'Review' : 'Next'} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button size="lg" onClick={submit} disabled={saving || !answers.worked.trim()} className="min-w-40">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : editing ? <Check className="mr-2 h-4 w-4" /> : <Send className="mr-2 h-4 w-4" />}
                {editing ? 'Save changes' : 'Submit week'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
