'use client';

import { PRESENTATION_CRITERIA, PRESENTATION_LEVELS, PRESENTATION_MAX, sumRubricScores } from '@/lib/capstoneRubrics';

export interface GridStudent {
  id: string;
  name: string;
  studentId: string;
}

/**
 * The per-student presentation rubric (5 criteria x 0/3/6/9). Used by graders on the group's
 * Presentation tab and by coordinators entering an evaluator's paper sheet, so both see and
 * produce exactly the same thing.
 */
export function PresentationRubricGrid({
  students,
  scores,
  onScore,
  disabled,
}: {
  students: GridStudent[];
  /** studentAccountId -> criterion key (c0..c4) -> score */
  scores: Record<string, Record<string, number>>;
  onScore: (studentId: string, criterionKey: string, value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs">
          <tr>
            <th className="p-2 text-left font-medium">Student</th>
            {PRESENTATION_CRITERIA.map((criterion, idx) => (
              <th key={idx} className="min-w-[9rem] p-2 text-center font-medium">
                {criterion}
              </th>
            ))}
            <th className="p-2 text-center font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student) => {
            const row = scores[student.id] || {};
            const filled = Object.keys(row).length;
            return (
              <tr key={student.id} className="border-t">
                <td className="p-2 align-middle">
                  <div className="font-medium">{student.name}</div>
                  <div className="text-xs text-muted-foreground">{student.studentId}</div>
                </td>
                {PRESENTATION_CRITERIA.map((criterion, idx) => (
                  <td key={idx} className="p-2 text-center align-middle">
                    <div className="inline-flex gap-1">
                      {PRESENTATION_LEVELS.map((level) => (
                        <button
                          key={level.value}
                          type="button"
                          disabled={disabled}
                          title={`${criterion}: ${level.label}`}
                          aria-label={`${student.name}, ${criterion}: ${level.label} (${level.value})`}
                          aria-pressed={row[`c${idx}`] === level.value}
                          onClick={() => onScore(student.id, `c${idx}`, level.value)}
                          className={`h-7 w-7 rounded-md border text-xs font-medium transition-colors disabled:opacity-50 ${
                            row[`c${idx}`] === level.value ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'
                          }`}
                        >
                          {level.value}
                        </button>
                      ))}
                    </div>
                  </td>
                ))}
                <td className="whitespace-nowrap p-2 text-center align-middle">
                  <strong>{sumRubricScores(row)}</strong>/{PRESENTATION_MAX}
                  {filled > 0 && filled < PRESENTATION_CRITERIA.length && (
                    <div className="text-[11px] text-amber-600">{PRESENTATION_CRITERIA.length - filled} left</div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
