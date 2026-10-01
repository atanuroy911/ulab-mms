import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import { isUlabSessionOrAdminAuthorized } from '@/lib/studentAuth';
import { extractStudentId } from '@/lib/googleAccount';
import { escapeRegExp } from '@/lib/utils';
import Student from '@/models/Student';
import { courseReport } from '@/lib/studentPortal';

// POST student marks by student ID (POST so the admin-password override never lands in a
// URL / server access log the way a query string would). Marks are only released after the
// visitor either signs in with a real @ulab.edu.bd Google account (via the 'google-marks'
// provider, see app/api/auth/[...nextauth]/route.ts - this never creates a User document)
// or a teacher/admin supplies the admin password as an override. Without this, anyone could
// enumerate every student's marks by guessing IDs.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const studentId = typeof body?.studentId === 'string' ? body.studentId.trim() : '';
    const adminPassword = typeof body?.adminPassword === 'string' ? body.adminPassword : undefined;

    if (!studentId) {
      return NextResponse.json(
        { error: 'Student ID is required' },
        { status: 400 }
      );
    }

    if (!(await isUlabSessionOrAdminAuthorized(adminPassword))) {
      return NextResponse.json(
        { error: adminPassword ? 'Invalid admin password' : 'Please sign in with your ULAB Google account to check marks' },
        { status: 401 }
      );
    }

    // isUlabSessionOrAdminAuthorized only proves "some ULAB account (or the admin password)
    // is present" - it never checked that the requested studentId belongs to whoever's
    // signed in, so any signed-in ULAB account (student or teacher) could fetch any other
    // student's marks by simply POSTing a different ID than their own. The admin-password
    // override is exempt (a teacher/admin legitimately looks up arbitrary students); a real
    // user session must match the ID embedded in their own Google display name.
    if (!adminPassword) {
      const session = await getServerSession(authOptions);
      const sessionStudentId = extractStudentId(session?.user?.name);
      if (!sessionStudentId || sessionStudentId.toLowerCase() !== studentId.toLowerCase()) {
        return NextResponse.json(
          { error: 'You can only check your own marks. Please sign in with your own ULAB Google account.' },
          { status: 403 }
        );
      }
    }

    await dbConnect();

    // Find all student records with this student ID across all courses
    const studentRecords = await Student.find({
      studentId: { $regex: new RegExp(`^${escapeRegExp(studentId)}$`, 'i') },
    }).lean();

    if (!studentRecords || studentRecords.length === 0) {
      return NextResponse.json(
        { error: 'Student ID not found in any course' },
        { status: 404 }
      );
    }

    // One report per course (lib/studentPortal.ts, shared with the student portal).
    const coursesData = await Promise.all(studentRecords.map((studentRecord) => courseReport(studentRecord)));

    // Filter out null values
    const validCoursesData = coursesData.filter(data => data !== null);

    if (validCoursesData.length === 0) {
      return NextResponse.json(
        { error: 'No course data found for this student' },
        { status: 404 }
      );
    }

    return NextResponse.json({ 
      studentId,
      studentName: validCoursesData[0]?.student.name,
      courses: validCoursesData 
    }, { status: 200 });

  } catch (error: any) {
    console.error('Get student marks error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
