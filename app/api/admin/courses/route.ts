import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import dbConnect from '@/lib/mongodb';
import AdminCourse from '@/models/AdminCourse';
import { verifyAdminToken } from '@/lib/adminAuth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

// GET admin courses — supports optional ?page, ?limit, ?search for paginated admin UI.
// When called without pagination params (e.g. from the course-creation combobox), returns
// all courses as before to preserve backward compatibility.
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions as any);
    const isAdmin = await verifyAdminToken(request);
    if (!session && !isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const pageParam = searchParams.get('page');
    const limitParam = searchParams.get('limit');
    const search = searchParams.get('search')?.trim() || '';

    // Build query
    const query: Record<string, unknown> = {};
    if (search) {
      query.$or = [
        { courseCode: { $regex: search, $options: 'i' } },
        { courseTitle: { $regex: search, $options: 'i' } },
      ];
    }

    // If no pagination params, return all (backward compat)
    if (!pageParam && !limitParam) {
      const courses = await AdminCourse.find(query).sort({ courseCode: 1 });
      return NextResponse.json({ courses }, { status: 200 });
    }

    const page = Math.max(1, parseInt(pageParam || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(limitParam || '20', 10)));
    const skip = (page - 1) * limit;

    const [courses, total] = await Promise.all([
      AdminCourse.find(query).sort({ courseCode: 1 }).skip(skip).limit(limit),
      AdminCourse.countDocuments(query),
    ]);

    return NextResponse.json({ courses, total, page, limit }, { status: 200 });
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

// DELETE a course, or multiple courses via a JSON body { ids: string[] }
export async function DELETE(request: NextRequest) {
  try {
    if (!(await verifyAdminToken(request))) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    await dbConnect();

    if (id) {
      const course = await AdminCourse.findByIdAndDelete(id);

      if (!course) {
        return NextResponse.json(
          { error: 'Course not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({ message: 'Course deleted successfully' }, { status: 200 });
    }

    // Bulk delete: { ids: string[] } in the JSON body
    const body = await request.json().catch(() => null);
    const ids = Array.isArray(body?.ids) ? body.ids.filter((v: unknown) => typeof v === 'string') : [];

    if (ids.length === 0) {
      return NextResponse.json(
        { error: 'Course ID(s) are required' },
        { status: 400 }
      );
    }

    const result = await AdminCourse.deleteMany({ _id: { $in: ids } });

    return NextResponse.json(
      { message: 'Courses deleted successfully', count: result.deletedCount },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Delete admin course error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
