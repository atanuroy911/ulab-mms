import RubricTemplate, { IRubricCriterion } from '@/models/RubricTemplate';
import { RUBRIC_CRITERIA } from '@/app/utils/projectRubric';

const STANDARD_LEVELS: [string, string, string, string] = [
  'No answer or incorrect answer',
  'Poor',
  'Satisfactory',
  'Excellent',
];

const PRESENTATION_LEVELS: [string, string, string, string] = [...STANDARD_LEVELS];

const PRESENTATION_CRITERIA: IRubricCriterion[] = [
  { key: 'c1', label: 'Presentation Skills (Eye contact, Language, Visual aid)', co: '', descriptions: PRESENTATION_LEVELS },
  { key: 'c2', label: 'Organization of the Presentation Material', co: 'CO5', descriptions: PRESENTATION_LEVELS },
  { key: 'c3', label: 'Contents', co: '', descriptions: PRESENTATION_LEVELS },
  { key: 'c4', label: 'Question Answer', co: '', descriptions: PRESENTATION_LEVELS },
  { key: 'c5', label: 'Time Management', co: '', descriptions: PRESENTATION_LEVELS },
];

const COMPLEX_ENGINEERING_CRITERIA: IRubricCriterion[] = RUBRIC_CRITERIA.map((c) => ({
  key: c.key,
  label: c.label,
  co: c.co,
  descriptions: [...c.descriptions] as [string, string, string, string],
}));

// CSE4098A Report Rubric — 11 criteria, max 33 (3 per criterion)
const REPORT_4098A_CRITERIA: IRubricCriterion[] = [
  { key: 'c1',  label: 'Abstract',                                                       co: '',    descriptions: STANDARD_LEVELS },
  { key: 'c2',  label: 'Background Literature',                                          co: 'CO1', descriptions: STANDARD_LEVELS },
  { key: 'c3',  label: 'Problem Statement',                                              co: 'CO1', descriptions: STANDARD_LEVELS },
  { key: 'c4',  label: 'Objective & Significance of the Study',                         co: 'CO1', descriptions: STANDARD_LEVELS },
  { key: 'c5',  label: 'Scope & Limitation',                                            co: 'CO1', descriptions: STANDARD_LEVELS },
  { key: 'c6',  label: 'Tools',                                                         co: 'CO1', descriptions: STANDARD_LEVELS },
  { key: 'c7',  label: 'Literature Review & Analysis',                                  co: 'CO2', descriptions: STANDARD_LEVELS },
  { key: 'c8',  label: 'Requirements, Task Distribution, and Budgets',                 co: 'CO3', descriptions: STANDARD_LEVELS },
  { key: 'c9',  label: 'Conclusion',                                                    co: '',    descriptions: STANDARD_LEVELS },
  { key: 'c10', label: 'References & Citations',                                        co: '',    descriptions: STANDARD_LEVELS },
  { key: 'c11', label: 'Communication (Spelling, Grammar, Punctuation, and Plagiarism)', co: '',    descriptions: STANDARD_LEVELS },
];

// CSE4098B Report Rubric — 14 criteria, max 42 (3 per criterion)
const REPORT_4098B_CRITERIA: IRubricCriterion[] = [
  { key: 'c1',  label: 'Abstract, Background Literature, Problem Statement, Objective & Significance, Scope & Limitation', co: '',    descriptions: STANDARD_LEVELS },
  { key: 'c2',  label: 'Literature Review',                                                                                co: 'CO1', descriptions: STANDARD_LEVELS },
  { key: 'c3',  label: 'Identification of Performance Evaluation Criterion',                                               co: 'CO1', descriptions: STANDARD_LEVELS },
  { key: 'c4',  label: 'Literature Analysis',                                                                             co: 'CO2', descriptions: STANDARD_LEVELS },
  { key: 'c5',  label: 'Project Management and Financial Activity',                                                       co: 'CO3', descriptions: STANDARD_LEVELS },
  { key: 'c6',  label: 'Usage of Modern Tools',                                                                           co: 'CO4', descriptions: STANDARD_LEVELS },
  { key: 'c7',  label: 'Design the Solution',                                                                             co: 'CO5', descriptions: STANDARD_LEVELS },
  { key: 'c8',  label: 'Implement the Solution',                                                                          co: 'CO6', descriptions: STANDARD_LEVELS },
  { key: 'c9',  label: 'Investigate the Experimental Result',                                                             co: 'CO6', descriptions: STANDARD_LEVELS },
  { key: 'c10', label: 'Societal, Health, Safety, Legal and Cultural Aspects',                                            co: 'CO7', descriptions: STANDARD_LEVELS },
  { key: 'c11', label: 'Environment and Sustainability',                                                                  co: 'CO8', descriptions: STANDARD_LEVELS },
  { key: 'c12', label: 'Ethical and Professional Principles',                                                             co: 'CO9', descriptions: STANDARD_LEVELS },
  { key: 'c13', label: 'Conclusion',                                                                                      co: '',    descriptions: STANDARD_LEVELS },
  { key: 'c14', label: 'References & Citations, Spelling, Grammar, Punctuation and Plagiarism',                           co: '',    descriptions: STANDARD_LEVELS },
];

export const COMPLEX_ENGINEERING_SLUG = 'complex-engineering';
export const PRESENTATION_SLUG = 'presentation';
export const REPORT_4098A_SLUG = 'report-cse4098a';
export const REPORT_4098B_SLUG = 'report-cse4098b';

const SYSTEM_TEMPLATES = [
  {
    name: 'Complex Engineering Rubric',
    slug: COMPLEX_ENGINEERING_SLUG,
    criteria: COMPLEX_ENGINEERING_CRITERIA,
    isSystem: true,
    maxScore: null,
    levelValues: [0, 1, 2, 3],
  },
  {
    name: 'Presentation Rubric (CSE4098 A & B)',
    slug: PRESENTATION_SLUG,
    criteria: PRESENTATION_CRITERIA,
    isSystem: true,
    maxScore: 45,
    levelValues: [0, 3, 6, 9], // each criterion scored 0/3/6/9
  },
  {
    name: 'Report Rubric — CSE4098A (11 criteria, max 33)',
    slug: REPORT_4098A_SLUG,
    criteria: REPORT_4098A_CRITERIA,
    isSystem: true,
    maxScore: 33,
    levelValues: [0, 1, 2, 3],
  },
  {
    name: 'Report Rubric — CSE4098B (14 criteria, max 42)',
    slug: REPORT_4098B_SLUG,
    criteria: REPORT_4098B_CRITERIA,
    isSystem: true,
    maxScore: 42,
    levelValues: [0, 1, 2, 3],
  },
];

/**
 * Ensures all built-in rubric templates exist. Safe to call on every request —
 * only inserts what's missing, never overwrites admin edits to existing templates.
 */
export async function ensureDefaultRubricTemplates(): Promise<void> {
  const allSlugs = SYSTEM_TEMPLATES.map((t) => t.slug);
  const existing = await RubricTemplate.find({ slug: { $in: allSlugs } }).select('slug');
  const existingSlugs = new Set(existing.map((e) => e.slug));

  const toInsert = SYSTEM_TEMPLATES.filter((t) => !existingSlugs.has(t.slug));
  if (toInsert.length > 0) {
    await RubricTemplate.insertMany(toInsert);
  }
}
