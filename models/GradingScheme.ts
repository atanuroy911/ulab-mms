import mongoose, { Schema, Document, Model } from 'mongoose';
import type { CapstoneMarkComponent } from './CapstoneMarkSubmission';

/**
 * A grading scheme is a small directed acyclic graph the coordinator/admin builds visually
 * (React Flow) instead of us hard-coding one department's arithmetic.
 *
 * Why a graph rather than a weights table: the real CSE4098 scheme is not a flat weighted
 * sum. Within the Report component alone, the supervisor's score and the *average of the
 * chosen evaluators'* scores are blended 60/40, and only then does that result take its 40%
 * share of the final mark (see docs/capstone-marking-and-rubrics.md). That is two levels of
 * aggregation, and the levels differ per component. A graph expresses it directly; a table
 * would need a new special case every time the department changes its mind.
 *
 * Schemes are VERSIONED and pinned per track. A session's track records both the scheme id
 * and the version it was graded under, so editing a scheme can never retroactively change
 * grades that were already published under the old arithmetic.
 */

export type GradingNodeType =
  | 'source'
  | 'constant'
  | 'scale'
  | 'sum'
  | 'formula'
  | 'gradeBands'
  | 'output';

/** How to collapse several submitters' scores for one component into a single number. */
export type GradingAggregate = 'mean' | 'sum' | 'max' | 'min' | 'count';

/**
 * Which submitters a source node draws from.
 * - `supervisor`      — the group's supervisor only
 * - `chosenEvaluator` — only evaluators the coordinator marked as counting for THIS
 *                       component (CapstoneGroup.chosenEvaluators[component])
 * - `allEvaluator`    — every assigned evaluator who submitted, chosen or not
 */
export type GradingSubmitterScope = 'supervisor' | 'chosenEvaluator' | 'allEvaluator';

export interface IGradingNode {
  id: string;
  type: GradingNodeType;
  position: { x: number; y: number };
  data: Record<string, any>;
}

export interface IGradingEdge {
  id: string;
  source: string;
  target: string;
  /**
   * The variable name this input binds to inside the target node. Formula nodes reference
   * it by name in their expression; sum nodes look up its per-input weight by this name.
   * Defaults to `in` for single-input nodes.
   */
  targetHandle?: string | null;
}

export interface IGradingSchemeVersion {
  version: number;
  nodes: IGradingNode[];
  edges: IGradingEdge[];
  createdAt: Date;
  createdBy: mongoose.Types.ObjectId | null;
  note?: string;
}

export interface IGradingScheme extends Document {
  name: string;
  description?: string;
  department: string;
  /** Which capstone track this scheme is intended for. Advisory - any scheme can be pinned
   *  to any track; this just drives sensible defaults in the picker. */
  track?: 'A' | 'B' | 'C' | null;
  /** The live, editable graph. Publishing snapshots it into `versions`. */
  nodes: IGradingNode[];
  edges: IGradingEdge[];
  /** Immutable published snapshots. Sessions pin one of these, never the draft. */
  versions: IGradingSchemeVersion[];
  currentVersion: number;
  isArchived: boolean;
  createdBy: mongoose.Types.ObjectId | null;
  updatedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const GradingNodeSchema = new Schema(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: ['source', 'constant', 'scale', 'sum', 'formula', 'gradeBands', 'output'],
      required: true,
    },
    position: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
    },
    // Deliberately Mixed: each node type carries a different payload (a source node's
    // component/scope/aggregate, a formula node's expression, a gradeBands node's bands).
    // Shape is validated by lib/gradingEngine.ts's validateScheme(), which the API calls on
    // every save - a discriminated sub-schema per type would be far more ceremony for the
    // same guarantee.
    data: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const GradingEdgeSchema = new Schema(
  {
    id: { type: String, required: true },
    source: { type: String, required: true },
    target: { type: String, required: true },
    targetHandle: { type: String, default: 'in' },
  },
  { _id: false }
);

const GradingSchemeVersionSchema = new Schema(
  {
    version: { type: Number, required: true },
    nodes: { type: [GradingNodeSchema], default: [] },
    edges: { type: [GradingEdgeSchema], default: [] },
    createdAt: { type: Date, default: Date.now },
    // null when done through the /admin panel's web-admin login (lib/capstoneAuth.ts).
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    note: { type: String, default: '' },
  },
  { _id: false }
);

const GradingSchemeSchema: Schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    department: { type: String, required: true, trim: true, uppercase: true },
    track: { type: String, enum: ['A', 'B', 'C', null], default: null },
    nodes: { type: [GradingNodeSchema], default: [] },
    edges: { type: [GradingEdgeSchema], default: [] },
    versions: { type: [GradingSchemeVersionSchema], default: [] },
    currentVersion: { type: Number, default: 0 },
    isArchived: { type: Boolean, default: false },
    // null when done through the /admin panel's web-admin login (lib/capstoneAuth.ts).
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

GradingSchemeSchema.index({ department: 1, isArchived: 1 });
GradingSchemeSchema.index({ department: 1, name: 1 }, { unique: true });

if (mongoose.models.GradingScheme) {
  delete mongoose.models.GradingScheme;
}

const GradingScheme: Model<IGradingScheme> = mongoose.model<IGradingScheme>(
  'GradingScheme',
  GradingSchemeSchema
);

export default GradingScheme;
export type { CapstoneMarkComponent };
