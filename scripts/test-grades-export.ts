/**
 * Exercises the grades-export sheet shaping against a synthetic cohort, without a database.
 *
 * The export route itself needs Mongo, so this test targets the two things that are pure
 * logic and easy to get silently wrong: turning an evaluation trace into per-component
 * columns, and producing a workbook whose headers line up across rows that came from
 * different schemes.
 */
import * as XLSX from 'xlsx';
import { evaluateScheme, defaultCseScheme, componentNodeIds } from '../lib/gradingEngine';
import type { StudentContext, MarkInput } from '../lib/gradingEngine';

let pass = 0;
let fail = 0;

function check(label: string, got: unknown, expected: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (ok) pass += 1;
  else {
    fail += 1;
    console.log(`FAIL  ${label}\n      got      ${JSON.stringify(got)}\n      expected ${JSON.stringify(expected)}`);
  }
}

// Mirrors componentColumns() in the export route.
function componentColumns(
  trace: Array<{ nodeId: string; type: string; label: string; value: number }>,
  nodeIds: string[]
) {
  const wanted = new Set(nodeIds);
  const out: Record<string, number> = {};
  for (const e of trace) {
    if (wanted.has(e.nodeId)) out[e.label] = Number(e.value.toFixed(2));
  }
  return out;
}

const SUP = 'sup1';
const EV_A = 'evA';
const EV_B = 'evB';

const marks: MarkInput[] = [
  { component: 'report', submitterId: SUP, submitterRole: 'supervisor', rawScore: 30, rubricMax: 33 },
  { component: 'report', submitterId: EV_A, submitterRole: 'evaluator', rawScore: 27, rubricMax: 33 },
  { component: 'report', submitterId: EV_B, submitterRole: 'evaluator', rawScore: 24, rubricMax: 33 },
  { component: 'presentation', submitterId: SUP, submitterRole: 'supervisor', rawScore: 40, rubricMax: 45 },
  { component: 'presentation', submitterId: EV_A, submitterRole: 'evaluator', rawScore: 38, rubricMax: 45 },
  { component: 'presentation', submitterId: EV_B, submitterRole: 'evaluator', rawScore: 36, rubricMax: 45 },
  { component: 'peer', submitterId: SUP, submitterRole: 'supervisor', rawScore: 4, rubricMax: 5 },
  { component: 'weeklyJournal', submitterId: SUP, submitterRole: 'supervisor', rawScore: 9, rubricMax: 10 },
];

const ctx: StudentContext = {
  studentAccountId: 's1',
  marks,
  supervisorId: SUP,
  chosenEvaluators: { report: [EV_A, EV_B], presentation: [EV_A, EV_B] },
};

const schemeA = defaultCseScheme('A');
const result = evaluateScheme(schemeA, ctx);
const nodeIds = componentNodeIds(schemeA);
const cols = componentColumns(result.trace, nodeIds);

check(
  'componentNodeIds finds the four direct inputs to the total',
  [...nodeIds].sort(),
  ['journal', 'peer', 'pres_blend', 'report_blend']
);

// The four component columns a coordinator expects to see in the sheet.
check('report column', cols['Report (out of 40)'], 34.18);
check('presentation column', cols['Presentation (out of 45)'], 38.8);
check('peer column', cols['Peer Mark (0-5)'], 4);
check('journal column', cols['Weekly Journal (0-10)'], 9);

// The raw source fractions must NOT leak in as extra columns alongside the blended values -
// a sheet with both "Report — Supervisor: 0.91" and "Report (out of 40): 34.18" would be
// confusing, and the blended node already supersedes them.
check(
  'blended components do not also emit their raw source columns',
  cols['Report — Supervisor'],
  undefined
);

// ── Workbook shaping ──────────────────────────────────────────────────────────────────────
const header = [
  'Student ID',
  'Name',
  'Email',
  'Track',
  'Group',
  'Project Title',
  'Supervisor',
  ...Object.keys(cols),
  'Total',
  'Grade',
  'Not Yet Graded',
  'Scheme',
];

const rows = [
  {
    'Student ID': '2021-1-60-123',
    Name: 'Test Student',
    Email: 'test@ulab.edu.bd',
    Track: 'A',
    Group: 1,
    'Project Title': 'A Capstone Project',
    Supervisor: 'Dr Supervisor',
    ...cols,
    Total: Number(result.score.toFixed(2)),
    Grade: result.letter,
    'Not Yet Graded': '',
    Scheme: 'CSE4098A',
  },
  // A second student whose scheme produced no component columns at all (nothing pinned).
  // This is the case that would misalign if json_to_sheet were called without an explicit
  // header - the sheet must still place Total/Grade under the same columns.
  {
    'Student ID': '2021-1-60-124',
    Name: 'Ungraded Student',
    Email: 'other@ulab.edu.bd',
    Track: 'A',
    Group: 2,
    'Project Title': 'Another Project',
    Supervisor: 'Dr Supervisor',
    Total: '',
    Grade: '',
    'Not Yet Graded': 'Report, Presentation',
    Scheme: 'none pinned',
  },
];

const wb = XLSX.utils.book_new();
const sheet = XLSX.utils.json_to_sheet(rows, { header });
XLSX.utils.book_append_sheet(wb, sheet, 'Grades');

const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
check('workbook is non-empty', buffer.length > 0, true);

// Read it back the way Excel would, and confirm the columns really did line up.
const reread = XLSX.read(buffer, { type: 'buffer' });
check('sheet names', reread.SheetNames, ['Grades']);

const back = XLSX.utils.sheet_to_json<Record<string, unknown>>(reread.Sheets['Grades']);
check('two data rows', back.length, 2);
check('row 1 total', back[0]['Total'], 85.98);
check('row 1 grade', back[0]['Grade'], 'A');
check('row 1 student id', back[0]['Student ID'], '2021-1-60-123');
check('row 1 name present', back[0]['Name'], 'Test Student');
check('row 1 email present', back[0]['Email'], 'test@ulab.edu.bd');
check('row 1 report column survived the round trip', back[0]['Report (out of 40)'], 34.18);
check('row 2 flags what is missing', back[1]['Not Yet Graded'], 'Report, Presentation');

// The header row itself, read positionally - this is what catches a misalignment.
const asRows = XLSX.utils.sheet_to_json<unknown[]>(reread.Sheets['Grades'], { header: 1 });
check('header row matches the declared order', asRows[0], header);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
