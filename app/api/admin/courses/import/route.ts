import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AdminCourse from '@/models/AdminCourse';
import { verifyAdminToken } from '@/lib/adminAuth';

interface CourseImport {
  courseCode: string;
  courseTitle: string;
  creditHour: number;
  prerequisite?: string;
  content?: string;
}

interface ImportResult {
  updated: number;
  created: number;
  errors: Array<{ row: number; error: string; data: any }>;
  details: {
    updated: Array<{ courseCode: string; courseTitle: string }>;
    created: Array<{ courseCode: string; courseTitle: string }>;
  };
}

// POST bulk import courses
export async function POST(request: NextRequest) {
  try {
    if (!(await verifyAdminToken(request))) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const { courses, mode } = await request.json();

    if (!courses || !Array.isArray(courses)) {
      return NextResponse.json(
        { error: 'Courses array is required' },
        { status: 400 }
      );
    }

    if (!mode || !['replace', 'update'].includes(mode)) {
      return NextResponse.json(
        { error: 'Import mode must be "replace" or "update"' },
        { status: 400 }
      );
    }

    await dbConnect();

    const result: ImportResult = {
      updated: 0,
      created: 0,
      errors: [],
      details: {
        updated: [],
        created: [],
      },
    };

    // Process each course
    for (let i = 0; i < courses.length; i++) {
      const courseData: CourseImport = courses[i];
      const rowNumber = i + 2; // +2 because row 1 is header, and array is 0-indexed

      try {
        // Validate required fields
        if (!courseData.courseCode || !courseData.courseTitle || 
            courseData.creditHour === undefined || courseData.creditHour === null) {
          result.errors.push({
            row: rowNumber,
            error: 'Missing required fields (courseCode, courseTitle, or creditHour)',
            data: courseData,
          });
          continue;
        }

        // Validate credit hour
        const creditHour = Number(courseData.creditHour);
        if (isNaN(creditHour) || creditHour < 0 || creditHour > 10) {
          result.errors.push({
            row: rowNumber,
            error: 'Credit hour must be a number between 0 and 10',
            data: courseData,
          });
          continue;
        }

        const courseCode = courseData.courseCode.trim();
        const courseTitle = courseData.courseTitle.trim();

        // Check if course exists
        const existingCourse = await AdminCourse.findOne({ courseCode });

        if (existingCourse) {
          if (mode === 'update' || mode === 'replace') {
            // Update existing course
            await AdminCourse.findOneAndUpdate(
              { courseCode },
              {
                courseTitle,
                creditHour,
                prerequisite: courseData.prerequisite?.trim() || 'N/A',
                content: courseData.content?.trim() || '',
              },
              { new: true, runValidators: true }
            );
            result.updated++;
            result.details.updated.push({ courseCode, courseTitle });
          }
        } else {
          // Create new course
          await AdminCourse.create({
            courseCode,
            courseTitle,
            creditHour,
            prerequisite: courseData.prerequisite?.trim() || 'N/A',
            content: courseData.content?.trim() || '',
          });
          result.created++;
          result.details.created.push({ courseCode, courseTitle });
        }
      } catch (error: any) {
        result.errors.push({
          row: rowNumber,
          error: error.message || 'Unknown error',
          data: courseData,
        });
      }
    }

    return NextResponse.json({ result }, { status: 200 });
  } catch (error: any) {
    console.error('Bulk import error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET export all courses as JSON
export async function GET(request: NextRequest) {
  try {
    if (!(await verifyAdminToken(request))) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    await dbConnect();

    const courses = await AdminCourse.find({}).sort({ courseCode: 1 }).lean();

    // Transform for export
    const exportData = courses.map(course => ({
      courseCode: course.courseCode,
      courseTitle: course.courseTitle,
      creditHour: course.creditHour,
      prerequisite: course.prerequisite || 'N/A',
      content: course.content || '',
    }));

    return NextResponse.json({ courses: exportData }, { status: 200 });
  } catch (error: any) {
    console.error('Export courses error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
