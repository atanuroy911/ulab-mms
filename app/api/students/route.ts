import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Student from '@/models/Student';
import Course from '@/models/Course';
import { verifyAdminToken } from '@/lib/adminAuth';

const studentIdCollation = { locale: 'en', numericOrdering: true } as const;

// GET all students (with optional filtering)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const isAdmin = await verifyAdminToken(request);
    if (!session?.user?.id && !isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('courseId');
    const semester = searchParams.get('semester');
    const year = searchParams.get('year');
    const includeArchivedCourses = searchParams.get('includeArchived') === 'true';

    let query: any = {};

    // If courseId is specified, filter by that course - but only if the caller owns it (or
    // is an admin). Without this, any signed-in teacher could pass an arbitrary courseId and
    // read another teacher's full roster.
    if (courseId) {
      const courseFilter: any = { _id: courseId };
      if (!isAdmin) {
        courseFilter.userId = session!.user.id;
      }
      const course = await Course.findOne(courseFilter);
      if (!course) {
        return NextResponse.json({ error: 'Course not found' }, { status: 404 });
      }
      query.courseId = courseId;
    } else if (semester || year) {
      // Filter by semester/year - need to find courses first, scoped to the caller's own
      // courses unless they're an admin.
      let courseQuery: any = {};

      if (!isAdmin) {
        courseQuery.userId = session!.user.id;
      }
      if (semester) {
        courseQuery.semester = semester;
      }
      if (year) {
        courseQuery.year = parseInt(year);
      }
      if (!includeArchivedCourses) {
        courseQuery.isArchived = { $ne: true };
      }

      const courses = await Course.find(courseQuery);
      const courseIds = courses.map(c => c._id);

      if (courseIds.length > 0) {
        query.courseId = { $in: courseIds };
      } else {
        // No courses found for the given criteria
        return NextResponse.json([], { status: 200 });
      }
    } else if (!isAdmin) {
      // No courseId/semester/year filter and not an admin - don't hand back every student
      // across every teacher's courses.
      query.userId = session!.user.id;
    }

    // Fetch students with course details
    const students = await Student.find(query)
      .populate({
        path: 'courseId',
        select: 'name code semester year section courseType',
      })
      .sort({ studentId: 1, _id: 1 })
      .collation(studentIdCollation);

    return NextResponse.json(students, { status: 200 });
  } catch (error: any) {
    console.error('Get students error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST create students (bulk import)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { courseId, students } = await request.json();

    if (!courseId || !students || !Array.isArray(students)) {
      return NextResponse.json(
        { error: 'Please provide courseId and students array' },
        { status: 400 }
      );
    }

    await dbConnect();

    // Verify course belongs to user
    const course = await Course.findOne({
      _id: courseId,
      userId: session.user.id,
    });

    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    const sortedStudents = [...students].sort((a, b) =>
      String(a.studentId || '').localeCompare(String(b.studentId || ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    );

    // Create students in Student ID order
    const createdStudents = [];
    const errors = [];

    for (const student of sortedStudents) {
      try {
        const newStudent = await Student.create({
          studentId: student.studentId,
          name: student.name,
          courseId,
          userId: session.user.id,
        });
        createdStudents.push(newStudent);
      } catch (error: any) {
        // Handle duplicate student error
        if (error.code === 11000) {
          errors.push(`Student ${student.studentId} already exists in this course`);
        } else {
          errors.push(`Error creating student ${student.studentId}: ${error.message}`);
        }
      }
    }

    return NextResponse.json(
      {
        message: `${createdStudents.length} students created successfully`,
        students: createdStudents,
        errors: errors.length > 0 ? errors : undefined,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Create students error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
