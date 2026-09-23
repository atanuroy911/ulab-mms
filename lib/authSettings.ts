import dbConnect from '@/lib/mongodb';
import AdminSettings from '@/models/AdminSettings';
import { isUlabEmail } from '@/lib/googleAccount';

type CachedSettings = {
  credentialsLoginEnabled: boolean;
  courseCodeEditableByTeacher: boolean;
  devAllowAnyEmailDomain: boolean;
};

// These two settings are read on every /auth/signin mount and every teacher
// course-settings panel open, but only ever change when an admin flips a
// toggle. A short TTL cache avoids hammering Mongo with the same findOne on
// every page load while still picking up admin changes within a few seconds.
const CACHE_TTL_MS = 30_000;
let cachedSettings: CachedSettings | null = null;
let cachedAt = 0;
let pending: Promise<CachedSettings> | null = null;

async function loadSettings(): Promise<CachedSettings> {
  await dbConnect();
  const settings = await AdminSettings.findOne()
    .select('credentialsLoginEnabled courseCodeEditableByTeacher devAllowAnyEmailDomain')
    .lean();
  return {
    credentialsLoginEnabled: settings?.credentialsLoginEnabled !== false,
    courseCodeEditableByTeacher: settings?.courseCodeEditableByTeacher !== false,
    // Opt-in only: a missing document or field means restrictions stay on.
    devAllowAnyEmailDomain: settings?.devAllowAnyEmailDomain === true,
  };
}

async function getCachedSettings() {
  if (cachedSettings && Date.now() - cachedAt < CACHE_TTL_MS) return cachedSettings;
  if (!pending) {
    pending = loadSettings().finally(() => {
      pending = null;
    });
  }
  const result = await pending;
  cachedSettings = result;
  cachedAt = Date.now();
  return result;
}

/** Clears the settings cache immediately, e.g. right after an admin saves new settings. */
export function invalidateAuthSettingsCache() {
  cachedSettings = null;
}

// Whether teachers can sign in / sign up with email+password. Defaults to
// enabled if no settings document exists yet (matches the schema default).
export async function isCredentialsLoginEnabled(): Promise<boolean> {
  const settings = await getCachedSettings();
  return settings.credentialsLoginEnabled;
}

// Whether teachers can edit a course's New/UNESCO code (aliasEnabled/alternateCode)
// from the course settings panel. Defaults to enabled (matches the schema default
// and the feature's pre-existing behavior) so this doesn't lock teachers out unless
// an admin explicitly turns it off.
export async function isCourseCodeEditableByTeacher(): Promise<boolean> {
  const settings = await getCachedSettings();
  return settings.courseCodeEditableByTeacher;
}

// Developer setting: when on, teacher accounts may use any email domain, so the app can be
// tested without real @ulab.edu.bd inboxes. Off by default. Student Google flows (check-in,
// marks, project, student portal) are never relaxed - see the signIn callback.
export async function isDevAnyEmailDomainAllowed(): Promise<boolean> {
  const settings = await getCachedSettings();
  return settings.devAllowAnyEmailDomain;
}

/** The domain check for teacher accounts: @ulab.edu.bd, or anything while the developer setting is on. */
export async function isAllowedTeacherEmail(email: string | null | undefined): Promise<boolean> {
  if (isUlabEmail(email)) return true;
  return !!email && (await isDevAnyEmailDomainAllowed());
}
