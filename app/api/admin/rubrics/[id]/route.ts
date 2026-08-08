import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import RubricTemplate from '@/models/RubricTemplate';
import Exam from '@/models/Exam';
import mongoose from 'mongoose';
import { verifyAdminToken } from '@/lib/adminAuth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await verifyAdminToken(request))) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid rubric ID' }, { status: 400 });
    }

    await dbConnect();

    const body = await request.json();
    const { name, criteria } = body;

    const rubric = await RubricTemplate.findById(id);
    if (!rubric) {
      return NextResponse.json({ error: 'Rubric not found' }, { status: 404 });
    }

    if (name !== undefined) rubric.name = name.trim();
    if (criteria !== undefined) {
      if (!Array.isArray(criteria) || criteria.length !== 5) {
        return NextResponse.json({ error: 'criteria must be an array of exactly 5 items' }, { status: 400 });
      }
      rubric.criteria = criteria;
    }

    await rubric.save();

    return NextResponse.json(rubric);
  } catch (error: any) {
    console.error('Error updating rubric template:', error);
    return NextResponse.json({ error: error.message || 'Failed to update rubric template' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await verifyAdminToken(request))) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid rubric ID' }, { status: 400 });
    }

    await dbConnect();

    const rubric = await RubricTemplate.findById(id);
    if (!rubric) {
      return NextResponse.json({ error: 'Rubric not found' }, { status: 404 });
    }

    if (rubric.isSystem) {
      return NextResponse.json({ error: 'Built-in rubrics cannot be deleted' }, { status: 400 });
    }

    const usageCount = await Exam.countDocuments({ rubricTemplateId: id });
    if (usageCount > 0) {
      return NextResponse.json(
        { error: `This rubric is used by ${usageCount} exam(s) and cannot be deleted` },
        { status: 409 }
      );
    }

    await RubricTemplate.findByIdAndDelete(id);

    return NextResponse.json({ message: 'Rubric deleted successfully' });
  } catch (error) {
    console.error('Error deleting rubric template:', error);
    return NextResponse.json({ error: 'Failed to delete rubric template' }, { status: 500 });
  }
}
