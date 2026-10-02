import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import GradeChange from '@/models/GradeChange';
import User from '@/models/User';
import { getLogoDataUri } from '@/lib/capstonePrint';
import { courseDepartment, currentGrades, gradeChangeFormsHtml, ownCourse, pendingChanges, type GradeChangeFormData } from '@/lib/gradeChange';

export const runtime = 'nodejs';

// GET /api/courses/[id]/grade-change-form?students=<record ids>[&head=..][&program=..]
//     /api/courses/[id]/grade-change-form?changes=<GradeChange ids>  (forms already sent, reprinted)
// The Controller of Examinations' Grade Change Form (EC002), one page per student, ready to
// print or save as PDF. The department's own head name and program always win; `head` and
// `program` only fill them in when the department has none set.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    await dbConnect();
    const course = await ownCourse(id, String(session.user.id));
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    if (course.status !== 'finished' && !request.nextUrl.searchParams.get('changes')) {
      return NextResponse.json({ error: 'Grade change forms are for finished courses' }, { status: 409 });
    }

    const sp = request.nextUrl.searchParams;
    const list = (k: string) => (sp.get(k) || '').split(',').map((x) => x.trim()).filter(Boolean);
    const [department, owner, logo] = await Promise.all([
      courseDepartment(course),
      User.findById(course.userId).select('name').lean<{ name?: string }>(),
      getLogoDataUri(),
    ]);
    const common = {
      program: department?.program || (sp.get('program') || '').trim().slice(0, 200),
      headName: department?.headName || (sp.get('head') || '').trim().slice(0, 200),
      teacherName: owner?.name || '',
      term: `${course.semester} ${course.year}`,
      courseCode: course.code,
      courseTitle: course.name,
      section: course.section,
    };

    let forms: GradeChangeFormData[];
    if (sp.get('changes')) {
      const ids = list('changes').filter((x) => /^[a-f\d]{24}$/i.test(x));
      const sent = await GradeChange.find({ _id: { $in: ids }, courseId: course._id, sentAt: { $ne: null } }).sort({ studentId: 1 }).lean();
      forms = sent.map((c) => ({ ...common, studentId: c.studentId, studentName: c.studentName, oldGrade: c.oldGrade, newGrade: c.newGrade, reason: c.reason }));
    } else {
      const wanted = new Set(list('students'));
      const [changes, drafts] = await Promise.all([
        currentGrades(course).then((now) => pendingChanges(course, now)),
        GradeChange.find({ courseId: course._id, sentAt: null }).select('studentRecordId reason').lean(),
      ]);
      const reasonOf = new Map(drafts.map((d) => [String(d.studentRecordId), d.reason]));
      forms = changes
        .filter((c) => wanted.size === 0 || wanted.has(c.studentRecordId))
        .map((c) => ({ ...common, studentId: c.studentId, studentName: c.name, oldGrade: c.oldGrade, newGrade: c.newGrade, reason: reasonOf.get(c.studentRecordId) || '' }));
    }
    if (forms.length === 0) return NextResponse.json({ error: 'No grade changes to print. Refresh to see the latest.' }, { status: 404 });

    const title = `Grade Change Form - ${course.code} ${course.section}${forms.length === 1 ? ` - ${forms[0].studentId}` : ` (${forms.length} students)`}`;
    return new NextResponse(gradeChangeFormsHtml(forms, logo, title), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('GET /api/courses/[id]/grade-change-form error:', error);
    return NextResponse.json({ error: 'Failed to build the grade change form' }, { status: 500 });
  }
}
