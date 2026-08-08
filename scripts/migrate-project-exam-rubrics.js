// Migration: backfill Exam.rubricTemplateId for existing Project-category exams that
// already have scored rubric data, so historical data keeps rendering with the rubric
// it was actually scored against (the built-in "Complex Engineering Rubric").
// Run once after deploying the rubric-per-project-section feature.

const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGODB_URL;
  if (!uri) {
    console.error('Please set MONGODB_URI environment variable (e.g. mongodb+srv://...).');
    process.exit(1);
  }

  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB');

  const RubricCriterionSchema = new mongoose.Schema({
    key: String,
    label: String,
    co: String,
    descriptions: [String],
  }, { _id: false });

  const RubricTemplateSchema = new mongoose.Schema({
    name: String,
    slug: String,
    criteria: [RubricCriterionSchema],
    isSystem: Boolean,
  }, { timestamps: true });

  const ExamSchema = new mongoose.Schema({
    courseId: mongoose.Schema.Types.ObjectId,
    examCategory: String,
    rubricTemplateId: mongoose.Schema.Types.ObjectId,
  }, { timestamps: true, strict: false });

  const ProjectGroupSchema = new mongoose.Schema({
    courseId: mongoose.Schema.Types.ObjectId,
    groups: [{ type: mongoose.Schema.Types.Mixed }],
  }, { timestamps: true, strict: false });

  const RubricTemplate = mongoose.model('RubricTemplate', RubricTemplateSchema, 'rubrictemplates');
  const Exam = mongoose.model('Exam', ExamSchema, 'exams');
  const ProjectGroup = mongoose.model('ProjectGroup', ProjectGroupSchema, 'projectgroups');

  let complexEngineeringTemplate = await RubricTemplate.findOne({ slug: 'complex-engineering' });
  if (!complexEngineeringTemplate) {
    console.error('No "complex-engineering" rubric template found. Visit /api/rubrics as a logged-in teacher (or /admin/dashboard?tab=rubrics) once to seed the built-in rubrics, then re-run this script.');
    process.exit(1);
  }

  const projectExams = await Exam.find({ examCategory: 'Project', rubricTemplateId: { $exists: false } });
  console.log(`Found ${projectExams.length} Project exams without a rubricTemplateId`);

  let updated = 0;
  let skipped = 0;

  for (const exam of projectExams) {
    const projectGroup = await ProjectGroup.findOne({ courseId: exam.courseId });
    if (!projectGroup) { skipped++; continue; }

    const hasScoredRubric = (projectGroup.groups || []).some((g) =>
      (g.examRubricScores || []).some((e) => {
        if (String(e.examId) !== String(exam._id)) return false;
        const s = e.scores || {};
        return (s.c1 || 0) + (s.c2 || 0) + (s.c3 || 0) + (s.c4 || 0) + (s.c5 || 0) > 0;
      })
    );

    if (hasScoredRubric) {
      await Exam.updateOne({ _id: exam._id }, { $set: { rubricTemplateId: complexEngineeringTemplate._id } });
      updated++;
    } else {
      skipped++;
    }
  }

  console.log('Migration summary:');
  console.log('  Exams backfilled with Complex Engineering rubric:', updated);
  console.log('  Exams left as direct-mark (no prior rubric scores found):', skipped);

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
