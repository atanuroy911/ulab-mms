import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { parseCourseFile, CourseFileParseError } from '@/lib/courseFileImport/parseGradeSheet';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB, same guard used for resource uploads

// POST - parse an uploaded hand-filled CO-PO gradesheet into a preview structure.
// Read-only: never touches the database. Step 1 of the "Import Course File (Alpha)" wizard.
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Please provide a .xlsx file' }, { status: 400 });
    }

    if (!/\.xlsx$/i.test(file.name)) {
      return NextResponse.json({ error: 'Only .xlsx files are supported' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File is too large (max 25MB)' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseCourseFile(buffer);

    return NextResponse.json({ parsed }, { status: 200 });
  } catch (error: any) {
    if (error instanceof CourseFileParseError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error('Parse course file error:', error);
    return NextResponse.json(
      { error: 'Could not read this file - please confirm it\'s a CO-PO course file gradesheet (.xlsx).' },
      { status: 500 }
    );
  }
}
