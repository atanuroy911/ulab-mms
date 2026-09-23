import mongoose from 'mongoose';
import User from '@/models/User';
import dbConnect from '@/lib/mongodb';

/**
 * The /admin panel's built-in login is not a person, but everything it does still needs a
 * name in "created by" / status history. This single system User is that name: "Web Admin".
 *
 * It is deliberately inert:
 *  - no password and no Google link, and a non-ULAB address (so sign-in rejects it anyway);
 *  - `systemAccount: true` hides it from every people picker and the accounts list;
 *  - isAssignableUser() refuses it as a supervisor or evaluator, so it can never mark.
 */

const WEB_ADMIN_EMAIL = 'webadmin@system.mms';
const WEB_ADMIN_NAME = 'Web Admin';

let cachedId: string | null = null;

/** Returns the Web Admin system user's id, creating the record on first use. */
export async function getWebAdminUserId(): Promise<string> {
  if (cachedId) return cachedId;
  // Callers (getCapstoneActor) run before their route connects, so connect here.
  await dbConnect();
  // Upsert rather than find-then-create, so two first requests at once can't make two.
  const user = await User.findOneAndUpdate(
    { email: WEB_ADMIN_EMAIL },
    {
      $setOnInsert: {
        name: WEB_ADMIN_NAME,
        email: WEB_ADMIN_EMAIL,
        roles: ['admin'],
        systemAccount: true,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: false }
  ).select('_id');
  cachedId = String(user._id);
  return cachedId;
}

/** Mongo filter that excludes system accounts - use in every query that lists people. */
export const PEOPLE_ONLY = { systemAccount: { $ne: true } };

/**
 * Whether a user id may be made a supervisor or evaluator: it must be a real, existing,
 * non-system account. Returns an error message, or null when assignable.
 */
export async function assignableUserError(userId: string): Promise<string | null> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return 'That person could not be found';
  const user = await User.findById(userId).select('systemAccount').lean<{ systemAccount?: boolean }>();
  if (!user) return 'That person could not be found';
  if (user.systemAccount) return 'The Web Admin account cannot supervise or evaluate groups';
  return null;
}
