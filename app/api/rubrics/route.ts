import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import RubricTemplate from '@/models/RubricTemplate';
import { ensureDefaultRubricTemplates } from '@/lib/rubricSeed';

/**
 * GET /api/rubrics
 * Read-only listing of rubric templates for teachers, used to populate the
 * "Rubric" select on Project exams and to drive the marking UI in ProjectView.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    await ensureDefaultRubricTemplates();

    const rubrics = await RubricTemplate.find().sort({ isSystem: -1, createdAt: 1 });

    return NextResponse.json(rubrics);
  } catch (error) {
    console.error('Error fetching rubric templates:', error);
    return NextResponse.json({ error: 'Failed to fetch rubric templates' }, { status: 500 });
  }
}
