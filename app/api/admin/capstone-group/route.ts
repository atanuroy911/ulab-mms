import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import dbConnect from '@/lib/mongodb';
import CapstoneGroup from '@/models/CapstoneGroup';
import Student from '@/models/Student';
import User from '@/models/User';
import Course from '@/models/Course';
import AdminCourse from '@/models/AdminCourse';
import AdminSettings from '@/models/AdminSettings';
import { migrateIndexes } from '@/lib/migrations';

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

export async function GET(request: NextRequest) {
  try {
    const isAuthorized = await checkAuthorization(request);

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('courseId');
    const supervisorId = searchParams.get('supervisorId');

    const query: any = {};
    if (courseId) query.courseId = courseId;
    if (supervisorId) query.supervisorId = supervisorId;

    const groups = await CapstoneGroup.find(query)
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
      })
      .sort({ createdAt: -1 });

    return NextResponse.json(groups);
  } catch (error: any) {
    console.error('Error fetching capstone groups:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch groups' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const isAuthorized = await checkAuthorization(request);

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Run index migration to clean up old conflicting indexes
    await migrateIndexes();

    await dbConnect();

    const body = await request.json();
    const {
      courseId,
      groupName,
      groupNumber,
      description,
      studentIds,
      semester,
      supervisorId,
    } = body;

    // Validation
    if (!courseId || !groupName || !supervisorId) {
      return NextResponse.json(
        { error: 'Missing required fields: courseId, groupName, supervisorId' },
        { status: 400 }
      );
    }

    // Verify course exists (check both AdminCourse and Course)
    let course = await AdminCourse.findById(courseId);
    if (!course) {
      course = await Course.findById(courseId);
    }
    if (!course) {
      return NextResponse.json(
        { error: 'Course not found' },
        { status: 404 }
      );
    }

    // Verify supervisor exists
    const supervisor = await User.findById(supervisorId);
    if (!supervisor) {
      return NextResponse.json(
        { error: 'Supervisor not found' },
        { status: 404 }
      );
    }

    // Use provided studentIds (don't require strict validation)
    // Students may not be in Student collection yet, but we can still reference them
    const finalStudentIds = studentIds || [];

    // Create new group
    const newGroup = new CapstoneGroup({
      courseId,
      groupName,
      semester: semester || '',
      description: description || '',
      studentIds: finalStudentIds,
      supervisorId,
      evaluatorAssignments: [],
    });

    await newGroup.save();

    const populatedGroup = await CapstoneGroup.findById(newGroup._id)
      .populate({
        path: 'studentIds',
        select: 'name studentId email',
      })
      .populate({
        path: 'supervisorId',
        select: 'name email',
      })
      .populate({
        path: 'courseId',
        select: 'name code',
      });

    return NextResponse.json(populatedGroup, { status: 201 });
  } catch (error: any) {
    console.error('Error creating capstone group:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create group' },
      { status: 500 }
    );
  }
}
