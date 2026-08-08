import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import RubricTemplate from '@/models/RubricTemplate';
import { verifyAdminToken } from '@/lib/adminAuth';
import { ensureDefaultRubricTemplates } from '@/lib/rubricSeed';

export async function GET(request: NextRequest) {
  try {
    if (!(await verifyAdminToken(request))) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
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

export async function POST(request: NextRequest) {
  try {
    if (!(await verifyAdminToken(request))) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    await dbConnect();

    const body = await request.json();
    const { name, slug, criteria } = body;

    if (!name || !slug || !Array.isArray(criteria) || criteria.length !== 5) {
      return NextResponse.json(
        { error: 'name, slug, and exactly 5 criteria are required' },
        { status: 400 }
      );
    }

    const existing = await RubricTemplate.findOne({ slug: slug.trim().toLowerCase() });
    if (existing) {
      return NextResponse.json({ error: 'A rubric with this slug already exists' }, { status: 400 });
    }

    const rubric = new RubricTemplate({
      name: name.trim(),
      slug: slug.trim().toLowerCase(),
      criteria,
      isSystem: false,
    });

    await rubric.save();

    return NextResponse.json(rubric, { status: 201 });
  } catch (error: any) {
    console.error('Error creating rubric template:', error);
    return NextResponse.json({ error: error.message || 'Failed to create rubric template' }, { status: 500 });
  }
}
