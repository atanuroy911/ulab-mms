import { NextRequest, NextResponse } from 'next/server';
import { EJSON } from 'bson';
import dbConnect from '@/lib/mongodb';
import { verifyAdminToken } from '@/lib/adminAuth';

interface BackupPayload {
  format: string;
  version: number;
  collections: Record<string, Record<string, unknown>[]>;
}

function isBackupPayload(value: unknown): value is BackupPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.format === 'ulab-mms-ejson-backup' && typeof v.collections === 'object' && v.collections !== null;
}

// Restores a backup produced by GET /api/admin/backup. Destructive: replaces the
// contents of every collection present in the file. Collections not present in
// the file are left untouched.
export async function POST(request: NextRequest) {
  try {
    const ok = await verifyAdminToken(request);
    if (!ok) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const raw = await request.text();
    if (!raw) {
      return NextResponse.json({ error: 'No backup file provided' }, { status: 400 });
    }

    let payload: unknown;
    try {
      payload = EJSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Invalid backup file - not valid JSON/EJSON' }, { status: 400 });
    }

    if (!isBackupPayload(payload)) {
      return NextResponse.json({ error: 'Invalid backup file - unrecognized format' }, { status: 400 });
    }

    const mongoose = await dbConnect();
    const db = mongoose.connection.db;
    if (!db) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 500 });
    }

    const results: Record<string, number> = {};

    for (const [collectionName, documents] of Object.entries(payload.collections)) {
      const collection = db.collection(collectionName);
      await collection.deleteMany({});
      if (documents.length > 0) {
        await collection.insertMany(documents, { ordered: false });
      }
      results[collectionName] = documents.length;
    }

    return NextResponse.json({ success: true, restored: results });
  } catch (error) {
    console.error('Database restore error:', error);
    return NextResponse.json({ error: 'Failed to restore backup' }, { status: 500 });
  }
}
