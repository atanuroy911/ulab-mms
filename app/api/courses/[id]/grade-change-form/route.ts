import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import GradeChange from '@/models/GradeChange';
import { getLogoDataUri } from '@/lib/capstonePrint';
import {
  cleanDetails,
  cleanRows,
  currentGrades,
  formDefaults,
  gradeChangeFormsHtml,
  ownCourse,
  pendingChanges,
  type GradeChangeFormData,
} from '@/lib/gradeChange';

export const runtime = 'nodejs';

// The Controller of Examinations' Grade Change Form (EC002), one page per student, ready to
// print or save as PDF.
//
// GET ?students=<record ids>[&head=..][&program=..]  the automatic changes waiting for a form.
//     The department's head name and program win; head/program only fill in missing ones.
// GET ?changes=<GradeChange ids>                     changes already sent, exactly as printed.
// POST payload={details, rows}  (a form post)        the manual form, exactly as filled in.
//     Printing records nothing - recording is POST /grade-status { action: 'record' }.

async function load(params: Promise<{ id: string }>) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { id } = await params;
  await dbConnect();
  const course = await ownCourse(id, String(session.user.id));
  if (!course) return { error: NextResponse.json({ error: 'Course not found' }, { status: 404 }) };
  return { course };
}

function html(forms: GradeChangeFormData[], logo: string, code: string, section: string) {
  const title = `Grade Change Form - ${code} ${section}${forms.length === 1 ? ` - ${forms[0].studentId}` : ` (${forms.length} students)`}`;
  return new NextResponse(gradeChangeFormsHtml(forms, logo, title), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const loaded = await load(params);
    if ('error' in loaded) return loaded.error;
    const { course } = loaded;
    const sp = request.nextUrl.searchParams;
    const list = (k: string) => (sp.get(k) || '').split(',').map((x) => x.trim()).filter(Boolean);
    const [defaults, logo] = await Promise.all([formDefaults(course), getLogoDataUri()]);

    let forms: GradeChangeFormData[];
    if (sp.get('changes')) {
      const ids = list('changes').filter((x) => /^[a-f\d]{24}$/i.test(x));
      const sent = await GradeChange.find({ _id: { $in: ids }, courseId: course._id, sentAt: { $ne: null } }).sort({ studentId: 1 }).lean();
      forms = sent.map((c) => ({
        ...defaults,
        ...(c.details || {}),
        studentId: c.studentId,
        studentName: c.studentName,
        oldGrade: c.oldGrade,
        newGrade: c.newGrade,
        reason: c.reason,
      }));
    } else {
      if (course.status !== 'finished') return NextResponse.json({ error: 'Automatic grade change forms are for finished courses' }, { status: 409 });
      const details = cleanDetails({ headName: defaults.headName || sp.get('head'), program: defaults.program || sp.get('program') }, defaults);
      const wanted = new Set(list('students'));
      const [changes, drafts] = await Promise.all([
        currentGrades(course).then((now) => pendingChanges(course, now)),
        GradeChange.find({ courseId: course._id, sentAt: null }).select('studentRecordId reason').lean(),
      ]);
      const reasonOf = new Map(drafts.map((d) => [String(d.studentRecordId), d.reason]));
      forms = changes
        .filter((c) => wanted.size === 0 || wanted.has(c.studentRecordId))
        .map((c) => ({ ...details, studentId: c.studentId, studentName: c.name, oldGrade: c.oldGrade, newGrade: c.newGrade, reason: reasonOf.get(c.studentRecordId) || '' }));
    }
    if (forms.length === 0) return NextResponse.json({ error: 'No grade changes to print. Refresh to see the latest.' }, { status: 404 });
    return html(forms, logo, course.code, course.section);
  } catch (error) {
    console.error('GET /api/courses/[id]/grade-change-form error:', error);
    return NextResponse.json({ error: 'Failed to build the grade change form' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const loaded = await load(params);
    if ('error' in loaded) return loaded.error;
    const { course } = loaded;
    // Sent as a regular form post (so it opens in a new tab), carrying JSON in `payload`.
    const form = await request.formData().catch(() => null);
    let data: { details?: unknown; rows?: unknown } = {};
    try {
      data = JSON.parse(String(form?.get('payload') || '{}'));
    } catch {
      return NextResponse.json({ error: 'Invalid form' }, { status: 400 });
    }
    const cleaned = cleanRows(data.rows);
    if ('error' in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 400 });
    const [defaults, logo] = await Promise.all([formDefaults(course), getLogoDataUri()]);
    const details = cleanDetails(data.details, defaults);
    return html(
      cleaned.rows.map((r) => ({ ...details, studentId: r.studentId, studentName: r.studentName, oldGrade: r.oldGrade, newGrade: r.newGrade, reason: r.reason })),
      logo,
      details.courseCode,
      details.section
    );
  } catch (error) {
    console.error('POST /api/courses/[id]/grade-change-form error:', error);
    return NextResponse.json({ error: 'Failed to build the grade change form' }, { status: 500 });
  }
}
