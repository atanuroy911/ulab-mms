import { NextRequest, NextResponse } from 'next/server';
import { EJSON } from 'bson';
import dbConnect from '@/lib/mongodb';
import { verifyAdminToken } from '@/lib/adminAuth';

// Full-database backup: dumps every collection's raw documents as EJSON, which
// preserves BSON-specific types (ObjectId, Date, Decimal128, etc.) that plain
// JSON.stringify would silently corrupt. Mongoose is Atlas-only here (no local
// mongodump/mongorestore binaries available), so this exports via the driver.
export async function GET(request: NextRequest) {
  try {
    const ok = await verifyAdminToken(request);
    if (!ok) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const mongoose = await dbConnect();
    const db = mongoose.connection.db;
    if (!db) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 500 });
    }

    const collections = await db.listCollections().toArray();
    const dump: Record<string, unknown[]> = {};

    for (const { name } of collections) {
      if (name.startsWith('system.')) continue;
      dump[name] = await db.collection(name).find({}).toArray();
    }

    const payload = {
      format: 'ulab-mms-ejson-backup',
      version: 1,
      createdAt: new Date().toISOString(),
      collections: dump,
    };

    const body = EJSON.stringify(payload, { relaxed: false });
    const filename = `ulab-mms-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Database backup error:', error);
    return NextResponse.json({ error: 'Failed to create backup' }, { status: 500 });
  }
}
