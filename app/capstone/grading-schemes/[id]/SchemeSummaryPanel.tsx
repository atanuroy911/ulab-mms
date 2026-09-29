'use client';

import { Info, ListOrdered } from 'lucide-react';
import type { SchemeSummary } from '@/lib/schemeSummary';

/**
 * The scheme in plain words (lib/schemeSummary.ts): what the final score adds up, then each
 * part as numbered steps. Clicking a step shows its block on the canvas.
 */
export function SchemeSummaryPanel({ summary, onPick }: { summary: SchemeSummary; onPick: (nodeId: string) => void }) {
  return (
    <div className="space-y-5 p-4 text-sm">
      <p className="text-base leading-relaxed">{summary.headline}</p>

      {summary.parts.map((part, pi) => (
        <section key={part.nodeId} className="space-y-2 rounded-xl border p-3">
          <div className="flex items-baseline gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{pi + 1}</span>
            <button type="button" onClick={() => onPick(part.nodeId)} className="min-w-0 flex-1 text-left font-semibold hover:underline" title="Show this block">
              {part.title}
            </button>
            {part.max !== null && <span className="shrink-0 text-xs text-muted-foreground">up to {part.max}</span>}
          </div>
          {part.uses.length > 0 && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Uses:</span> {part.uses.join('; ')}
            </p>
          )}
          <ol className="space-y-1.5">
            {part.steps.map((step, si) => (
              <li key={si}>
                <button
                  type="button"
                  onClick={() => onPick(step.nodeId)}
                  className="flex w-full gap-2 rounded-md px-1.5 py-1 text-left leading-relaxed hover:bg-muted"
                  title={`Show “${step.label}” on the canvas`}
                >
                  {part.steps.length > 1 && <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{si + 1}.</span>}
                  <span className="min-w-0 flex-1">{step.text}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      ))}

      {summary.bands.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 font-semibold">
            <ListOrdered className="h-4 w-4" /> Letter grade
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {summary.bands.map((b, i) => {
              const next = summary.bands[i - 1];
              return (
                <span key={b.letter + b.min} className="rounded-md border px-2 py-1 text-xs tabular-nums" title={next ? `${b.min} up to below ${next.min}` : `${b.min} and above`}>
                  <span className="font-semibold">{b.letter}</span> {i === summary.bands.length - 1 && b.min <= 0 ? `below ${summary.bands[i - 1]?.min ?? ''}` : `${b.min}+`}
                </span>
              );
            })}
          </div>
        </section>
      )}

      {summary.notes.length > 0 && (
        <ul className="space-y-1.5 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
          {summary.notes.map((n) => (
            <li key={n} className="flex gap-1.5">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{n}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Written from the blocks themselves, so it always matches what the scheme calculates. Click a step to see its block.</p>
    </div>
  );
}
