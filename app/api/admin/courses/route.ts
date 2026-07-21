import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import dbConnect from '@/lib/mongodb';
import AdminCourse from '@/models/AdminCourse';
import { verifyAdminToken } from '@/lib/adminAuth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

// GET all admin courses - readable by any signed-in teacher (used by the course-creation
// combobox) as well as the admin dashboard's catalog manager.
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions as any);
    const isAdmin = await verifyAdminToken(request);
    if (!session && !isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const courses = await AdminCourse.find({}).sort({ courseCode: 1 });

    return NextResponse.json({ courses }, { status: 200 });
  } catch (error: any) {
    console.error('Get admin courses error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST create a new admin course
export async function POST(request: NextRequest) {
  try {
    if (!(await verifyAdminToken(request))) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const { courseCode, courseTitle, creditHour, prerequisite, content, unescoCode, majors } = await request.json();

    // Validation
    if (!courseCode || !courseTitle || creditHour === undefined || creditHour === null) {
      return NextResponse.json(
        { error: 'Course code, title, and credit hour are required' },
        { status: 400 }
      );
    }

    if (creditHour < 0 || creditHour > 10) {
      return NextResponse.json(
        { error: 'Credit hour must be between 0 and 10' },
        { status: 400 }
      );
    }

    await dbConnect();

    // Check if course code already exists
    const existingCourse = await AdminCourse.findOne({ courseCode: courseCode.trim() });
    if (existingCourse) {
      return NextResponse.json(
        { error: 'Course code already exists', courseExists: true },
        { status: 409 }
      );
    }

    const course = await AdminCourse.create({
      courseCode: courseCode.trim(),
      courseTitle: courseTitle.trim(),
      creditHour: Number(creditHour),
      prerequisite: prerequisite?.trim() || 'N/A',
      content: content?.trim() || '',
      unescoCode: unescoCode?.trim() || '',
      majors: Array.isArray(majors) ? majors : [],
    });

    return NextResponse.json({ course }, { status: 201 });
  } catch (error: any) {
    console.error('Create admin course error:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return NextResponse.json(
        { error: 'Course code already exists', courseExists: true },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT update an existing admin course
export async function PUT(request: NextRequest) {
  try {
    if (!(await verifyAdminToken(request))) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const { _id, courseCode, courseTitle, creditHour, prerequisite, content, unescoCode, majors } = await request.json();

    if (!_id) {
      return NextResponse.json(
        { error: 'Course ID is required' },
        { status: 400 }
      );
    }

    // Validation
    if (!courseCode || !courseTitle || creditHour === undefined || creditHour === null) {
      return NextResponse.json(
        { error: 'Course code, title, and credit hour are required' },
        { status: 400 }
      );
    }

    if (creditHour < 0 || creditHour > 10) {
      return NextResponse.json(
        { error: 'Credit hour must be between 0 and 10' },
        { status: 400 }
      );
    }

    await dbConnect();

    // Check if trying to change course code to an existing one
    const existingCourse = await AdminCourse.findOne({ 
      courseCode: courseCode.trim(),
      _id: { $ne: _id }
    });
    
    if (existingCourse) {
      return NextResponse.json(
        { error: 'Course code already exists', courseExists: true },
        { status: 409 }
      );
    }

    const course = await AdminCourse.findByIdAndUpdate(
      _id,
      {
        courseCode: courseCode.trim(),
        courseTitle: courseTitle.trim(),
        creditHour: Number(creditHour),
        prerequisite: prerequisite?.trim() || 'N/A',
        content: content?.trim() || '',
        unescoCode: unescoCode?.trim() || '',
        majors: Array.isArray(majors) ? majors : [],
      },
      { new: true, runValidators: true }
    );

    if (!course) {
      return NextResponse.json(
        { error: 'Course not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ course }, { status: 200 });
  } catch (error: any) {
    console.error('Update admin course error:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return NextResponse.json(
        { error: 'Course code already exists', courseExists: true },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE a course
export async function DELETE(request: NextRequest) {
  try {
    if (!(await verifyAdminToken(request))) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Course ID is required' },
        { status: 400 }
      );
    }

    await dbConnect();

    const course = await AdminCourse.findByIdAndDelete(id);

    if (!course) {
      return NextResponse.json(
        { error: 'Course not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: 'Course deleted successfully' }, { status: 200 });
  } catch (error: any) {
    console.error('Delete admin course error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
