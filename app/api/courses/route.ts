import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Course from '@/models/Course';
import Exam from '@/models/Exam';
import User from '@/models/User';
import AdminCourse from '@/models/AdminCourse';
import { findFixedCourseByCode } from '@/lib/catalogueRegistry';
import mongoose from 'mongoose';

async function resolveUserObjectId(session: any) {
  const sessionUserId = session?.user?.id as string | undefined;
  const sessionUserEmail = session?.user?.email as string | undefined;

  if (sessionUserId && mongoose.Types.ObjectId.isValid(sessionUserId)) {
    return sessionUserId;
  }

  if (sessionUserEmail) {
    const localUser = await User.findOne({ email: sessionUserEmail.toLowerCase() }).lean();
    if (localUser?._id) {
      return String(localUser._id);
    }
  }

  return null;
}

// GET all courses for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    const userObjectId = await resolveUserObjectId(session);

    if (!userObjectId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    // Check if requesting archived courses
    const { searchParams } = new URL(request.url);
    const archived = searchParams.get('archived') === 'true';

    // Get user's courses AND capstone courses (created by any user)
    const query = {
      isArchived: archived ? true : { $ne: true }
    };
    
    // Get user's own courses
    let courses = await Course.find({ 
      ...query,
      userId: new mongoose.Types.ObjectId(userObjectId),
    }).sort({
      createdAt: -1,
    });

    // Also get capstone courses (check if they exist from any user)
    const capstoneCodes = ['CSE4098A', 'CSE4098B', 'CSE4098C', 'CSE499'];
    const capstoneCoursesExists = await Course.find({ 
      code: { $in: capstoneCodes },
      ...query
    });

    // Combine and remove duplicates
    const combinedCourses = [...courses];
    for (const capstoneCourse of capstoneCoursesExists) {
      if (!combinedCourses.find(c => c.code === capstoneCourse.code)) {
        combinedCourses.push(capstoneCourse);
      }
    }

    return NextResponse.json({ courses: combinedCourses }, { status: 200 });
  } catch (error: any) {
    console.error('Get courses error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST create a new course
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    const userObjectId = await resolveUserObjectId(session);

    if (!userObjectId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, code, semester, year, section, courseType, aliasEnabled, alternateCode, classTime, classRoom, classDays } = await request.json();

    // Validation
    if (!name || !code || !semester || !year || !section || !courseType) {
      return NextResponse.json(
        { error: 'Please provide all required fields' },
        { status: 400 }
      );
    }

    if (!['Spring', 'Summer', 'Fall'].includes(semester)) {
      return NextResponse.json(
        { error: 'Invalid semester. Must be Spring, Summer, or Fall' },
        { status: 400 }
      );
    }

    if (!['Theory', 'Lab'].includes(courseType)) {
      return NextResponse.json(
        { error: 'Invalid course type. Must be Theory or Lab' },
        { status: 400 }
      );
    }

    if (aliasEnabled && !String(alternateCode || '').trim()) {
      return NextResponse.json(
        { error: 'Please provide a New Code' },
        { status: 400 }
      );
    }

    await dbConnect();

    // Suggest a New Code (aka UNESCO code) from the admin catalogue, falling back to
    // the fixed PDF-transcribed registry, when the teacher didn't type one in. Storing
    // it doesn't turn aliasing on by itself -- everywhere else keys off aliasEnabled.
    // Some catalogue/registry entries use the course code itself as a placeholder when
    // no real UNESCO code is on file -- that's not an actual "New Code", so ignore it.
    const trimmedCode = code.trim();
    const isDistinctCode = (candidate?: string | null) =>
      Boolean(candidate && candidate.trim() && candidate.trim().toUpperCase() !== trimmedCode.toUpperCase());

    let resolvedAlternateCode = String(alternateCode || '').trim();
    if (!resolvedAlternateCode) {
      const adminCourse = await AdminCourse.findOne({ courseCode: trimmedCode }).select('unescoCode').lean();
      const fallback = adminCourse?.unescoCode || findFixedCourseByCode(trimmedCode)?.course.unescoCode || '';
      resolvedAlternateCode = isDistinctCode(fallback) ? fallback : '';
    }

    const course = await Course.create({
      name,
      code,
      semester,
      year,
      section,
      courseType,
      aliasEnabled: Boolean(aliasEnabled),
      alternateCode: resolvedAlternateCode,
      projectWeightage: courseType === 'Lab' ? 40 : 25,
      classTime: classTime || '',
      classRoom: classRoom || '',
      classDays: Array.isArray(classDays) ? classDays : [],
      userId: new mongoose.Types.ObjectId(userObjectId),
    });

    // Auto-initialize required exams based on course type
    let examsToCreate: any[] = [];

    if (courseType === 'Theory') {
      // Theory courses: Midterm and Final with CO breakdown
      examsToCreate = [
        {
          courseId: course._id,
          displayName: 'Midterm',
          examType: 'midterm',
          totalMarks: 25,
          weightage: 25,
          isRequired: true,
          examCategory: 'MainExam',
          numberOfCOs: 3, // Default 3 COs, can be edited later
          userId: new mongoose.Types.ObjectId(userObjectId),
        },
        {
          courseId: course._id,
          displayName: 'Final',
          examType: 'final',
          totalMarks: 40,
          weightage: 40,
          examCategory: 'MainExam',
          isRequired: true,
          numberOfCOs: 4, // Default 4 COs, can be edited later
          userId: new mongoose.Types.ObjectId(userObjectId),
        },
      ];
    } else if (courseType === 'Lab') {
      // Lab courses: Lab Final and OEL/CE Project
      examsToCreate = [
        {
          courseId: course._id,
          displayName: 'Lab Final',
          examType: 'labFinal',
          totalMarks: 30,
          weightage: 30,
          examCategory: 'MainExam',
          isRequired: true,
          userId: new mongoose.Types.ObjectId(userObjectId),
        },
        {
          courseId: course._id,
          displayName: 'OEL/CE Project',
          examType: 'oel',
          totalMarks: 100, // Default to 100 marks, can be distributed later
          weightage: 40,
          examCategory: 'Project',
          isRequired: true,
          userId: new mongoose.Types.ObjectId(userObjectId),
        },
      ];
    }

    // Create the required exams
    if (examsToCreate.length > 0) {
      await Exam.insertMany(examsToCreate);
    }

    return NextResponse.json({ course }, { status: 201 });
  } catch (error: any) {
    console.error('Create course error:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      const { code: courseCode, semester: sem, year: yr, section: sec } = await request.json();
      return NextResponse.json(
        { error: `A course with code "${courseCode}" already exists for ${sem} ${yr}, Section ${sec}` },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
