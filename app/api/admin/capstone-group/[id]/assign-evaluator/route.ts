import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import dbConnect from '@/lib/mongodb';
import CapstoneGroup from '@/models/CapstoneGroup';
import User from '@/models/User';

import { ADMIN_JWT_SECRET as SECRET } from '@/lib/adminAuth';

// Verify admin token
async function verifyAdminToken(request: NextRequest): Promise<boolean> {
  try {
    const token = request.cookies.get('admin-token')?.value;
    if (!token) return false;

    const { payload } = await jwtVerify(token, SECRET);
    return payload.type === 'admin';
  } catch (error) {
    return false;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const isAdmin = await verifyAdminToken(request);

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await dbConnect();

    const { id } = await params;
    const body = await request.json();
    const { evaluatorId } = body;

    if (!evaluatorId) {
      return NextResponse.json(
        { error: 'Evaluator ID is required' },
        { status: 400 }
      );
    }

    // Verify evaluator exists
    const evaluator = await User.findById(evaluatorId);
    if (!evaluator) {
      return NextResponse.json(
        { error: 'Evaluator not found' },
        { status: 404 }
      );
    }

    const group = await CapstoneGroup.findById(id);
    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    // Check if evaluator is already assigned
    const alreadyAssigned = group.evaluatorAssignments.some(
      (assignment) => assignment.evaluatorId.toString() === evaluatorId
    );

    if (alreadyAssigned) {
      return NextResponse.json(
        { error: 'Evaluator is already assigned to this group' },
        { status: 400 }
      );
    }

    // Add evaluator assignment
    group.evaluatorAssignments.push({
      evaluatorId,
      assignedAt: new Date(),
      assignedBy: request.cookies.get('admin-id')?.value as any || 'unknown',
      status: 'pending',
    });

    await group.save();

    const updatedGroup = await CapstoneGroup.findById(group._id)
      .populate({
        path: 'studentIds',
        select: 'name studentId email',
      })
      .populate({
        path: 'supervisorId',
        select: 'name email',
      })
      .populate({
        path: 'evaluatorAssignments.evaluatorId',
        select: 'name email',
      })
      .populate({
        path: 'courseId',
        select: 'name code',
      });

    return NextResponse.json(updatedGroup);
  } catch (error: any) {
    console.error('Error assigning evaluator:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to assign evaluator' },
      { status: 500 }
    );
  }
}
