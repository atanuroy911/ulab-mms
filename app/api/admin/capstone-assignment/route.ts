import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import dbConnect from '@/lib/mongodb';
import CapstoneMarks from '@/models/CapstoneMarks';
import Student from '@/models/Student';
import User from '@/models/User';
import Course from '@/models/Course';
import mongoose from 'mongoose';

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

// GET - Fetch assigned capstone students
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('courseId');
    const userId = searchParams.get('userId');

    await dbConnect();

    let query: any = {};

    if (courseId) {
      query.courseId = new mongoose.Types.ObjectId(courseId);
    }

    if (userId) {
      query.$or = [
        { supervisorId: new mongoose.Types.ObjectId(userId) },
        { evaluatorId: new mongoose.Types.ObjectId(userId) },
      ];
    }

    const assignments = await CapstoneMarks.find(query)
      .populate('studentId', 'name studentId')
      .populate('courseId', 'name code')
      .populate('supervisorId', 'name email')
      .populate('evaluatorId', 'name email')
      .sort({ createdAt: -1 });

    return NextResponse.json(assignments);
  } catch (error) {
    console.error('GET /api/admin/capstone-assignment error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch assignments' },
      { status: 500 }
    );
  }
}

// POST - Assign students to supervisors/evaluators
export async function POST(request: NextRequest) {
  try {
    // Verify admin
    const isAdmin = await verifyAdminToken(request);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    await dbConnect();

    const {
      courseId,
      studentId,
      supervisorId,
      evaluatorId,
      supervisorRole,
      evaluatorRole,
    } = await request.json();

    // Validate required fields
    if (!courseId || !studentId || !supervisorId) {
      return NextResponse.json(
        { error: 'Missing required fields: courseId, studentId, supervisorId' },
        { status: 400 }
      );
    }

    // Verify course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    // Verify student exists
    const student = await Student.findById(studentId);
    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // Verify supervisor exists
    const supervisor = await User.findById(supervisorId);
    if (!supervisor) {
      return NextResponse.json({ error: 'Supervisor not found' }, { status: 404 });
    }

    // Verify evaluator exists if provided
    if (evaluatorId) {
      const evaluator = await User.findById(evaluatorId);
      if (!evaluator) {
        return NextResponse.json({ error: 'Evaluator not found' }, { status: 404 });
      }
    }

    // Check if assignment already exists
    let capstoneMarks = await CapstoneMarks.findOne({
      studentId,
      courseId,
      supervisorId,
    });

    if (!capstoneMarks) {
      capstoneMarks = new CapstoneMarks({
        studentId,
        courseId,
        supervisorId,
        evaluatorId: evaluatorId || null,
        supervisorRole: supervisorRole || 'supervisor',
        evaluatorRole: evaluatorRole || 'evaluator',
        submittedBy: new mongoose.Types.ObjectId(supervisorId),
        assignedBy: new mongoose.Types.ObjectId(supervisorId),
        submissionType: 'supervisor',
      });
    } else {
      // Update existing assignment
      if (evaluatorId) {
        capstoneMarks.evaluatorId = new mongoose.Types.ObjectId(evaluatorId);
      }
      capstoneMarks.supervisorRole = supervisorRole || capstoneMarks.supervisorRole;
      capstoneMarks.evaluatorRole = evaluatorRole || capstoneMarks.evaluatorRole;
      capstoneMarks.assignedBy = new mongoose.Types.ObjectId(supervisorId);
    }

    await capstoneMarks.save();

    const populated = await capstoneMarks.populate([
      { path: 'studentId', select: 'name studentId' },
      { path: 'courseId', select: 'name code' },
      { path: 'supervisorId', select: 'name email' },
      { path: 'evaluatorId', select: 'name email' },
    ]);

    return NextResponse.json(populated, { status: 201 });
  } catch (error) {
    console.error('POST /api/admin/capstone-assignment error:', error);
    return NextResponse.json(
      { error: 'Failed to assign student' },
      { status: 500 }
    );
  }
}

// DELETE - Remove assignment
export async function DELETE(request: NextRequest) {
  try {
    // Verify admin
    const isAdmin = await verifyAdminToken(request);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const assignmentId = searchParams.get('id');

    if (!assignmentId) {
      return NextResponse.json(
        { error: 'Assignment ID required' },
        { status: 400 }
      );
    }

    await dbConnect();

    const result = await CapstoneMarks.findByIdAndDelete(assignmentId);

    if (!result) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Assignment deleted successfully' });
  } catch (error) {
    console.error('DELETE /api/admin/capstone-assignment error:', error);
    return NextResponse.json(
      { error: 'Failed to delete assignment' },
      { status: 500 }
    );
  }
}
