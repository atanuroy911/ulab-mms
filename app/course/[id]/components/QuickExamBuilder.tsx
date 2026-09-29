'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, ClipboardCopy, Eye, Loader2, Lock, Rocket, Save, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { MathMarkdown } from '@/components/MathMarkdown';
import { cn } from '@/lib/utils';
import { chatbotPrompt, optionLetter, parseExamText, type ParsedExam } from '@/lib/quickExam/format';
import { shuffled } from '@/lib/quickExam/paper';

export interface CourseExamOption {
  _id: string;
  displayName: string;
  totalMarks: number;
  examCategory?: string;
}

interface Form {
  title: string;
  instructions: string;
  durationMinutes: number;
  opensAt: string;
  closesAt: string;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showReview: boolean;
  requireFullscreen: boolean;
  takeAttendance: boolean;
  columnMode: 'new' | 'existing';
  examId: string;
  newExamName: string;
  newExamTotal: string;
  sourceText: string;
}

const EMPTY: Form = {
  title: '',
  instructions: '',
  durationMinutes: 20,
  opensAt: '',
  closesAt: '',
  shuffleQuestions: true,
  shuffleOptions: true,
  showReview: false,
  requireFullscreen: true,
  takeAttendance: true,
  columnMode: 'new',
  examId: '',
  newExamName: '',
  newExamTotal: '',
  sourceText: '',
};

const STEPS = ['Details', 'Questions', 'Review & publish'] as const;

/** ISO -> the value a datetime-local input shows (local time). */
const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * The three-step quick exam builder: details, paste the questions (with a live preview and a
 * ChatGPT prompt), then review and publish.
 */
export function QuickExamBuilder({
  courseId,
  examId: editingId,
  exams,
  onClose,
  onSaved,
}: {
  courseId: string;
  /** An existing quick exam to edit, or null for a new one. */
  examId: string | null;
  exams: CourseExamOption[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [id, setId] = useState<string | null>(editingId);
  const [form, setForm] = useState<Form>(EMPTY);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(!!editingId);
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(false);
  const [status, setStatus] = useState<'draft' | 'published' | 'closed'>('draft');
  const [serverProblems, setServerProblems] = useState<string[]>([]);

  useEffect(() => {
    if (!editingId) return;
    (async () => {
      try {
        const res = await fetch(`/api/courses/${courseId}/quick-exams/${editingId}`);
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Failed to load');
        setForm({
          title: d.title,
          instructions: d.instructions,
          durationMinutes: d.durationMinutes,
          opensAt: toLocalInput(d.opensAt),
          closesAt: toLocalInput(d.closesAt),
          shuffleQuestions: d.shuffleQuestions,
          shuffleOptions: d.shuffleOptions,
          showReview: d.showReview,
          requireFullscreen: d.requireFullscreen ?? true,
          takeAttendance: d.takeAttendance ?? true,
          columnMode: d.examId ? 'existing' : 'new',
          examId: d.examId || '',
          newExamName: d.newExamName || '',
          newExamTotal: d.newExamTotal ? String(d.newExamTotal) : '',
          sourceText: d.sourceText,
        });
        setLocked(d.locked);
        setStatus(d.status);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load');
        onClose();
      } finally {
        setLoading(false);
      }
    })();
  }, [courseId, editingId, onClose]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const parsed = useMemo(() => parseExamText(form.sourceText), [form.sourceText]);
  const questionCount = parsed.sets[0]?.questions.length ?? 0;

  const detailsProblems = [
    !form.title.trim() && 'Give the exam a title',
    !(form.durationMinutes >= 1 && form.durationMinutes <= 600) && 'Time limit must be 1 to 600 minutes',
    form.opensAt && form.closesAt && new Date(form.closesAt) <= new Date(form.opensAt) && 'The closing time must be after the opening time',
    form.columnMode === 'existing' && !form.examId && 'Choose the exam column the marks go into',
    form.columnMode === 'new' && !form.newExamName.trim() && 'Name the new marks column',
  ].filter(Boolean) as string[];

  const payload = () => ({
    title: form.title.trim(),
    instructions: form.instructions,
    durationMinutes: Number(form.durationMinutes),
    opensAt: form.opensAt ? new Date(form.opensAt).toISOString() : null,
    closesAt: form.closesAt ? new Date(form.closesAt).toISOString() : null,
    showReview: form.showReview,
    requireFullscreen: form.requireFullscreen,
    takeAttendance: form.takeAttendance,
    ...(locked
      ? {}
      : {
          sourceText: form.sourceText,
          shuffleQuestions: form.shuffleQuestions,
          shuffleOptions: form.shuffleOptions,
          ...(form.columnMode === 'existing'
            ? { examId: form.examId, newExamName: null }
            : { examId: null, newExamName: form.newExamName.trim(), newExamTotal: form.newExamTotal ? Number(form.newExamTotal) : null }),
        }),
  });

  const save = async (action?: 'publish') => {
    setSaving(true);
    setServerProblems([]);
    try {
      const res = id
        ? await fetch(`/api/courses/${courseId}/quick-exams/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload(), ...(action ? { action } : {}) }),
          })
        : await fetch(`/api/courses/${courseId}/quick-exams`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload(), publish: action === 'publish' }),
          });
      const d = await res.json();
      if (!res.ok) {
        if (Array.isArray(d.problems)) setServerProblems(d.problems);
        throw new Error(d.error || 'Failed to save');
      }
      setId(d._id);
      setStatus(d.status);
      toast.success(action === 'publish' ? 'Published - students can now take it' : 'Saved');
      onSaved(d._id);
      if (action === 'publish') onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const canNext = step === 0 ? detailsProblems.length === 0 : step === 1 ? parsed.ok : true;
  const column = exams.find((e) => e._id === form.examId);

  return (
    <div className="space-y-5">
      {/* Header and stepper */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Quick exams
        </Button>
        <h2 className="text-lg font-semibold">{id ? form.title || 'Quick exam' : 'New quick exam'}</h2>
        <Badge variant="outline" className="capitalize">
          {status}
        </Badge>
        {locked && (
          <Badge variant="secondary" className="gap-1">
            <Lock className="h-3 w-3" /> Students have started - questions locked
          </Badge>
        )}
      </div>
      <ol className="flex items-center" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label} className={cn('flex items-center', i < STEPS.length - 1 && 'flex-1')}>
            <button
              type="button"
              onClick={() => (i <= step || (i === 1 && detailsProblems.length === 0) || (i === 2 && detailsProblems.length === 0 && parsed.ok)) && setStep(i)}
              className="flex items-center gap-2"
              aria-current={i === step ? 'step' : undefined}
            >
              <span
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-bold',
                  i < step && 'border-emerald-500 bg-emerald-500 text-white',
                  i === step && 'border-primary bg-primary text-primary-foreground',
                  i > step && 'border-muted-foreground/30 text-muted-foreground'
                )}
              >
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={cn('hidden text-sm sm:inline', i === step ? 'font-semibold' : 'text-muted-foreground')}>{label}</span>
            </button>
            {i < STEPS.length - 1 && <span className={cn('mx-3 h-0.5 flex-1 rounded', i < step ? 'bg-emerald-500' : 'bg-border')} />}
          </li>
        ))}
      </ol>

      {step === 0 && <DetailsStep form={form} set={set} exams={exams} locked={locked} questionCount={questionCount} />}
      {step === 1 && <QuestionsStep form={form} set={set} parsed={parsed} locked={locked} />}
      {step === 2 && <ReviewStep form={form} parsed={parsed} column={column} problems={[...detailsProblems, ...serverProblems]} />}

      {/* Footer */}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 border-t bg-background/95 px-1 py-3 backdrop-blur">
        {step === 0 && detailsProblems.length > 0 && <span className="text-xs text-muted-foreground">{detailsProblems[0]}</span>}
        {step === 1 && !parsed.ok && form.sourceText.trim() && <span className="text-xs text-destructive">Fix the problems marked in the preview to continue</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} disabled={saving}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
            </Button>
          )}
          {status === 'draft' && (
            <Button variant="outline" onClick={() => save()} disabled={saving || !form.title.trim()}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Save draft
            </Button>
          )}
          {step < 2 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext}>
              Next <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          ) : status === 'draft' ? (
            <Button onClick={() => save('publish')} disabled={saving || detailsProblems.length > 0 || !parsed.ok}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Rocket className="mr-1.5 h-4 w-4" />} Publish
            </Button>
          ) : (
            <Button onClick={() => save()} disabled={saving || detailsProblems.length > 0}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Save changes
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step 1 ────────────────────────────────────────────────────────────────────────────────

function DetailsStep({
  form,
  set,
  exams,
  locked,
  questionCount,
}: {
  form: Form;
  set: <K extends keyof Form>(k: K, v: Form[K]) => void;
  exams: CourseExamOption[];
  locked: boolean;
  questionCount: number;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="space-y-4 rounded-xl border p-4">
        <h3 className="font-semibold">About the exam</h3>
        <div className="space-y-1.5">
          <Label htmlFor="qe-title">Title</Label>
          <Input id="qe-title" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Quiz 3 - Bayes' theorem" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qe-instr">Instructions for students (optional, Markdown)</Label>
          <Textarea id="qe-instr" rows={3} value={form.instructions} onChange={(e) => set('instructions', e.target.value)} placeholder="Calculators are allowed. Each question carries equal marks." />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="qe-dur">Time limit (minutes)</Label>
            <Input id="qe-dur" type="number" min={1} max={600} value={form.durationMinutes} onChange={(e) => set('durationMinutes', Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qe-open">Opens (optional)</Label>
            <Input id="qe-open" type="datetime-local" value={form.opensAt} onChange={(e) => set('opensAt', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qe-close">Closes (optional)</Label>
            <Input id="qe-close" type="datetime-local" value={form.closesAt} onChange={(e) => set('closesAt', e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          With no opening time, students can start as soon as you publish. With no closing time, it stays open until you close it.
          A student who starts late still gets the full time limit, but never past the closing time.
        </p>
      </section>

      <section className="space-y-4 rounded-xl border p-4">
        <h3 className="font-semibold">Marks</h3>
        <p className="text-sm text-muted-foreground">Each paper is marked the moment it is submitted, and the score goes into this column, scaled to its total.</p>
        <div className={cn('space-y-3', locked && 'pointer-events-none opacity-60')}>
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3">
            <input type="radio" className="mt-1" checked={form.columnMode === 'new'} onChange={() => set('columnMode', 'new')} />
            <span className="flex-1 space-y-2">
              <span className="block text-sm font-medium">A new Quiz column</span>
              {form.columnMode === 'new' && (
                <span className="grid gap-2 sm:grid-cols-[1fr_8rem]">
                  <Input value={form.newExamName} onChange={(e) => set('newExamName', e.target.value)} placeholder={form.title || 'Quiz name'} aria-label="New column name" />
                  <Input type="number" min={1} value={form.newExamTotal} onChange={(e) => set('newExamTotal', e.target.value)} placeholder={`Out of ${questionCount || '#Qs'}`} aria-label="Out of" />
                </span>
              )}
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3">
            <input type="radio" className="mt-1" checked={form.columnMode === 'existing'} onChange={() => set('columnMode', 'existing')} />
            <span className="flex-1 space-y-2">
              <span className="block text-sm font-medium">An existing exam column</span>
              {form.columnMode === 'existing' && (
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.examId} onChange={(e) => set('examId', e.target.value)}>
                  <option value="">Choose a column…</option>
                  {exams.map((e) => (
                    <option key={e._id} value={e._id}>
                      {e.displayName} (out of {e.totalMarks}){e.examCategory ? ` · ${e.examCategory}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </span>
          </label>
        </div>

        <h3 className="pt-2 font-semibold">Fairness</h3>
        <div className="space-y-2.5 text-sm">
          {(
            [
              ['shuffleQuestions', 'Shuffle the question order for each student', locked],
              ['shuffleOptions', 'Shuffle the options (A, B, C, ...) for each student', locked],
              ['requireFullscreen', 'Require full screen - leaving it clears the student’s answers and signs them out', false],
              ['showReview', 'After submitting, show students which answers were right', false],
              ['takeAttendance', 'Mark students present in Attendance for the day they take it (others that day are marked absent - turn off for take-home exams)', false],
            ] as const
          ).map(([key, label, disabled]) => (
            <label key={key} className={cn('flex cursor-pointer items-start gap-2', disabled && 'opacity-60')}>
              <Checkbox checked={form[key]} disabled={disabled} onCheckedChange={(v) => set(key, v === true)} className="mt-0.5" />
              {label}
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Step 2 ────────────────────────────────────────────────────────────────────────────────

function QuestionsStep({ form, set, parsed, locked }: { form: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void; parsed: ParsedExam; locked: boolean }) {
  const [activeSet, setActiveSet] = useState(0);
  const current = parsed.sets[Math.min(activeSet, Math.max(parsed.sets.length - 1, 0))];
  const problemCount = parsed.issues.length + parsed.sets.reduce((n, s) => n + s.issues.length + s.questions.filter((q) => q.issues.length).length, 0);
  return (
    <div className="space-y-4">
      <PromptHelper />
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="qe-src" className="font-semibold">
              Paste the questions and answer key
            </Label>
            <FormatGuide />
          </div>
          <Textarea
            id="qe-src"
            value={form.sourceText}
            onChange={(e) => set('sourceText', e.target.value)}
            disabled={locked}
            placeholder={'1. What is $2+2$?\nA. 3\nB. 4\nC. 5\nD. 6\n\n2. ...\n\nAnswer Key:\n1. B\n2. ...'}
            className="min-h-[28rem] flex-1 font-mono text-sm"
            spellCheck={false}
          />
        </section>

        <section className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">Preview</span>
            {parsed.sets.length > 0 && (
              <span className="text-sm text-muted-foreground">
                {parsed.sets.length} set{parsed.sets.length === 1 ? '' : 's'} × {parsed.sets[0].questions.length} question{parsed.sets[0].questions.length === 1 ? '' : 's'}
              </span>
            )}
            {form.sourceText.trim() &&
              (parsed.ok ? (
                <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
                  <CheckCircle2 className="h-3 w-3" /> Ready
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" /> {problemCount} problem{problemCount === 1 ? '' : 's'}
                </Badge>
              ))}
          </div>
          {parsed.issues.length > 0 && form.sourceText.trim() && (
            <ul className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {parsed.issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
          {parsed.sets.length > 1 && (
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Sets">
              {parsed.sets.map((s, i) => {
                const bad = s.issues.length + s.questions.filter((q) => q.issues.length).length;
                return (
                  <button
                    key={s.name + i}
                    type="button"
                    role="tab"
                    aria-selected={i === activeSet}
                    onClick={() => setActiveSet(i)}
                    className={cn('rounded-md border px-3 py-1 text-sm', i === activeSet ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted', bad && i !== activeSet && 'border-destructive/60 text-destructive')}
                  >
                    Set {s.name}
                    {bad ? ` · ${bad}` : ''}
                  </button>
                );
              })}
            </div>
          )}
          <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
            {!form.sourceText.trim() && <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Your questions appear here as students will see them, with the right answer marked for you.</p>}
            {current?.issues.map((i) => (
              <p key={i} className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Set {current.name}: {i}
              </p>
            ))}
            {current?.questions.map((q, qi) => (
              <article key={qi} className={cn('rounded-lg border p-3', q.issues.length > 0 && 'border-destructive/60 bg-destructive/5')}>
                <div className="flex gap-2">
                  <span className="shrink-0 font-mono text-sm font-semibold text-muted-foreground">{q.number}.</span>
                  <MathMarkdown className="flex-1 text-sm">{q.stem || '_(no question text)_'}</MathMarkdown>
                </div>
                <ol className="mt-2 space-y-1 pl-6">
                  {q.options.map((o, oi) => (
                    <li key={oi} className={cn('flex items-start gap-2 rounded px-2 py-1 text-sm', q.answer === oi && 'bg-emerald-500/15 font-medium')}>
                      <span className="shrink-0 font-semibold">{optionLetter(oi)}.</span>
                      <MathMarkdown inline className="flex-1">
                        {o}
                      </MathMarkdown>
                      {q.answer === oi && <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Correct answer" />}
                    </li>
                  ))}
                </ol>
                {q.issues.map((i) => (
                  <p key={i} className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {i}
                  </p>
                ))}
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function FormatGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setOpen(!open)}>
        {open ? 'Hide' : 'Show'} the format
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-[min(34rem,90vw)] space-y-3 rounded-xl border bg-popover p-4 text-sm shadow-lg">
          <p className="font-semibold">The format</p>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs leading-relaxed">{`Set A                       ← only if you have more than one set

1. Question text. Can span lines, use $x^2$ or
$$\\frac{a}{b}$$ and Markdown tables:
| x | 1 | 2 |
|---|---|---|
| p | 0.4 | 0.6 |
A. first option
B. second option
C. third option
D. fourth option

2. Next question …

Answer Key:
1. B
2. D                        ← or one letter per line, in order

Set B                       ← every set: same number of questions
…`}</pre>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>2 to 8 options per question, lettered A, B, C … in order.</li>
            <li>Leave a blank line between questions.</li>
            <li>Maths: $…$ inline, $$…$$ on their own lines. \(…\) and \[…\] also work.</li>
            <li>Each set has its own answer key after its last question.</li>
            <li>Each student gets one set, with questions and options shuffled.</li>
          </ul>
        </div>
      )}
    </div>
  );
}

function PromptHelper() {
  const [open, setOpen] = useState(false);
  const [p, setP] = useState({ topic: '', count: 10, sets: 1, options: 4, difficulty: 'medium', extra: '' });
  const prompt = chatbotPrompt(p);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success('Prompt copied - paste it into a new ChatGPT chat');
    } catch {
      toast.error('Could not copy - select the text and copy it');
    }
  };
  return (
    <section className="rounded-xl border bg-muted/20">
      <button type="button" className="flex w-full items-center gap-2 px-4 py-3 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="font-semibold">Write the questions with ChatGPT</span>
        <span className="text-sm text-muted-foreground">- a ready prompt that returns exactly this format</span>
        <ArrowRight className={cn('ml-auto h-4 w-4 transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="grid gap-4 border-t p-4 lg:grid-cols-[18rem_1fr]">
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <Label htmlFor="pr-topic">Topic / syllabus</Label>
              <Textarea id="pr-topic" rows={3} value={p.topic} onChange={(e) => setP({ ...p, topic: e.target.value })} placeholder="Conditional probability and Bayes' theorem (Chapter 3)" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label htmlFor="pr-n">Questions</Label>
                <Input id="pr-n" type="number" min={1} max={100} value={p.count} onChange={(e) => setP({ ...p, count: Math.max(1, Number(e.target.value)) })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pr-s">Sets</Label>
                <Input id="pr-s" type="number" min={1} max={8} value={p.sets} onChange={(e) => setP({ ...p, sets: Math.min(8, Math.max(1, Number(e.target.value))) })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pr-o">Options</Label>
                <Input id="pr-o" type="number" min={2} max={8} value={p.options} onChange={(e) => setP({ ...p, options: Math.min(8, Math.max(2, Number(e.target.value))) })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pr-d">Difficulty</Label>
              <select id="pr-d" className="h-9 w-full rounded-md border bg-background px-2" value={p.difficulty} onChange={(e) => setP({ ...p, difficulty: e.target.value })}>
                {['easy', 'medium', 'hard', 'mixed (easy to hard)'].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pr-x">Anything else (optional)</Label>
              <Input id="pr-x" value={p.extra} onChange={(e) => setP({ ...p, extra: e.target.value })} placeholder="Include 2 questions with a table" />
            </div>
            <p className="text-xs text-muted-foreground">
              The prompt is self-contained: it works in a brand-new chat and needs no saved memory or custom instructions. Check the answer key before publishing - chatbots make mistakes.
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <pre className="max-h-80 flex-1 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-3 text-xs leading-relaxed">{prompt}</pre>
            <Button onClick={copy} className="self-end">
              <ClipboardCopy className="mr-1.5 h-4 w-4" /> Copy prompt
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Step 3 ────────────────────────────────────────────────────────────────────────────────

function ReviewStep({ form, parsed, column, problems }: { form: Form; parsed: ParsedExam; column?: CourseExamOption; problems: string[] }) {
  const [sample, setSample] = useState(0);
  const questions = parsed.sets[0]?.questions.length ?? 0;
  const total = form.columnMode === 'existing' ? column?.totalMarks : Number(form.newExamTotal) || questions;
  const preview = useMemo(() => {
    const s = parsed.sets[sample % Math.max(parsed.sets.length, 1)];
    if (!s) return [];
    const qs = form.shuffleQuestions ? shuffled(s.questions) : s.questions;
    return qs.map((q) => ({ stem: q.stem, options: form.shuffleOptions ? shuffled(q.options) : q.options }));
    // `sample` changes on "Another student", so each press draws a new paper.
  }, [parsed, sample, form.shuffleQuestions, form.shuffleOptions]);
  const fmt = (v: string) => (v ? new Date(v).toLocaleString() : null);

  return (
    <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
      <section className="space-y-3 rounded-xl border p-4 text-sm">
        <h3 className="font-semibold">Summary</h3>
        <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5">
          <dt className="text-muted-foreground">Title</dt>
          <dd>{form.title}</dd>
          <dt className="text-muted-foreground">Questions</dt>
          <dd>
            {questions} per student · {parsed.sets.length} set{parsed.sets.length === 1 ? '' : 's'}
          </dd>
          <dt className="text-muted-foreground">Time limit</dt>
          <dd>{form.durationMinutes} minutes</dd>
          <dt className="text-muted-foreground">Opens</dt>
          <dd>{fmt(form.opensAt) || 'When published'}</dd>
          <dt className="text-muted-foreground">Closes</dt>
          <dd>{fmt(form.closesAt) || 'When you close it'}</dd>
          <dt className="text-muted-foreground">Marks go to</dt>
          <dd>
            {form.columnMode === 'existing' ? column?.displayName : `${form.newExamName} (new Quiz column)`} · out of {total}
          </dd>
          <dt className="text-muted-foreground">Each right answer</dt>
          <dd>{questions && total ? Math.round(((total as number) / questions) * 100) / 100 : '-'} mark(s)</dd>
          <dt className="text-muted-foreground">Shuffling</dt>
          <dd>{[form.shuffleQuestions && 'questions', form.shuffleOptions && 'options'].filter(Boolean).join(' and ') || 'none'}</dd>
          <dt className="text-muted-foreground">Full screen</dt>
          <dd>{form.requireFullscreen ? 'Required' : 'Not required'}</dd>
          <dt className="text-muted-foreground">After submitting</dt>
          <dd>{form.showReview ? 'Score and right answers' : 'Score only'}</dd>
          <dt className="text-muted-foreground">Attendance</dt>
          <dd>{form.takeAttendance ? 'Takers marked present for that day' : 'Not taken'}</dd>
        </dl>
        {problems.length > 0 && (
          <ul className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-destructive">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </section>
      <section className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold">What a student sees</span>
          <span className="text-sm text-muted-foreground">(one possible paper - the right answer is not shown to them)</span>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => setSample((n) => n + 1)}>
            Another student
          </Button>
        </div>
        <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">
          {preview.map((q, i) => (
            <article key={i} className="rounded-lg border p-4">
              <div className="flex gap-2">
                <span className="shrink-0 font-semibold">{i + 1}.</span>
                <MathMarkdown className="flex-1">{q.stem}</MathMarkdown>
              </div>
              <div className="mt-3 space-y-1.5 pl-6">
                {q.options.map((o, oi) => (
                  <div key={oi} className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
                    <span className="font-semibold">{optionLetter(oi)}.</span>
                    <MathMarkdown inline className="flex-1">
                      {o}
                    </MathMarkdown>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
