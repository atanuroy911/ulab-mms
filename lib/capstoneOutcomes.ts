// Course outcomes (COs) for a capstone grading scheme, and how each is measured - the capstone
// counterpart of a normal course's CO-PO mapping. Client-safe: no Node or model imports, so
// the scheme editor uses the same defaults and validation as the server.
//
// Lives on the grading scheme (and is snapshotted into each published version) because the
// COs follow the assessment design: change the rubric or the components and the COs change
// with them, and a session graded under v3 must keep reporting v3's COs.

import { REPORT_RUBRICS, PRESENTATION_CRITERIA } from '@/lib/capstoneRubrics';
import type { CapstoneMarkComponent } from '@/models/CapstoneMarkSubmission';

/**
 * How one CO is measured for a student:
 * - `rubric`: the sum of that component's rubric criteria tagged with this CO (e.g. every
 *   report criterion labelled "[CO1]"), per grader, averaged over the supervisor and the
 *   counted evaluators - the workbook's "CO Report Evaluation" sheet.
 * - `component`: the component's final mark scaled to `max` (e.g. presentation 38.8/45 ->
 *   8.62 of 10) - the workbook's peer and presentation COs.
 */
export type OutcomeSource =
  | { kind: 'rubric'; component: 'report' | 'presentation' }
  | { kind: 'component'; component: CapstoneMarkComponent; max: number };

export type ComponentOutcomeSource = Extract<OutcomeSource, { kind: 'component' }>;

export interface CapstoneOutcome {
  /** "CO1", "CO2", ... - also the tag matched in rubric criterion labels. */
  key: string;
  description?: string;
  source: OutcomeSource;
  /**
   * A second measure added on top, e.g. 4098C's CO5 = the report criteria tagged [CO5] plus
   * the poster mark scaled to 20. Its marks add to the CO's total.
   */
  also?: ComponentOutcomeSource | null;
  /** Programme outcomes this CO maps to ("PO2", ...). */
  pos: string[];
}

export interface OutcomeThresholds {
  /** A student attains a CO/PO at this fraction of its marks (0.55 = 55%). */
  co: number;
  /** The class meets a CO when this fraction of students attain it (0.6 = 60%). */
  classTarget: number;
  po: number;
}

export interface CapstoneOutcomesConfig {
  /** The track whose rubric these COs are written against (tags and PO mapping differ by track). */
  track: 'A' | 'B' | 'C';
  outcomes: CapstoneOutcome[];
  thresholds: OutcomeThresholds;
}

export const PO_KEYS = Array.from({ length: 12 }, (_, i) => `PO${i + 1}`);

export const DEFAULT_THRESHOLDS: OutcomeThresholds = { co: 0.55, classTarget: 0.6, po: 0.55 };

/** Points per rubric criterion: report criteria are 0-3, presentation criteria 0/3/6/9. */
export const RUBRIC_CRITERION_MAX: Record<'report' | 'presentation', number> = { report: 3, presentation: 9 };

export function rubricLabels(component: 'report' | 'presentation', track: string): string[] {
  if (component === 'presentation') return PRESENTATION_CRITERIA;
  return (REPORT_RUBRICS[track as 'A' | 'B' | 'C'] || REPORT_RUBRICS.B).map((c) => c.label);
}

/** CO keys a criterion label is tagged with: "[CO1]" -> CO1, "[CO5: A1]" -> CO5. */
export function coTags(label: string): string[] {
  return [...label.matchAll(/\[(CO\d+)\b[^\]]*\]/gi)].map((m) => m[1].toUpperCase());
}

/** Indexes (the c0..cN rubricScores keys) of the criteria tagged with this CO. */
export function taggedCriteria(component: 'report' | 'presentation', track: string, key: string): number[] {
  return rubricLabels(component, track)
    .map((label, idx) => (coTags(label).includes(key.toUpperCase()) ? idx : -1))
    .filter((idx) => idx >= 0);
}

/** The marks a CO's main measure is out of (without any `also`). */
export function sourceMax(outcome: CapstoneOutcome, track: string): number {
  const src = outcome.source;
  if (src.kind === 'component') return src.max;
  return taggedCriteria(src.component, track, outcome.key).length * RUBRIC_CRITERION_MAX[src.component];
}

/** The marks a CO is out of: its main measure plus any `also`. */
export function outcomeMax(outcome: CapstoneOutcome, track: string): number {
  return sourceMax(outcome, track) + (outcome.also ? Number(outcome.also.max) || 0 : 0);
}

/**
 * The department's current COs, transcribed from public/templates/capstone/CSE 4098A/B
 * Spring 2026.xlsx and CSE4098C_Summer2026.xlsx ("CO-PO Attainment Analysis": assessment
 * items and CO->PO mapping).
 */
export function defaultOutcomes(track: 'A' | 'B' | 'C' | string | null | undefined): CapstoneOutcomesConfig {
  const report = (key: string, po: string): CapstoneOutcome => ({ key, source: { kind: 'rubric', component: 'report' }, pos: [po] });
  const scaled = (key: string, component: CapstoneMarkComponent, max: number, po: string): CapstoneOutcome => ({
    key,
    source: { kind: 'component', component, max },
    pos: [po],
  });

  const outcomes: CapstoneOutcome[] =
    track === 'C'
      ? [
          report('CO1', 'PO12'),
          report('CO2', 'PO11'),
          report('CO3', 'PO5'),
          report('CO4', 'PO3'),
          // The report's [CO5] criteria plus the poster, out of 20 (the workbook's "Poster" item).
          { ...report('CO5', 'PO4'), also: { kind: 'component', component: 'poster', max: 20 } },
          report('CO6', 'PO6'),
          report('CO7', 'PO7'),
          report('CO8', 'PO8'),
          scaled('CO9', 'peer', 5, 'PO9'),
          scaled('CO10', 'presentation', 10, 'PO10'),
        ]
      : track === 'A'
      ? [
          report('CO1', 'PO2'),
          report('CO2', 'PO12'),
          report('CO3', 'PO11'),
          scaled('CO4', 'peer', 5, 'PO9'),
          scaled('CO5', 'presentation', 10, 'PO10'),
        ]
      : [
          report('CO1', 'PO12'),
          report('CO2', 'PO2'),
          report('CO3', 'PO11'),
          report('CO4', 'PO5'),
          report('CO5', 'PO3'),
          report('CO6', 'PO4'),
          report('CO7', 'PO6'),
          report('CO8', 'PO7'),
          report('CO9', 'PO8'),
          scaled('CO10', 'peer', 5, 'PO9'),
          scaled('CO11', 'presentation', 10, 'PO10'),
        ];

  return { track: track === 'A' || track === 'C' ? track : 'B', outcomes, thresholds: { ...DEFAULT_THRESHOLDS } };
}

/**
 * Checks an outcomes config is usable. Returns every problem, like validateScheme, so the
 * editor can list them together. `track` is needed to check rubric tags exist.
 */
export function validateOutcomes(config: unknown, track: string): string[] {
  const issues: string[] = [];
  const cfg = config as Partial<CapstoneOutcomesConfig> | null;
  if (!cfg || typeof cfg !== 'object' || !Array.isArray(cfg.outcomes)) return ['Outcomes must be a list'];
  if (!['A', 'B', 'C'].includes(String(cfg.track))) issues.push('Choose the track these COs are written for');

  const seen = new Set<string>();
  for (const [i, o] of cfg.outcomes.entries()) {
    const where = o?.key ? String(o.key) : `Outcome ${i + 1}`;
    if (!o || typeof o.key !== 'string' || !/^CO\d+$/i.test(o.key)) {
      issues.push(`${where}: the key must look like CO1, CO2, ...`);
      continue;
    }
    const key = o.key.toUpperCase();
    if (seen.has(key)) issues.push(`${key} is listed twice`);
    seen.add(key);

    const src = o.source as OutcomeSource | undefined;
    if (!src || (src.kind !== 'rubric' && src.kind !== 'component')) {
      issues.push(`${key}: choose how it is measured`);
    } else if (src.kind === 'rubric') {
      if (src.component !== 'report' && src.component !== 'presentation') {
        issues.push(`${key}: only the report and presentation have rubrics`);
      } else if (taggedCriteria(src.component, track, key).length === 0) {
        issues.push(`${key}: no ${src.component} rubric criterion is tagged [${key}] for track ${track}`);
      }
    } else if (!(Number(src.max) > 0)) {
      issues.push(`${key}: the marks it is out of must be above 0`);
    }
    const also = o.also as ComponentOutcomeSource | null | undefined;
    if (also) {
      if (also.kind !== 'component') issues.push(`${key}: the added measure must be a component mark`);
      else if (!(Number(also.max) > 0)) issues.push(`${key}: the added measure must be out of more than 0`);
      else if (src?.kind === 'component' && src.component === also.component) issues.push(`${key}: the added measure repeats the main one`);
    }

    if (!Array.isArray(o.pos) || o.pos.some((p) => !PO_KEYS.includes(p))) {
      issues.push(`${key}: unknown programme outcome`);
    }
  }

  const t = cfg.thresholds as Partial<OutcomeThresholds> | undefined;
  for (const k of ['co', 'classTarget', 'po'] as const) {
    const v = Number(t?.[k]);
    if (!(v > 0 && v <= 1)) issues.push(`The ${k === 'classTarget' ? 'class target' : `${k.toUpperCase()} threshold`} must be between 1% and 100%`);
  }
  return issues;
}

/** Normalises keys and numbers of an incoming config (already validated). */
export function cleanOutcomes(config: CapstoneOutcomesConfig): CapstoneOutcomesConfig {
  return {
    track: config.track,
    outcomes: config.outcomes.map((o) => ({
      key: o.key.toUpperCase(),
      description: typeof o.description === 'string' ? o.description.trim() : '',
      source:
        o.source.kind === 'rubric'
          ? { kind: 'rubric', component: o.source.component }
          : { kind: 'component', component: o.source.component, max: Number(o.source.max) },
      ...(o.also ? { also: { kind: 'component' as const, component: o.also.component, max: Number(o.also.max) } } : {}),
      pos: [...new Set(o.pos)].sort((a, b) => PO_KEYS.indexOf(a) - PO_KEYS.indexOf(b)),
    })),
    thresholds: {
      co: Number(config.thresholds.co),
      classTarget: Number(config.thresholds.classTarget),
      po: Number(config.thresholds.po),
    },
  };
}
