import dbConnect from '@/lib/mongodb';
import AdminSettings from '@/models/AdminSettings';

// Whether teachers can sign in / sign up with email+password. Defaults to
// enabled if no settings document exists yet (matches the schema default).
export async function isCredentialsLoginEnabled(): Promise<boolean> {
  await dbConnect();
  const settings = await AdminSettings.findOne().select('credentialsLoginEnabled').lean();
  return settings?.credentialsLoginEnabled !== false;
}
