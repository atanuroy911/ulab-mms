import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AdminSettings from '@/models/AdminSettings';
import User from '@/models/User';
import { verifyAdminAccess } from '@/lib/adminAuth';
import { invalidateAuthSettingsCache } from '@/lib/authSettings';
import { isPlausibleEmail } from '@/lib/mail';
import { getWebAdminUserId } from '@/lib/webAdminAccount';

// Developer settings. Managed from the /admin panel (the built-in admin login) or by any
// teacher account with the 'admin' role. They loosen production safeguards for testing, so
// every change records who made it - the signed-in person, or "Web Admin" for the admin
// panel login on its own (lib/webAdminAccount.ts).

async function requireAdmin(request: NextRequest) {
  const access = await verifyAdminAccess(request);
  if (!access.ok) return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  return { userId: access.userId };
}

const MAX_STUDENT_TEST_EMAILS = 20;

async function describe() {
  const settings = await AdminSettings.findOne()
    .select('devAllowAnyEmailDomain devStudentTestEmails devSettingsUpdatedBy devSettingsUpdatedAt')
    .lean<{
      devAllowAnyEmailDomain?: boolean;
      devStudentTestEmails?: string[];
      devSettingsUpdatedBy?: unknown;
      devSettingsUpdatedAt?: Date | null;
    }>();
  const updatedBy = settings?.devSettingsUpdatedBy
    ? await User.findById(settings.devSettingsUpdatedBy).select('name email').lean<{ name?: string; email?: string }>()
    : null;
  return {
    devAllowAnyEmailDomain: settings?.devAllowAnyEmailDomain === true,
    devStudentTestEmails: settings?.devStudentTestEmails || [],
    updatedAt: settings?.devSettingsUpdatedAt ?? null,
    updatedBy: updatedBy ? { name: updatedBy.name, email: updatedBy.email } : null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { error } = await requireAdmin(request);
    if (error) return error;
    await dbConnect();
    return NextResponse.json(await describe());
  } catch (err) {
    console.error('GET /api/dev-settings error:', err);
    return NextResponse.json({ error: 'Failed to load developer settings' }, { status: 500 });
  }
}

// PUT { devAllowAnyEmailDomain?: boolean, devStudentTestEmails?: string[] } - either or both.
export async function PUT(request: NextRequest) {
  try {
    const { userId, error } = await requireAdmin(request);
    if (error) return error;

    const body = await request.json().catch(() => ({}));
    const update: Record<string, unknown> = {};

    if (body?.devAllowAnyEmailDomain !== undefined) {
      if (typeof body.devAllowAnyEmailDomain !== 'boolean') {
        return NextResponse.json({ error: 'devAllowAnyEmailDomain must be a boolean' }, { status: 400 });
      }
      update.devAllowAnyEmailDomain = body.devAllowAnyEmailDomain;
    }

    if (body?.devStudentTestEmails !== undefined) {
      if (!Array.isArray(body.devStudentTestEmails)) {
        return NextResponse.json({ error: 'devStudentTestEmails must be a list of emails' }, { status: 400 });
      }
      const emails = [...new Set(body.devStudentTestEmails.map((e: unknown) => String(e).trim().toLowerCase()).filter(Boolean))] as string[];
      const invalid = emails.filter((e) => !isPlausibleEmail(e));
      if (invalid.length) {
        return NextResponse.json({ error: `Not a valid email: ${invalid.join(', ')}` }, { status: 400 });
      }
      if (emails.length > MAX_STUDENT_TEST_EMAILS) {
        return NextResponse.json({ error: `At most ${MAX_STUDENT_TEST_EMAILS} test addresses` }, { status: 400 });
      }
      update.devStudentTestEmails = emails;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    await dbConnect();
    await AdminSettings.findOneAndUpdate(
      {},
      { ...update, devSettingsUpdatedBy: userId ?? (await getWebAdminUserId()), devSettingsUpdatedAt: new Date() },
      { upsert: true, setDefaultsOnInsert: true }
    );
    invalidateAuthSettingsCache();
    console.warn(`[dev-settings] ${JSON.stringify(update)} by ${userId ? `user ${userId}` : 'Web Admin'}`);

    return NextResponse.json(await describe());
  } catch (err) {
    console.error('PUT /api/dev-settings error:', err);
    return NextResponse.json({ error: 'Failed to update developer settings' }, { status: 500 });
  }
}
