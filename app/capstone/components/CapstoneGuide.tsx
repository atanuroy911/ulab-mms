'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarRange,
  CheckCircle2,
  ClipboardCheck,
  FileSpreadsheet,
  GitBranchPlus,
  GraduationCap,
  ListChecks,
  MessageSquareText,
  PenLine,
  Users,
  Workflow,
  Lock,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface Slide {
  icon: LucideIcon;
  title: string;
  body: string;
  steps: string[];
  /** Who this applies to, when not everyone. */
  who?: string;
  link?: { href: string; label: string };
}

const STAFF: Slide[] = [
  {
    icon: GraduationCap,
    title: 'Welcome to Capstone',
    body: 'Everything for the capstone project course lives here - from setting up a semester to moving groups on to the next stage.',
    steps: [
      'A session is one semester of capstone for your department.',
      'Groups belong to a track: A, then B, then C.',
      'Students write weekly journals; supervisors and evaluators give marks.',
      'Grades are calculated for you by the grading scheme.',
    ],
  },
  {
    icon: CalendarRange,
    title: 'Open a session',
    who: 'Coordinators',
    body: 'Start each semester by opening its session.',
    steps: ['Go to Sessions and press "Open Session".', 'Pick the semester and the number of journal weeks.', 'The session starts in "Setting up" - nobody can submit yet.'],
    link: { href: '/capstone/sessions', label: 'Go to Sessions' },
  },
  {
    icon: Workflow,
    title: 'Pin a grading scheme',
    who: 'Coordinators',
    body: 'A grading scheme turns marks into a final grade. Each track uses one.',
    steps: [
      'In the session, press "Grading Schemes" and pick one per track.',
      'Build or edit schemes from blocks - "Take 60% of", "Round", "Cap at 45" - or as formulas.',
      'Publish a scheme before pinning it; published versions never change under you.',
    ],
    link: { href: '/capstone/grading-schemes', label: 'Open grading schemes' },
  },
  {
    icon: Users,
    title: 'Create groups',
    who: 'Coordinators',
    body: 'Each group has a project title, a supervisor, students and evaluators.',
    steps: ['Press "New Group" in the session.', 'Add students by ID - they sign in with their ULAB Google account.', 'Add evaluators with "Add" in the group; invite anyone not yet registered by email.'],
  },
  {
    icon: ListChecks,
    title: 'Move through the stages',
    who: 'Coordinators',
    body: 'Every session shows a line of three stages with the one next step.',
    steps: [
      'Setting up: pin schemes, create groups, assign evaluators.',
      'Running: journals, marks and grading all happen here - check grades and export.',
      'Finished: results are published; move students on to the next session.',
    ],
  },
  {
    icon: MessageSquareText,
    title: 'Review weekly journals',
    who: 'Supervisors',
    body: 'Students write one entry a week. You give feedback once and the week locks.',
    steps: [
      'Open your group - the Weekly Journal tab shows who is waiting.',
      '"Review one by one" shows each entry with quick replies; or use "Bulk review".',
      'Students get one email with all your feedback when you finish.',
    ],
    link: { href: '/capstone', label: 'Open My Groups' },
  },
  {
    icon: ClipboardCheck,
    title: 'Enter marks',
    who: 'Supervisors & evaluators',
    body: 'Each group page has a tab for every mark you owe.',
    steps: ['Report and Presentation use the rubric - tap a level per criterion.', 'Peer and journal marks are number buttons - tap and save.', 'You see other graders’ marks only after submitting your own.'],
  },
  {
    icon: FileSpreadsheet,
    title: 'See grades and export',
    who: 'Coordinators',
    body: 'The Grades page shows every student’s marks and grade, by group or by student.',
    steps: ['Export the gradebook to Excel.', 'Print sheets and the course file (CO-PO) from "Print Sheets".', 'Tap a student to see exactly how their grade was calculated.'],
  },
  {
    icon: GitBranchPlus,
    title: 'Move groups to the next session',
    who: 'Coordinators',
    body: 'Once a session is Finished and its results are published, move groups on - A to B, B to C.',
    steps: [
      'On the Grades page press "Move to next session".',
      'Students with F or no grade are held back; W students stay but aren’t copied.',
      'Check, change any decision, and confirm. Track C completes the capstone.',
    ],
  },
];

const STUDENT: Slide[] = [
  {
    icon: GraduationCap,
    title: 'Your capstone',
    body: 'This page shows your group, your supervisor and your weekly journal.',
    steps: ['Your project and group members are at the top.', 'Your journal progress is right below.'],
  },
  {
    icon: PenLine,
    title: 'Write a journal entry each week',
    body: 'Press "Add journal entry" and answer a few short questions, one at a time.',
    steps: ['What you worked on (required).', 'What you finished, any problems, and your plan (optional).', 'Check your answers and submit - your supervisor is emailed.'],
  },
  {
    icon: MessageSquareText,
    title: 'Read your feedback',
    body: 'Your supervisor reviews each week once and leaves feedback.',
    steps: ['Feedback appears on the entry card, and arrives by email.', 'You can edit an entry until it is reviewed.'],
  },
  {
    icon: Lock,
    title: 'Reviewed weeks are closed',
    body: 'Once reviewed, a week is locked - it counts toward your journal mark.',
    steps: ['Missed a week? Pick it from the week list when adding an entry.', 'Talk to your supervisor if a week was closed by mistake.'],
  },
];

const seenKey = (audience: string) => `capstone-guide-seen:${audience}:v1`;

/**
 * The capstone tutorial: a short, classic slide-by-slide guide. Opens by itself the first
 * time someone uses capstone on this device; after that only from its button.
 */
export function CapstoneGuide({ audience }: { audience: 'staff' | 'student' }) {
  const slides = audience === 'student' ? STUDENT : STAFF;
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  // First visit: open once. Remembered on this device when dismissed or finished.
  useEffect(() => {
    let seen = true;
    try {
      seen = window.localStorage.getItem(seenKey(audience)) === '1';
    } catch {
      /* storage unavailable - don't pop up every time */
    }
    if (seen) return;
    const t = window.setTimeout(() => setOpen(true), 600);
    return () => window.clearTimeout(t);
  }, [audience]);

  const close = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(seenKey(audience), '1');
    } catch {
      /* not remembered */
    }
  };

  const slide = slides[index];
  const Icon = slide.icon;
  const last = index === slides.length - 1;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setIndex(0);
          setOpen(true);
        }}
        title="How to use Capstone"
        aria-label="Open the Capstone guide"
      >
        <BookOpen className="h-4 w-4 sm:mr-2" />
        <span className="hidden sm:inline">Guide</span>
      </Button>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent
          className="gap-0 overflow-hidden p-0 sm:max-w-3xl"
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' && !last) setIndex(index + 1);
            if (e.key === 'ArrowLeft' && index > 0) setIndex(index - 1);
          }}
        >
          <div className="grid min-h-[420px] sm:grid-cols-[240px_1fr]">
            {/* Illustration panel */}
            <div className="flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-6 sm:p-8">
              <span className="flex h-24 w-24 items-center justify-center rounded-2xl border bg-background shadow-sm">
                <Icon className="h-11 w-11 text-primary" strokeWidth={1.5} />
              </span>
              <span className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                Step {index + 1} of {slides.length}
              </span>
            </div>

            {/* Content */}
            <div className="flex flex-col p-6 sm:p-8">
              {slide.who && <span className="mb-2 w-fit rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">{slide.who}</span>}
              <DialogTitle className="font-serif text-2xl leading-tight">{slide.title}</DialogTitle>
              <DialogDescription className="mt-2 text-base leading-relaxed">{slide.body}</DialogDescription>
              <ol className="mt-5 space-y-2.5">
                {slide.steps.map((s, i) => (
                  <li key={s} className="flex items-start gap-3 text-sm leading-relaxed">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>
              {slide.link && (
                <Link href={slide.link.href} onClick={close} className="mt-4 inline-flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline">
                  {slide.link.label} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}

              {/* Navigation */}
              <div className="mt-auto flex items-center gap-3 pt-8">
                <div className="flex gap-1.5" aria-hidden>
                  {slides.map((s, i) => (
                    <button
                      key={s.title}
                      type="button"
                      tabIndex={-1}
                      onClick={() => setIndex(i)}
                      className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60')}
                    />
                  ))}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {!last && (
                    <Button variant="ghost" size="sm" onClick={close}>
                      Skip
                    </Button>
                  )}
                  <Button variant="outline" size="icon" onClick={() => setIndex(index - 1)} disabled={index === 0} aria-label="Previous">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  {last ? (
                    <Button onClick={close}>
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Got it
                    </Button>
                  ) : (
                    <Button onClick={() => setIndex(index + 1)} aria-label="Next">
                      Next <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

