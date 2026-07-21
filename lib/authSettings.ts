import dbConnect from '@/lib/mongodb';
import AdminSettings from '@/models/AdminSettings';

// Whether teachers can sign in / sign up with email+password. Defaults to
// enabled if no settings document exists yet (matches the schema default).
export async function isCredentialsLoginEnabled(): Promise<boolean> {
  await dbConnect();
  const settings = await AdminSettings.findOne().select('credentialsLoginEnabled').lean();
  return settings?.credentialsLoginEnabled !== false;
}

// Whether teachers can edit a course's New/UNESCO code (aliasEnabled/alternateCode)
// from the course settings panel. Defaults to enabled (matches the schema default
// and the feature's pre-existing behavior) so this doesn't lock teachers out unless
// an admin explicitly turns it off.
export async function isCourseCodeEditableByTeacher(): Promise<boolean> {
  await dbConnect();
  const settings = await AdminSettings.findOne().select('courseCodeEditableByTeacher').lean();
  return settings?.courseCodeEditableByTeacher !== false;
}
