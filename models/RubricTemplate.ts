import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IRubricCriterion {
  key: string;
  label: string;
  co?: string;
  /** Level descriptions. Length must be 4 (levels 0-3) for the existing presentation/project rubrics,
   *  but may vary for new capstone report rubrics (which share the same 0/1/2/3 scale). */
  descriptions: string[];
}

export interface IRubricTemplate extends Document {
  name: string;
  slug: string;
  criteria: IRubricCriterion[];
  isSystem: boolean; // seeded/built-in templates cannot be deleted
  /** Maximum raw score for this rubric. Defaults to criteria.length * 3 (the 0-3 scale). */
  maxScore?: number | null;
  /** Scoring scale per level. Defaults to [0,1,2,3] (incremental). Use [0,3,6,9] for presentation-style. */
  levelValues?: number[] | null;
  createdAt: Date;
  updatedAt: Date;
}

const RubricCriterionSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    co: { type: String, default: '' },
    descriptions: {
      type: [String],
      required: true,
    },
  },
  { _id: false }
);

const RubricTemplateSchema: Schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    criteria: {
      type: [RubricCriterionSchema],
      validate: {
        validator: (v: IRubricCriterion[]) => v.length >= 1,
        message: 'A rubric template must have at least 1 criterion',
      },
      required: true,
    },
    isSystem: { type: Boolean, default: false },
    maxScore: { type: Number, default: null },
    levelValues: { type: [Number], default: null },
  },
  { timestamps: true }
);

if (mongoose.models.RubricTemplate) {
  delete mongoose.models.RubricTemplate;
}

const RubricTemplate: Model<IRubricTemplate> = mongoose.model<IRubricTemplate>(
  'RubricTemplate',
  RubricTemplateSchema
);

export default RubricTemplate;
