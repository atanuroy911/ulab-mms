import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IRubricCriterion {
  key: 'c1' | 'c2' | 'c3' | 'c4' | 'c5';
  label: string;
  co?: string;
  descriptions: [string, string, string, string]; // level 0..3
}

export interface IRubricTemplate extends Document {
  name: string;
  slug: string;
  criteria: IRubricCriterion[];
  isSystem: boolean; // seeded/built-in templates cannot be deleted
  createdAt: Date;
  updatedAt: Date;
}

const RubricCriterionSchema = new Schema(
  {
    key: { type: String, enum: ['c1', 'c2', 'c3', 'c4', 'c5'], required: true },
    label: { type: String, required: true, trim: true },
    co: { type: String, default: '' },
    descriptions: {
      type: [String],
      validate: {
        validator: (v: string[]) => v.length === 4,
        message: 'A rubric criterion must have exactly 4 level descriptions (0-3)',
      },
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
        validator: (v: IRubricCriterion[]) => v.length === 5,
        message: 'A rubric template must have exactly 5 criteria',
      },
      required: true,
    },
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const RubricTemplate: Model<IRubricTemplate> =
  mongoose.models.RubricTemplate ||
  mongoose.model<IRubricTemplate>('RubricTemplate', RubricTemplateSchema);

export default RubricTemplate;
