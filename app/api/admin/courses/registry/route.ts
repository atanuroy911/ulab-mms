import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AdminCourse from '@/models/AdminCourse';
import { verifyAdminToken } from '@/lib/adminAuth';
import { getFixedPrograms, getFixedCatalogue } from '@/lib/catalogueRegistry';

type DiffStatus = 'new' | 'changed' | 'unchanged';

interface RegistryDiffEntry {
  code: string;
  unescoCode: string;
  title: string;
  status: DiffStatus;
  existing?: {
    courseTitle: string;
    unescoCode: string;
  };
}

// GET: without ?major, list fixed programs for the major picker.
// With ?major=CSE, diff that program's fixed catalogue against AdminCourse.
export async function GET(request: NextRequest) {
  try {
    if (!(await verifyAdminToken(request))) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const major = searchParams.get('major');

    if (!major) {
      return NextResponse.json({ programs: getFixedPrograms() }, { status: 200 });
    }

    const fixedCourses = getFixedCatalogue(major);
    if (fixedCourses.length === 0) {
      return NextResponse.json({ entries: [], available: false }, { status: 200 });
    }

    await dbConnect();

    const codes = fixedCourses.map((c) => c.code);
    const existingDocs = await AdminCourse.find({ courseCode: { $in: codes } });
    const existingByCode = new Map(existingDocs.map((doc) => [doc.courseCode, doc]));

    const entries: RegistryDiffEntry[] = fixedCourses.map((fc) => {
      const existing = existingByCode.get(fc.code);
      if (!existing) {
        return { code: fc.code, unescoCode: fc.unescoCode, title: fc.title, status: 'new' };
      }

      const changed =
        (existing.courseTitle || '').trim() !== fc.title.trim() ||
        (existing.unescoCode || '').trim() !== (fc.unescoCode || '').trim();

      return {
        code: fc.code,
        unescoCode: fc.unescoCode,
        title: fc.title,
        status: changed ? 'changed' : 'unchanged',
        existing: {
          courseTitle: existing.courseTitle,
          unescoCode: existing.unescoCode || '',
        },
      };
    });

    return NextResponse.json({ entries, available: true }, { status: 200 });
  } catch (error: any) {
    console.error('Registry diff error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: merge selected codes from a major's fixed catalogue into AdminCourse.
// Only touches registry-sourced fields (courseTitle, unescoCode, majors) —
// creditHour/prerequisite/content on an existing doc are left untouched
// since the fixed registry has no data for them.
export async function POST(request: NextRequest) {
  try {
    if (!(await verifyAdminToken(request))) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const { major, codes } = await request.json();

    if (!major || !Array.isArray(codes) || codes.length === 0) {
      return NextResponse.json(
        { error: 'major and a non-empty codes array are required' },
        { status: 400 }
      );
    }

    const fixedCourses = getFixedCatalogue(major);
    const fixedByCode = new Map(fixedCourses.map((c) => [c.code, c]));

    await dbConnect();

    let created = 0;
    let updated = 0;
    const skipped: string[] = [];

    for (const code of codes) {
      const fc = fixedByCode.get(code);
      if (!fc) {
        skipped.push(code);
        continue;
      }

      const existing = await AdminCourse.findOne({ courseCode: fc.code });
      if (existing) {
        existing.courseTitle = fc.title;
        existing.unescoCode = fc.unescoCode || '';
        existing.majors = Array.from(new Set([...(existing.majors || []), major]));
        await existing.save();
        updated++;
      } else {
        await AdminCourse.create({
          courseCode: fc.code,
          courseTitle: fc.title,
          creditHour: 0,
          prerequisite: 'N/A',
          content: '',
          unescoCode: fc.unescoCode || '',
          majors: [major],
        });
        created++;
      }
    }

    return NextResponse.json({ created, updated, skipped }, { status: 200 });
  } catch (error: any) {
    console.error('Registry merge error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
