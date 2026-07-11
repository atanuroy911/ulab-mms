import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AdminSettings from '@/models/AdminSettings';
import { verifyAdminToken } from '@/lib/adminAuth';

export async function GET(request: NextRequest) {
  try {
    const ok = await verifyAdminToken(request);
    if (!ok) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    await dbConnect();
    const settings = await AdminSettings.findOne().select('credentialsLoginEnabled').lean();

    return NextResponse.json({ credentialsLoginEnabled: settings?.credentialsLoginEnabled !== false });
  } catch (error) {
    console.error('Get admin settings error:', error);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const ok = await verifyAdminToken(request);
    if (!ok) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    await dbConnect();
    const body = await request.json().catch(() => ({}));

    if (typeof body?.credentialsLoginEnabled !== 'boolean') {
      return NextResponse.json({ error: 'credentialsLoginEnabled must be a boolean' }, { status: 400 });
    }

    const settings = await AdminSettings.findOneAndUpdate(
      {},
      { credentialsLoginEnabled: body.credentialsLoginEnabled },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json({ credentialsLoginEnabled: settings.credentialsLoginEnabled });
  } catch (error) {
    console.error('Update admin settings error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
