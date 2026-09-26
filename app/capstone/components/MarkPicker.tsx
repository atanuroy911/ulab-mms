'use client';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Picks a mark on a 0..max scale, in half-mark steps.
 *
 * Small scales (up to 10 - peer, weekly journal) are a row of number buttons plus a ½ toggle:
 * one tap, exact, and easy to scan down a group. A slider is imprecise at that size. Larger
 * scales get a slider for speed and a number box for exactness.
 */
export function MarkPicker({
  value,
  max,
  onChange,
  id,
  disabled,
}: {
  /** The typed/stored value as a string ('' = no mark yet), matching the page's state. */
  value: string;
  max: number;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
}) {
  const num = value === '' ? null : Number(value);
  const valid = num !== null && Number.isFinite(num);
  const whole = valid ? Math.floor(num!) : null;
  const half = valid && num! - Math.floor(num!) >= 0.5;

  // Buttons for whole marks up to the top of the scale; a fractional maximum (say 7.5) is
  // reached with +½ on the last button.
  const top = Math.floor(max);
  if (max <= 10) {
    const set = (w: number, h: boolean) => onChange(String(Math.min(max, w + (h ? 0.5 : 0))));
    return (
      <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-labelledby={id}>
        {Array.from({ length: top + 1 }, (_, n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={whole === n}
            disabled={disabled}
            onClick={() => set(n, half && n + 0.5 <= max)}
            className={cn(
              'h-9 w-9 rounded-lg border text-sm font-semibold tabular-nums transition-colors disabled:opacity-50',
              whole === n ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'bg-background hover:bg-muted'
            )}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={half}
          disabled={disabled || whole === null || whole + 0.5 > max}
          onClick={() => whole !== null && set(whole, !half)}
          title="Add half a mark"
          className={cn(
            'ml-1 h-9 rounded-lg border px-2.5 text-sm font-semibold transition-colors disabled:opacity-40',
            half ? 'border-primary bg-primary/15 text-primary' : 'bg-background hover:bg-muted'
          )}
        >
          +½
        </button>
        {valid && (
          <button
            type="button"
            onClick={() => onChange('')}
            disabled={disabled}
            className="ml-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            clear
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full items-center gap-3 sm:w-80">
      <input
        type="range"
        min={0}
        max={max}
        step={0.5}
        value={valid ? num! : 0}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-2 flex-1 cursor-pointer accent-primary"
        aria-labelledby={id}
      />
      <Input
        id={id}
        type="number"
        min={0}
        max={max}
        step={0.5}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn('w-20 text-right tabular-nums', valid && (num! < 0 || num! > max) && 'border-destructive')}
      />
    </div>
  );
}
