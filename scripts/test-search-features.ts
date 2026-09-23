/**
 * The global search must only offer each viewer the places they can actually open, and rank
 * the obvious match first. (Destinations still enforce access server-side; this keeps the
 * search from offering dead ends.)
 */
import { SEARCH_FEATURES, canSee, scoreFeature, type SearchViewer } from '../lib/searchFeatures';

let pass = 0;
let fail = 0;
function check(label: string, got: unknown, expected: unknown) {
  if (JSON.stringify(got) === JSON.stringify(expected)) pass += 1;
  else {
    fail += 1;
    console.log(`FAIL  ${label}\n      got      ${JSON.stringify(got)}\n      expected ${JSON.stringify(expected)}`);
  }
}

const teacher: SearchViewer = { teacher: true, roles: ['teacher'], adminPanel: false };
const coordinator: SearchViewer = { teacher: true, roles: ['teacher', 'coordinator'], adminPanel: false };
const adminTeacher: SearchViewer = { teacher: true, roles: ['teacher', 'admin'], adminPanel: false };
const webAdmin: SearchViewer = { teacher: false, roles: ['admin'], adminPanel: true };

const visible = (v: SearchViewer) => new Set(SEARCH_FEATURES.filter((f) => canSee(f, v)).map((f) => f.id));

// A plain teacher: own courses and capstone groups, never management or admin.
const t = visible(teacher);
check('teacher sees My Courses', t.has('my-courses'), true);
check('teacher sees capstone groups', t.has('capstone-mine'), true);
check('teacher does not see sessions', t.has('capstone-sessions'), false);
check('teacher does not see account manager', t.has('admin-accounts'), false);
check('teacher does not see developer settings', t.has('developer-settings'), false);

// Coordinator: + capstone management, still no admin.
const c = visible(coordinator);
check('coordinator sees sessions', c.has('capstone-sessions'), true);
check('coordinator sees grading schemes', c.has('grading-schemes'), true);
check('coordinator does not see backup', c.has('admin-backup'), false);

// Admin role on a teacher account: everything.
const a = visible(adminTeacher);
check('admin teacher sees account manager', a.has('admin-accounts'), true);
check('admin teacher sees own courses', a.has('my-courses'), true);

// The /admin panel login alone has no courses or teacher settings to open.
const w = visible(webAdmin);
check('web-admin sees account manager', w.has('admin-accounts'), true);
check('web-admin sees sessions', w.has('capstone-sessions'), true);
check('web-admin does not see My Courses', w.has('my-courses'), false);
check('web-admin does not see teacher settings', w.has('settings-password'), false);
check('web-admin does not see teacher-only resources page', w.has('resources'), false);
check('everyone staff can report a bug', [t, c, a, w].every((set) => set.has('report-bug')), true);

// Ranking: the obvious page comes first.
const top = (q: string, v: SearchViewer) =>
  SEARCH_FEATURES.filter((f) => canSee(f, v))
    .map((f) => ({ id: f.id, s: scoreFeature(f, q) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s)[0]?.id;
check('"password" -> change password', top('password', teacher), 'settings-password');
check('"archive" -> archived courses', top('archive', teacher), 'archived');
check('"add course" -> add a course', top('add course', teacher), 'add-course');
check('"journal" -> review journals', top('journal', teacher), 'capstone-journal');
check('"change pass" multi-word', top('change pass', teacher), 'settings-password');
check('nonsense matches nothing', top('zzqqxx', teacher), undefined);

// Every feature either navigates or fires an event - never neither.
check('every feature has a target', SEARCH_FEATURES.every((f) => !!f.href || !!f.event), true);
check('feature ids are unique', new Set(SEARCH_FEATURES.map((f) => f.id)).size, SEARCH_FEATURES.length);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
