import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import dbConnect from '@/lib/mongodb';
import CapstoneGroup from '@/models/CapstoneGroup';
import AdminSettings from '@/models/AdminSettings';

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

// Verify admin password from header
async function verifyAdminPassword(request: NextRequest): Promise<boolean> {
  try {
    const adminPassword = request.headers.get('x-admin-password');
    if (!adminPassword) return false;

    const adminSettings = await AdminSettings.findOne();
    if (!adminSettings || !adminSettings.passwordHash) return false;

    const isPasswordValid = await bcrypt.compare(adminPassword, adminSettings.passwordHash);
    return isPasswordValid;
  } catch (error) {
    return false;
  }
}

// Check authorization (either JWT or password header)
async function checkAuthorization(request: NextRequest): Promise<boolean> {
  const isJwtValid = await verifyAdminToken(request);
  const isPasswordValid = await verifyAdminPassword(request);
  return isJwtValid || isPasswordValid;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const isAuthorized = await checkAuthorization(request);

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    await dbConnect();

    const { id } = await params;

    const group = await CapstoneGroup.findById(id)
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

    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(group);
  } catch (error: any) {
    console.error('Error fetching capstone group:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch group' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const isAuthorized = await checkAuthorization(request);

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    await dbConnect();

    const { id } = await params;
    const body = await request.json();
    const { groupName, description, courseId, semester, studentIds, supervisorId } = body;

    const group = await CapstoneGroup.findById(id);
    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    // Update fields
    if (groupName) group.groupName = groupName;
    if (description !== undefined) group.description = description;
    if (courseId) group.courseId = courseId;
    if (semester !== undefined) group.semester = semester;
    if (studentIds) group.studentIds = studentIds;
    if (supervisorId) group.supervisorId = supervisorId;

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
    console.error('Error updating capstone group:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update group' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const isAuthorized = await checkAuthorization(request);

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    await dbConnect();

    const { id } = await params;

    const group = await CapstoneGroup.findByIdAndDelete(id);

    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: 'Group deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting capstone group:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete group' },
      { status: 500 }
    );
  }
}
