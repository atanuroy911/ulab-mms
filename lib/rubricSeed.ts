import RubricTemplate, { IRubricCriterion } from '@/models/RubricTemplate';
import { RUBRIC_CRITERIA } from '@/app/utils/projectRubric';

const PRESENTATION_LEVEL_DESCRIPTIONS: [string, string, string, string] = [
  'No answer or incorrect answer',
  'Poor',
  'Satisfactory',
  'Excellent',
];

const PRESENTATION_CRITERIA: IRubricCriterion[] = [
  {
    key: 'c1',
    label: 'Presentation Skills (Eye contact, Language, Visual aid)',
    co: '',
    descriptions: PRESENTATION_LEVEL_DESCRIPTIONS,
  },
  {
    key: 'c2',
    label: 'Organization of the Presentation Material',
    co: '',
    descriptions: PRESENTATION_LEVEL_DESCRIPTIONS,
  },
  {
    key: 'c3',
    label: 'Contents',
    co: '',
    descriptions: PRESENTATION_LEVEL_DESCRIPTIONS,
  },
  {
    key: 'c4',
    label: 'Question Answer',
    co: '',
    descriptions: PRESENTATION_LEVEL_DESCRIPTIONS,
  },
  {
    key: 'c5',
    label: 'Time Management',
    co: '',
    descriptions: PRESENTATION_LEVEL_DESCRIPTIONS,
  },
];

const COMPLEX_ENGINEERING_CRITERIA: IRubricCriterion[] = RUBRIC_CRITERIA.map(c => ({
  key: c.key,
  label: c.label,
  co: c.co,
  descriptions: [...c.descriptions] as [string, string, string, string],
}));

export const COMPLEX_ENGINEERING_SLUG = 'complex-engineering';
export const PRESENTATION_SLUG = 'presentation';

/**
 * Ensures the two built-in rubric templates exist. Safe to call on every request -
 * only inserts what's missing, never overwrites admin edits to existing templates.
 */
export async function ensureDefaultRubricTemplates(): Promise<void> {
  const existing = await RubricTemplate.find({
    slug: { $in: [COMPLEX_ENGINEERING_SLUG, PRESENTATION_SLUG] },
  }).select('slug');
  const existingSlugs = new Set(existing.map(e => e.slug));

  const toInsert = [];
  if (!existingSlugs.has(COMPLEX_ENGINEERING_SLUG)) {
    toInsert.push({
      name: 'Complex Engineering Rubric',
      slug: COMPLEX_ENGINEERING_SLUG,
      criteria: COMPLEX_ENGINEERING_CRITERIA,
      isSystem: true,
    });
  }
  if (!existingSlugs.has(PRESENTATION_SLUG)) {
    toInsert.push({
      name: 'Presentation Rubric',
      slug: PRESENTATION_SLUG,
      criteria: PRESENTATION_CRITERIA,
      isSystem: true,
    });
  }

  if (toInsert.length > 0) {
    await RubricTemplate.insertMany(toInsert);
  }
}
