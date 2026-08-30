import mongoose, { Schema, Document, Model } from 'mongoose';
import type { ExcelExportMapping } from '@/app/course/[id]/lib/excelExportMapping';

export interface ICourse extends Document {
  name: string;
  code: string;
  semester: string;
  year: number;
  section: string;
  classTime?: string;
  classRoom?: string;
  classDays?: string[]; // Regular weekly class days, e.g. ['Thursday', 'Saturday'] - used to detect missed classes
  numberOfStudents?: number;
  classRepresentativeId?: mongoose.Types.ObjectId | null;
  courseType: 'Theory' | 'Lab';
  showFinalGrade: boolean;
  quizAggregation: 'average' | 'best'; // How to aggregate quiz marks
  quizWeightage: number; // Weightage for aggregated quiz column
  assignmentAggregation: 'average' | 'best' | 'sum'; // How to aggregate assignment/assessment marks ('sum' is Lab-only)
  assignmentWeightage: number; // Weightage for aggregated assignment column
  projectWeightage: number; // Weightage for aggregated project column (sum-based)
  gradingScale?: string; // Encoded grading scale (e.g., "0:F:0|50:D:0|55:C:1|...")
  excelExportMapping?: ExcelExportMapping | null;
  coPoMapping?: {
    maxMarks: Record<string, number[]>; // keyed by exam._id, except 'Project' which holds the combined Project-category CO max marks
    mapping: boolean[][];
    projectNumberOfCOs?: number; // combined CO count shared across all Project-category exams
    projectCoAutoDistribute?: boolean; // when true, maxMarks['Project'] is kept as an even split of the projectCoMode target
    projectCoMode?: 'marks' | 'weightage'; // what maxMarks['Project'] sums to: raw total marks across Project exams (default), or projectWeightage %
  };
  coPoMappingEnabled?: boolean; // Whether this course tracks CO-PO mapping at all; when false, missing-CO-PO warnings are suppressed
  isArchived: boolean; // Whether the course is archived
  archivedAt?: Date; // When the course was archived
  aliasEnabled?: boolean; // Whether some students are grouped under an alternate course code
  alternateCode?: string; // The alternate/alias course code, when aliasEnabled is true
  userId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CourseSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a course name'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Please provide a course code'],
      trim: true,
    },
    semester: {
      type: String,
      required: [true, 'Please provide a semester'],
      enum: ['Spring', 'Summer', 'Fall'],
    },
    year: {
      type: Number,
      required: [true, 'Please provide a year'],
      min: 2000,
      max: 2100,
    },
    section: {
      type: String,
      required: [true, 'Please provide a section'],
      trim: true,
      default: 'A',
    },
    classTime: {
      type: String,
      trim: true,
      default: '',
    },
    classRoom: {
      type: String,
      trim: true,
      default: '',
    },
    classDays: {
      type: [String],
      default: [],
    },
    numberOfStudents: {
      type: Number,
      default: 0,
      min: 0,
    },
    classRepresentativeId: {
      type: Schema.Types.ObjectId,
      ref: 'Student',
      default: null,
    },
    courseType: {
      type: String,
      required: [true, 'Please provide a course type'],
      enum: ['Theory', 'Lab'],
    },
    showFinalGrade: {
      type: Boolean,
      default: false,
    },
    quizAggregation: {
      type: String,
      enum: ['average', 'best'],
      default: 'average',
    },
    quizWeightage: {
      type: Number,
      default: 0,
      min: [0, 'Weightage cannot be negative'],
      max: [100, 'Weightage cannot exceed 100'],
    },
    assignmentAggregation: {
      type: String,
      enum: ['average', 'best', 'sum'],
      default: 'average',
    },
    assignmentWeightage: {
      type: Number,
      default: 0,
      min: [0, 'Weightage cannot be negative'],
      max: [100, 'Weightage cannot exceed 100'],
    },
    projectWeightage: {
      type: Number,
      default: 25,
      min: [0, 'Weightage cannot be negative'],
      max: [100, 'Weightage cannot exceed 100'],
    },
    gradingScale: {
      type: String,
      default: '0:F:0|50:D:0|60:C:0|65:C:2|70:B:1|75:B:0|80:B:2|85:A:1|90:A:0|95:A:2',
    },
    excelExportMapping: {
      type: Schema.Types.Mixed,
      default: null,
    },
    coPoMapping: {
      type: Schema.Types.Mixed,
      default: {
        maxMarks: {},
        mapping: Array(6).fill(Array(12).fill(false))
      }
    },
    coPoMappingEnabled: {
      type: Boolean,
      default: true,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    archivedAt: {
      type: Date,
    },
    aliasEnabled: {
      type: Boolean,
      default: false,
    },
    alternateCode: {
      type: String,
      trim: true,
      default: '',
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Create compound index for duplicate prevention: same code + semester + year + section for same user
CourseSchema.index({ code: 1, semester: 1, year: 1, section: 1, userId: 1 }, { unique: true });

if (mongoose.models.Course) {
  delete mongoose.models.Course;
}

const Course: Model<ICourse> = mongoose.model<ICourse>('Course', CourseSchema);

export default Course;
