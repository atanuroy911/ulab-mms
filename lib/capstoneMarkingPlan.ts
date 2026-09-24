import CapstoneSession from '@/models/CapstoneSession';
import GradingScheme from '@/models/GradingScheme';
import type { CapstoneMarkComponent } from '@/models/CapstoneMarkSubmission';
import { REPORT_RUBRICS, PRESENTATION_MAX } from '@/lib/capstoneRubrics';

/**
 * Who has to mark what, per track - derived from the track's ACTIVE grading scheme rather
 * than hard-coded.
 *
 * Each `source` block in a scheme reads one component (report, presentation, peer, ...) from
 * one set of graders (`scope`): the supervisor, or evaluators (chosen or all). So the scheme
 * already says who marks what: a block `presentation / supervisor` means the supervisor gives
 * a presentation mark. Add a block (say `poster / supervisor`) and the supervisor is asked for
 * a poster mark; remove the supervisor's presentation block and they are no longer asked.
 *
 * With no scheme pinned yet, the department's long-standing default applies.
 */

export type GraderRole = 'supervisor' | 'evaluator';

export interface MarkingRequirement {
  component: CapstoneMarkComponent;
  /** Highest mark allowed when entering it. */
  max: number;
}

export interface MarkingPlan {
  /** 'scheme' when read from the pinned scheme; 'default' when none is pinned yet. */
  source: 'scheme' | 'default';
  schemeName?: string;
  schemeVersion?: number;
  supervisor: MarkingRequirement[];
  evaluator: MarkingRequirement[];
}

const COMPONENT_ORDER: CapstoneMarkComponent[] = ['report', 'presentation', 'peer', 'weeklyJournal', 'poster'];

/** The fixed scale of each component (rubrics define report/presentation; the rest by policy). */
export function defaultMax(component: CapstoneMarkComponent, track: string): number {
  switch (component) {
    case 'report':
      return (REPORT_RUBRICS[track as 'A' | 'B' | 'C'] || REPORT_RUBRICS.B).length * 3;
    case 'presentation':
      return PRESENTATION_MAX;
    case 'peer':
      return 5;
    case 'weeklyJournal':
      return 10;
    default:
      return 100;
  }
}

/** Before any scheme is pinned: what the department has always used. */
export function defaultMarkingPlan(track: string): MarkingPlan {
  const req = (c: CapstoneMarkComponent) => ({ component: c, max: defaultMax(c, track) });
  return {
    source: 'default',
    supervisor: ['report', 'presentation', 'peer', 'weeklyJournal'].map((c) => req(c as CapstoneMarkComponent)),
    evaluator: ['report', 'presentation'].map((c) => req(c as CapstoneMarkComponent)),
  };
}

/**
 * Reads the requirements off a scheme graph's source blocks. Rubric components keep their
 * rubric's scale; other components use the block's "rubric maximum override" when set.
 */
export function planFromGraph(
  graph: { nodes?: Array<{ type: string; data?: Record<string, unknown> }> },
  track: string
): Pick<MarkingPlan, 'supervisor' | 'evaluator'> {
  const found: Record<GraderRole, Map<CapstoneMarkComponent, number>> = { supervisor: new Map(), evaluator: new Map() };
  for (const node of graph.nodes || []) {
    if (node.type !== 'source' || !node.data) continue;
    const component = node.data.component as CapstoneMarkComponent;
    if (!COMPONENT_ORDER.includes(component)) continue;
    const role: GraderRole = node.data.scope === 'supervisor' ? 'supervisor' : 'evaluator';
    const override = Number(node.data.rubricMaxOverride);
    const rubric = component === 'report' || component === 'presentation';
    const max = !rubric && Number.isFinite(override) && override > 0 ? override : defaultMax(component, track);
    found[role].set(component, Math.max(found[role].get(component) || 0, max));
  }
  const list = (role: GraderRole) =>
    COMPONENT_ORDER.filter((c) => found[role].has(c)).map((c) => ({ component: c, max: found[role].get(c)! }));
  return { supervisor: list('supervisor'), evaluator: list('evaluator') };
}

/** The components a role marks under a plan. */
export function componentsFor(plan: MarkingPlan, role: GraderRole): CapstoneMarkComponent[] {
  return plan[role].map((r) => r.component);
}

/**
 * The plan for one track of one session: its pinned scheme version (or, as grading does, the
 * scheme's current draft when nothing is published), else the default.
 */
export async function getMarkingPlan(sessionId: unknown, track: string): Promise<MarkingPlan> {
  const session = await CapstoneSession.findById(sessionId).select('tracks').lean<{
    tracks?: Array<{ track: string; gradingSchemeId?: unknown; gradingSchemeVersion?: number | null }>;
  }>();
  const pin = session?.tracks?.find((t) => t.track === track);
  if (!pin?.gradingSchemeId) return defaultMarkingPlan(track);

  const scheme = await GradingScheme.findById(pin.gradingSchemeId).select('name nodes versions').lean<{
    name: string;
    nodes?: Array<{ type: string; data?: Record<string, unknown> }>;
    versions?: Array<{ version: number; nodes: Array<{ type: string; data?: Record<string, unknown> }> }>;
  }>();
  if (!scheme) return defaultMarkingPlan(track);

  const pinned = scheme.versions?.find((v) => v.version === pin.gradingSchemeVersion);
  const graph = pinned ? { nodes: pinned.nodes } : { nodes: scheme.nodes || [] };
  const derived = planFromGraph(graph, track);
  // A scheme with no source blocks at all can't be graded anyway; don't strand graders with
  // nothing to enter - fall back to the default so marking can still happen.
  if (derived.supervisor.length === 0 && derived.evaluator.length === 0) return defaultMarkingPlan(track);
  return { source: 'scheme', schemeName: scheme.name, schemeVersion: pinned?.version ?? 0, ...derived };
}
