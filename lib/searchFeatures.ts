/**
 * Everything the global search (Ctrl/Cmd+K) can jump to that isn't a database record: pages,
 * sections within pages and actions. Each entry lands on the exact place - a tab via ?tab= or
 * ?view=, a dialog via ?action=, a settings card via #anchor - so these hrefs are the contract
 * with the pages that read those parameters.
 *
 * `audience` gates who sees an entry, mirroring what the server allows:
 *  - teacher: any signed-in teacher account (courses are per teacher)
 *  - manager: coordinators and admins, including the /admin panel login
 *  - admin:   the admin role or the /admin panel login
 *  - staff:   any of the above
 * Hiding an entry is a convenience only - every destination enforces its own access.
 */

export type SearchAudience = 'staff' | 'teacher' | 'manager' | 'admin';

export interface SearchFeature {
  id: string;
  title: string;
  description: string;
  group: 'Courses' | 'Capstone' | 'Account' | 'Administration' | 'Help';
  href?: string;
  /** Instead of navigating, fire this window event (e.g. open the bug-report dialog). */
  event?: string;
  keywords: string[];
  audience: SearchAudience;
}

export const SEARCH_FEATURES: SearchFeature[] = [
  // ── Courses ──────────────────────────────────────────────────────────────────────────
  { id: 'my-courses', title: 'My Courses', description: 'Your current courses', group: 'Courses', href: '/dashboard', keywords: ['home', 'dashboard', 'courses', 'classes'], audience: 'teacher' },
  { id: 'add-course', title: 'Add a course', description: 'Create a new course for this semester', group: 'Courses', href: '/dashboard?action=add-course', keywords: ['new course', 'create course', 'add class'], audience: 'teacher' },
  { id: 'restore-course', title: 'Restore a course from backup', description: 'Import a course file exported from this system', group: 'Courses', href: '/dashboard?action=restore-course', keywords: ['import', 'restore', 'backup', 'upload course'], audience: 'teacher' },
  { id: 'import-course-file', title: 'Import a CO-PO course file', description: 'Turn a hand-filled course-file gradesheet into a course', group: 'Courses', href: '/dashboard?action=import-course-file', keywords: ['co po', 'course file', 'excel', 'gradesheet', 'import'], audience: 'teacher' },
  { id: 'archived', title: 'Archived courses', description: 'Past semesters, by term', group: 'Courses', href: '/dashboard/archived', keywords: ['archive', 'old courses', 'previous semester', 'restore'], audience: 'teacher' },
  { id: 'resources', title: 'Resources', description: 'Shared files and folders', group: 'Courses', href: '/resources', keywords: ['files', 'documents', 'folders', 'templates', 'upload'], audience: 'teacher' },

  // ── Capstone ─────────────────────────────────────────────────────────────────────────
  { id: 'capstone-mine', title: 'My capstone groups', description: 'Groups you supervise or evaluate', group: 'Capstone', href: '/capstone', keywords: ['capstone', 'thesis', 'project groups', 'supervise', 'evaluate', 'my groups'], audience: 'teacher' },
  { id: 'capstone-journal', title: 'Review weekly journals', description: "Comment on your students' journal entries", group: 'Capstone', href: '/capstone', keywords: ['journal', 'weekly', 'review', 'comment', 'reminder'], audience: 'teacher' },
  { id: 'capstone-sessions', title: 'Capstone sessions', description: 'Open sessions, add groups, assign supervisors and evaluators', group: 'Capstone', href: '/capstone/sessions', keywords: ['capstone', 'sessions', 'groups', 'supervisor', 'evaluator', 'coordinator', 'report links', 'print sheets'], audience: 'manager' },
  { id: 'capstone-new-session', title: 'Open a new capstone session', description: 'Start capstone for a semester and department', group: 'Capstone', href: '/capstone/sessions?action=new-session', keywords: ['new session', 'create session', 'open capstone', 'semester'], audience: 'manager' },
  { id: 'grading-schemes', title: 'Grading schemes', description: 'How component marks combine into a final grade', group: 'Capstone', href: '/capstone/grading-schemes', keywords: ['grading', 'scheme', 'formula', 'weights', 'grade bands', 'letter grade'], audience: 'manager' },

  // ── Account ──────────────────────────────────────────────────────────────────────────
  { id: 'settings', title: 'Settings', description: 'Your preferences and account', group: 'Account', href: '/settings', keywords: ['preferences', 'profile', 'options'], audience: 'teacher' },
  { id: 'settings-weightages', title: 'Default exam weightages', description: 'Mid-term and final weightages for new courses', group: 'Account', href: '/settings#weightages', keywords: ['weightage', 'weight', 'midterm', 'final', 'default'], audience: 'teacher' },
  { id: 'settings-attendance', title: 'Attendance & class settings', description: 'Defaults for attendance and class sheets', group: 'Account', href: '/settings#attendance', keywords: ['attendance', 'class time', 'room', 'sheet'], audience: 'teacher' },
  { id: 'settings-password', title: 'Change password', description: 'Set or change your password', group: 'Account', href: '/settings#password', keywords: ['password', 'reset', 'security', 'login'], audience: 'teacher' },
  { id: 'settings-linked', title: 'Linked accounts', description: 'Connect or check Google sign-in', group: 'Account', href: '/settings#linked-accounts', keywords: ['google', 'link', 'sign in', 'connect'], audience: 'teacher' },
  { id: 'settings-account', title: 'Account information', description: 'Your name, email and department', group: 'Account', href: '/settings#account', keywords: ['profile', 'email', 'department', 'name'], audience: 'teacher' },

  // ── Administration ───────────────────────────────────────────────────────────────────
  { id: 'admin-overview', title: 'Admin overview', description: 'System-wide statistics', group: 'Administration', href: '/admin/dashboard?tab=overview', keywords: ['admin', 'stats', 'overview'], audience: 'admin' },
  { id: 'admin-accounts', title: 'Account manager', description: 'Teacher accounts, roles and invitations', group: 'Administration', href: '/admin/dashboard?tab=accounts', keywords: ['users', 'teachers', 'roles', 'coordinator', 'invite', 'accounts'], audience: 'admin' },
  { id: 'admin-departments', title: 'Departments', description: 'Departments and their heads', group: 'Administration', href: '/admin/dashboard?tab=departments', keywords: ['department', 'faculty', 'head'], audience: 'admin' },
  { id: 'admin-courses', title: 'Course management', description: "Every teacher's courses", group: 'Administration', href: '/admin/dashboard?tab=courses', keywords: ['all courses', 'courses'], audience: 'admin' },
  { id: 'admin-resources', title: 'Manage resources', description: 'Shared folders and files', group: 'Administration', href: '/admin/dashboard?tab=resources', keywords: ['resources', 'files', 'folders'], audience: 'admin' },
  { id: 'admin-semesters', title: 'Semester management', description: 'Add or edit semesters', group: 'Administration', href: '/admin/dashboard?tab=semesters', keywords: ['semester', 'term', 'spring', 'summer', 'fall'], audience: 'admin' },
  { id: 'admin-capstone', title: 'Capstone management (admin)', description: 'All capstone sessions', group: 'Administration', href: '/admin/dashboard?tab=capstone', keywords: ['capstone', 'sessions'], audience: 'admin' },
  { id: 'admin-rubrics', title: 'Rubric management', description: 'Presentation, report and project rubrics', group: 'Administration', href: '/admin/dashboard?tab=rubrics', keywords: ['rubric', 'criteria', 'presentation', 'report'], audience: 'admin' },
  { id: 'admin-backup', title: 'Backup & restore', description: 'Export or restore the database', group: 'Administration', href: '/admin/dashboard?tab=backup', keywords: ['backup', 'restore', 'export', 'database'], audience: 'admin' },
  { id: 'admin-settings', title: 'Admin settings', description: 'Sign-in options and admin password', group: 'Administration', href: '/admin/settings', keywords: ['sign in', 'login', 'google only', 'admin password', 'settings'], audience: 'admin' },
  { id: 'developer-settings', title: 'Developer settings', description: 'Testing switches, e.g. allow any email domain', group: 'Administration', href: '/admin/dashboard?tab=developer', keywords: ['developer', 'dev mode', 'testing', 'email domain'], audience: 'admin' },

  // ── Help ─────────────────────────────────────────────────────────────────────────────
  { id: 'report-bug', title: 'Report a bug or request a feature', description: 'Tell the developers about a problem', group: 'Help', event: 'open-bug-report', keywords: ['bug', 'issue', 'problem', 'feedback', 'feature request', 'help'], audience: 'staff' },
];

/** Who the viewer is, as far as the search needs to know. */
export interface SearchViewer {
  /** Signed in with a teacher account (has their own courses). */
  teacher: boolean;
  roles: string[];
  /** The /admin panel login, with or without a teacher account. */
  adminPanel: boolean;
}

export function canSee(feature: SearchFeature, viewer: SearchViewer): boolean {
  const admin = viewer.adminPanel || viewer.roles.includes('admin');
  const manager = admin || viewer.roles.includes('coordinator');
  switch (feature.audience) {
    case 'teacher':
      return viewer.teacher;
    case 'manager':
      return manager;
    case 'admin':
      return admin;
    default:
      return viewer.teacher || viewer.adminPanel;
  }
}

/** Scores a feature against a query: 0 = no match. Title hits beat keyword hits. */
export function scoreFeature(feature: SearchFeature, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const title = feature.title.toLowerCase();
  if (title.startsWith(q)) return 100;
  if (title.includes(q)) return 80;
  if (feature.keywords.some((k) => k.startsWith(q))) return 60;
  if (feature.keywords.some((k) => k.includes(q))) return 40;
  if (feature.description.toLowerCase().includes(q)) return 20;
  // Every word appears somewhere (e.g. "change pass").
  const words = q.split(/\s+/).filter(Boolean);
  const haystack = `${title} ${feature.keywords.join(' ')} ${feature.description.toLowerCase()}`;
  return words.length > 1 && words.every((w) => haystack.includes(w)) ? 10 : 0;
}
