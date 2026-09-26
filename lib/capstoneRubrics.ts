// Capstone rubric wording shared by the in-app marking UI, the marks API and the printable
// sheets. Client-safe: no Node imports here.

export interface ReportCriterion {
  label: string;
  /** Poor (1), Satisfactory (2), Excellent (3). Level 0 is always "No / wrong answer". */
  levels: [string, string, string];
}

/**
 * Report rubrics, verbatim from public/templates/capstone/Assessment Rubric for Report
 * CSE4098A/B.docx and Assessment Rubric for CSE4098C & CSE499 Report.docx. Order matches the
 * c0..cN rubricScores keys the group page submits.
 */
const REPORT_4098A: ReportCriterion[] = [
  { label: 'Abstract', levels: ['In abstract the project goal, purpose, & accomplishments are unclear', 'In abstract the project goal, purpose, & accomplishments are moderately defined', 'In abstract the project goal & accomplishments are clear, appropriate and effective to the purpose'] },
  { label: 'Background Literature [CO1]', levels: ['The Background literature is unclear', 'The Background literature is moderately defined', 'The Background literature is logically clear and understandable'] },
  { label: 'Problem statement [CO1]', levels: ['The problem statement is unclear', 'The problem statement is moderately defined', 'The problem statement is logically clear and understandable'] },
  { label: 'Objective & Significance of the study [CO1]', levels: ['Objectives and the significance of the study are not clearly identified', 'Objectives and the significance of the study are moderately identified', 'Objectives and the significance of the study are excellently identified'] },
  { label: 'Scope & Limitation [CO1]', levels: ['The scope and limitations of this study are unclear', 'The scope and limitations of this study are satisfactorily defined', 'The scope and limitation of this study is excellently defined'] },
  { label: 'Tools [CO1]', levels: ['Unclear description of the adopted tools and techniques', 'Moderate description of the adopted tools and techniques', 'Proper description of the adopted tools and techniques'] },
  { label: 'Literature Review & Analysis [CO2]', levels: ['Insufficient content to show that required topics are met', 'Covers most required topics', 'Covers all required topics well and maintains reader interest with a logical coherent flow'] },
  { label: 'Requirements, Task Distribution, and Budgets [CO3]', levels: ['The plans and deliverables are insufficient.', 'The plans and deliverables are satisfactory.', 'The plans and deliverables are appropriate.'] },
  { label: 'Conclusion', levels: ['Minimum acknowledgement of conclusions and topical outcomes.', 'Satisfactory acknowledgement of conclusions and topical outcomes.', 'Deftly synthesizes arguments, perspectives, ideas, and information in unique and compelling ways.'] },
  { label: 'References & Citations', levels: ['Provides no supporting evidence and citations.', 'Provides little supporting evidence with citations.', 'Provides all supporting evidence with proper citations.'] },
  { label: 'Communication (Spelling, Grammar, Punctuation, and Plagiarism)', levels: ['Major lapses in grammar, spelling, and punctuation, and most of the contents are copied without any referencing', 'Some minor lapses in grammar, spelling, and punctuation, and some of the contents are copied without referencing', 'Few lapses in grammar, spelling, and punctuation, and some contents are copied with referencing'] },
];

const REPORT_4098B: ReportCriterion[] = [
  { label: 'Abstract, Background Literature, Problem statement, Objective & Significance of the Study, Scope & Limitation', levels: ['The abstract, Background literature, problem statement, Objective & significance, and Scope & Limitations are not clearly defined', 'The abstract, Background literature, problem statement, Objective & significance, and Scope & Limitations are moderately defined', 'The abstract, Background literature, problem statement, Objective & significance, and Scope & Limitations are clear, appropriate and effective to the purpose'] },
  { label: 'Literature Review [CO1]', levels: ['Insufficient content to show that required topics are met', 'Covers most required topics', 'Covers all required topics well and maintains reader interest with a logical coherent flow'] },
  { label: 'Identification of Performance Evaluation Criterion [CO1]', levels: ['Identify a few performance evaluation criteria.', 'Identify some performance evaluation criterion', 'Identify all performance evaluation criterion'] },
  { label: 'Literature Analysis [CO2]', levels: ['Poorly analyze the literature using a few performance evaluation criteria.', 'Moderately analyze the literature using the identified performance evaluation criterion', 'Excellently analyze the literature using the identified performance evaluation criterion'] },
  { label: 'Project Management and Financial Activity [CO3]', levels: ['The student has poorly communicated the functional and non-functional requirements, updated (if any) task distribution, and revised (if any) budgets with proper justification', 'The student has moderately communicated the functional and non-functional requirements, updated (if any) task distribution, and revised (if any) budgets with proper justification', 'The student has clearly and fully communicated the functional and non-functional requirements, updated (if any) task distribution, and revised (if any) budgets with proper justification'] },
  { label: 'Usage of Modern Tools [CO4]', levels: ['Unclear description of the adopted tools and techniques', 'Moderate description of the adopted tools and techniques', 'Proper description of the adopted tools and techniques'] },
  { label: 'Design the Solution [CO5]', levels: ['Poorly designed solution using appropriate technologies for the real-life complex engineering problem considering one/more issues associated with public health and safety, cultural, societal, and environmental concerns.', 'Moderately design the solution using appropriate technologies for the real-life complex engineering problem considering one/more issues associated with public health and safety, cultural, societal, and environmental concerns.', 'Properly design the solution using appropriate technologies for the real-life complex engineering problem considering one/more issues associated with public health and safety, cultural, societal, and environmental concerns.'] },
  { label: 'Implement the solution [CO6]', levels: ['Implementation is incorrect and the development of solution has completed partially', 'Implementation is correct and the development of solution has completed partially', 'Implementation is correct and development of solution is fully completed'] },
  { label: 'Investigate the experimental result [CO6]', levels: ['Interpretation of the primary results is not clearly understandable', 'Interpretation of the primary results is partially described', 'Interpretation of the primary results is described fully'] },
  { label: 'Societal, health, safety, legal and cultural aspects [CO7]', levels: ['Poorly identify one/more societal, health, safety, legal, and cultural issues related to the project and formulate the course of action to mitigate these concerns.', 'Moderately identify one/more societal, health, safety, legal, and cultural issues related to the project and formulate the course of action to mitigate these concerns.', 'Properly identify one/more societal, health, safety, legal, and cultural issues related to the project and formulate the course of action to mitigate these concerns.'] },
  { label: 'Environment and sustainability [CO8]', levels: ['The impact of the project on the environment and sustainability is not clear', 'The impact of the project on the environment and sustainability is moderately demonstrated', 'The demonstration of the impact of the project on environment and sustainability is excellent'] },
  { label: 'Ethical and professional principles [CO9]', levels: ['The ethical and professional principle related to the project are unclear', 'The ethical and professional principle related to the project are moderately considered', 'The ethical and professional principle related to the project are explained excellently'] },
  { label: 'Conclusion', levels: ['Minimum acknowledgement of conclusions and topical outcomes.', 'Satisfactory acknowledgement of conclusions and topical outcomes.', 'Deftly synthesizes arguments, perspectives, ideas, and information in unique and compelling ways.'] },
  { label: 'References & Citations, Spelling, Grammar, Punctuation and Plagiarism', levels: ['Provides no supporting evidence and citations. Major lapses in grammar, spelling and punctuation and most of the contents are copied without any referencing', 'Provides little supporting evidence with citations. Some minor lapses in grammar, spelling and punctuations and some of the contents are copied without referencing', 'Provides all supporting evidence with proper citations. Minimal or no lapses in grammar, spelling and punctuations and all information are written in their own words or reference when required'] },
];

const REPORT_4098C: ReportCriterion[] = [
  { label: 'Abstract, Problem statement, Aims, Objective & Significance, Scope & Limitation', levels: ['The abstract, problem statement, Aims, Objective & Significance, Scope & Limitation are not clearly defined', 'The abstract, problem statement, Aims, Objective & Significance, Scope & Limitation are moderately defined', 'The abstract, problem statement, Aims, Objective & Significance, Scope & Limitation are clear and appropriate to the purpose'] },
  { label: 'Literature Review & Analysis [CO1]', levels: ['Insufficient content to show that required topics are met', 'Covers most required topics', 'Covers all required topics'] },
  { label: 'Performance Evaluation Criterion [CO1]', levels: ['Poorly identify the performance evaluation criterion associated with the problem domain and justify the relevance', 'Moderately identify the performance evaluation criterion associated with the problem domain and justify the relevance', 'Properly identify the performance evaluation criterion associated with the problem domain and justify the relevance'] },
  { label: 'Project Management and Financial Activity [CO2]', levels: ['The student has poorly communicated the final functional and non-functional requirements, task distribution, and budgets without proper justification', 'The student has moderately communicated the final functional and non-functional requirements, task distribution, and budgets with a few proper justification', 'The student has clearly communicated the final functional and non-functional requirements, task distribution, and budgets with proper justification'] },
  { label: 'Usage of Modern Tools [CO3]', levels: ['Unclear justification of the selection criterion for the adopted tools/techniques', 'Moderate justification of the selection criterion for the adopted tools/techniques', 'Proper justification of the selection criterion for the adopted tools/techniques'] },
  { label: 'Implementation [CO4]', levels: ['Poorly implement the solution using appropriate technologies for the real-life complex engineering problem considering one/more issues associated with public health and safety, cultural, societal, and environmental concerns.', 'Moderately implement the solution using appropriate technologies for the real-life complex engineering problem considering one/more issues associated with public health and safety, cultural, societal, and environmental concerns.', 'Properly implement the solution using appropriate technologies for the real-life complex engineering problem considering one/more issues associated with public health and safety, cultural, societal, and environmental concerns.'] },
  { label: 'Evaluate the solution [CO5]', levels: ['The experimental result or the performance of the developed system is barely shown', 'The experimental result or the performance of the developed system is shown but the organization is not effective in revealing important patterns, differences, or similarities', 'The experimental result or the performance of the developed system is shown and the organization is effective in revealing important patterns, differences, or similarities'] },
  { label: 'Investigate the final result [CO5]', levels: ['Analysis and interpretation of the experimental results is not clearly defined', 'Analysis and interpretation of the experimental results is partially described by following a comparative study with the existing solutions', 'Analysis and interpretation of the experimental results is fully described by following a comparative study with the existing solutions'] },
  { label: 'Societal, health, safety, legal and cultural aspects [CO6]', levels: ['Poorly identify one/more societal, health, safety, legal, and cultural issues related to the project and formulate the course of action to mitigate these concerns.', 'Moderately identify one/more societal, health, safety, legal, and cultural issues related to the project and formulate the course of action to mitigate these concerns.', 'Properly identify one/more societal, health, safety, legal, and cultural issues related to the project and formulate the course of action to mitigate these concerns.'] },
  { label: 'Environment and sustainability [CO7]', levels: ['The impact of the project on the environment and sustainability is not clear', 'The impact of the project on the environment and sustainability has moderately demonstrated', 'The demonstration of the impact of the project on the environment and sustainability is good enough'] },
  { label: 'Ethical and professional principles [CO8]', levels: ['The ethical and professional principle related to the project are unclear', 'The ethical and professional principle related to the project are moderately considered', 'The ethical and professional principle related to the project are explained excellently'] },
  { label: 'Conclusion & Future Works', levels: ['Minimum acknowledgment of conclusions and topical outcomes.', 'Satisfactory acknowledgment of conclusions and topical outcomes.', 'Synthesizes arguments, perspectives, ideas, and information in proper ways.'] },
  { label: 'References & Citations, Spelling, Grammar, Punctuation, and Plagiarism', levels: ['Provides no supporting evidence and citations. Major lapses in grammar, spelling, and punctuation, and most of the contents are copied without any referencing', 'Provides some supporting evidence with citations. Some minor lapses in grammar, spelling, and punctuation, and some of the contents are copied without referencing', 'Provides all supporting evidence with citations. Few lapses in grammar, spelling, and punctuation, and some contents are copied with referencing'] },
];

export const REPORT_RUBRICS: Record<'A' | 'B' | 'C', ReportCriterion[]> = {
  A: REPORT_4098A,
  B: REPORT_4098B,
  C: REPORT_4098C,
};

/**
 * Presentation rubric: 5 criteria, each scored 0/3/6/9, per student - matching the department's
 * printed "Assessment Rubrics for Term Final Presentation" sheet. rubricScores keys are c0..c4
 * (index order), which older saved marks also use.
 */
export const PRESENTATION_CRITERIA = [
  'Presentation Skills (Eye contact, Language, Visual aid)',
  'Organization of the Presentation Material [CO5: A1]',
  'Contents',
  'Question Answer',
  'Time Management',
];

export const PRESENTATION_LEVELS = [
  { value: 0, label: 'No or Wrong Answer' },
  { value: 3, label: 'Poor' },
  { value: 6, label: 'Satisfactory' },
  { value: 9, label: 'Excellent' },
];

export const PRESENTATION_MAX = PRESENTATION_CRITERIA.length * 9;

export function sumRubricScores(scores: Record<string, number> | undefined): number {
  return Object.values(scores || {}).reduce((a, b) => a + (b || 0), 0);
}

export function isPresentationComplete(scores: Record<string, number> | undefined): boolean {
  return !!scores && PRESENTATION_CRITERIA.every((_, idx) => typeof scores[`c${idx}`] === 'number');
}
