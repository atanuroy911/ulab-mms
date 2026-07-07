import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Course from '@/models/Course';
import Student from '@/models/Student';
import AttendanceSession from '@/models/AttendanceSession';
import path from 'path';
import { readFile } from 'fs/promises';
import { formatClassRoomDisplay } from '@/app/utils/classInfo';

export const runtime = 'nodejs';

// ... (existing types and helper functions will be kept intact by targeting the bottom part, wait, I need to replace from the top to remove puppeteer imports)

type StudentRow = {
  _id: unknown;
  studentId: string;
  name: string;
  probation?: boolean;
  useAlias?: boolean;
};

type SessionRecord = {
  studentId?: unknown;
  studentIdString?: string;
  status: 'present' | 'absent';
};

type AttendanceSessionRow = {
  _id: unknown;
  date: Date | string;
  records: SessionRecord[];
} | null;

type AttendanceSessionListItem = {
  _id: unknown;
  date: Date | string;
  records: SessionRecord[];
};

type CourseRow = {
  code?: string;
  name?: string;
  semester?: string;
  year?: number;
  section?: string;
  classTime?: string;
  classRoom?: string;
  numberOfStudents?: number;
  classRepresentativeId?: unknown;
  aliasEnabled?: boolean;
  alternateCode?: string;
};

function safeId(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'toString' in value) {
    return String(value);
  }
  return '';
}

async function getLogoDataUri() {
  const logoPath = path.join(process.cwd(), 'app', 'ulab.svg');
  const svg = await readFile(logoPath, 'utf-8');
  const base64 = Buffer.from(svg, 'utf-8').toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}

function getSessionDateInfo(session: AttendanceSessionRow) {
  if (!session?.date) {
    return { day: null as number | null, formatted: '' };
  }
  const dateObj = new Date(session.date);
  return {
    day: dateObj.getDate(),
    formatted: dateObj.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
  };
}

function buildHeaderDates(sessionsInScope: AttendanceSessionListItem[]) {
  // Create an array of 30 days with dates only for actual sessions
  const headerDates: Array<{ day: number; verticalLabel: string }> = [];
  
  // Sort sessions by date to maintain chronological order
  const sortedSessions = [...sessionsInScope].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Add entries for each session in chronological order
  for (let i = 0; i < sortedSessions.length && i < 30; i++) {
    const date = new Date(sortedSessions[i].date);
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = String(date.getFullYear());
    
    headerDates.push({
      day: i + 1,
      verticalLabel: `${dd}/${mm}/${yyyy}`,
    });
  }

  // Pad remaining columns to 30 with empty dates
  while (headerDates.length < 30) {
    headerDates.push({
      day: headerDates.length + 1,
      verticalLabel: '',
    });
  }

  return headerDates;
}

function buildPagesHtml(
  course: CourseRow,
  students: StudentRow[],
  attendanceSession: AttendanceSessionRow,
  sessionsInScope: AttendanceSessionListItem[],
  logoDataUri: string,
  instructorName: string,
  settings?: { classTime?: string; classRoom?: string; numberOfStudents?: string | number; classRepresentativeName?: string },
  minPages = 0
): string {
  const { formatted: sessionDateLabel } = getSessionDateInfo(attendanceSession);
  const headerDates = buildHeaderDates(sessionsInScope);
  const days = headerDates.map((d) => d.day);

  const sessionsByDay = new Map<number, AttendanceSessionListItem[]>();
  sessionsInScope.forEach((session) => {
    const day = new Date(session.date).getDate();
    const existing = sessionsByDay.get(day) || [];
    existing.push(session);
    sessionsByDay.set(day, existing);
  });

  // Sort sessions by date to match headerDates order
  const sortedSessions = [...sessionsInScope].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const ROWS_PER_PAGE = 18;
  // minPages ensures a group still prints its own (blank) sheet instead of
  // silently vanishing when no students are assigned to it yet.
  const totalPages = Math.max(minPages, Math.ceil(students.length / ROWS_PER_PAGE));

  let pagesHtml = '';

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const start = (pageNum - 1) * ROWS_PER_PAGE;
    const end = Math.min(start + ROWS_PER_PAGE, students.length);
    const pageStudents = students.slice(start, end);

    const rows = pageStudents.map((s, idx) => {
      const cells: string[] = [];
      for (let colIdx = 0; colIdx < 30; colIdx++) {
        let content = '';
        // Check if this column has a corresponding session
        if (colIdx < sortedSessions.length) {
          const session = sortedSessions[colIdx];
          const rec = session.records?.find((r) => {
            const recordStudentObjectId = safeId(r.studentId);
            const studentObjectId = safeId(s._id);
            return recordStudentObjectId === studentObjectId || r.studentIdString === s.studentId;
          });
          if (rec?.status === 'present') {
            content = '✓';
          }
        }
        cells.push(`<td class="grid-cell">${content}</td>`);
      }

      const trClass = s.probation ? 'probation' : '';
      const nameCell = s.probation ? `<strong>${escapeHtml(s.name)}</strong>` : escapeHtml(s.name);

      return `
      <tr class="${trClass}">
        <td class="sl-cell">${start + idx + 1}</td>
        <td class="id-cell">${escapeHtml(s.studentId)}</td>
        <td class="name">${nameCell}</td>
        ${cells.join('\n')}
      </tr>
    `;
    }).join('\n');

    const blankRows = ROWS_PER_PAGE - pageStudents.length;
    let blankHtml = '';
    if (blankRows > 0) {
      // use 22px per row for spacing
      blankHtml = `
        <tr class="blank-rows">
          <td colspan="${3 + days.length}" style="height: ${blankRows * 22}px;"></td>
        </tr>
      `;
    }

    pagesHtml += `
      <div class="page">
        <div class="top">
          <img class="logo" src="${logoDataUri}" alt="ULAB logo" />
          <div class="title-wrap"><span class="title">STUDENT ATTENDANCE SHEET</span></div>
        </div>

        <div class="meta">
          <div>
            <div class="line"><span>Course</span><span>:</span><span>${escapeHtml(course.code || '')} ${escapeHtml(course.name || '')}</span></div>
            <div class="line"><span>Semester</span><span>:</span><span>${escapeHtml(course.semester || '')} ${escapeHtml(String(course.year || ''))}</span></div>
            <div class="line"><span>Section</span><span>:</span><span>${escapeHtml(course.section || '')}</span></div>
            <div class="line"><span>Instructor</span><span>:</span><span>${escapeHtml(instructorName)}</span></div>
          </div>
          <div>
            <div class="line right"><span>Class Time</span><span>:</span><span>${escapeHtml(settings?.classTime || course.classTime || '')}</span></div>
            <div class="line right"><span>Class Room</span><span>:</span><span>${escapeHtml(formatClassRoomDisplay(settings?.classRoom || course.classRoom))}</span></div>
            <div class="line right"><span>Number of Students</span><span>:</span><span>${escapeHtml(String(settings?.numberOfStudents ?? course.numberOfStudents ?? students.length))}</span></div>
            <div class="line right"><span>Class Representative</span><span>:</span><span>${escapeHtml(settings?.classRepresentativeName || '')}</span></div>
          </div>
        </div>

        <table class="attendance-table">
          <thead>
            <tr>
              <th rowspan="2" class="sl-head">SL</th>
              <th rowspan="2" class="id-head">StudentID</th>
              <th rowspan="2" class="name-head">Student Name</th>
              <th colspan="30" class="class-date-head">Class Date <span class="arrow">&#8594;</span></th>
            </tr>
            <tr>
              ${headerDates.map((item) => `<th class="day-head"><div class="day-num">${item.day}</div><div class="day-date-vertical">${escapeHtml(item.verticalLabel)}</div></th>`).join('\n')}
            </tr>
          </thead>
          <tbody>
            ${rows}
            ${blankHtml}
          </tbody>
        </table>
        <div class="probation-note">* students in probation.</div>

        <div class="footer">
          <div>${escapeHtml(sessionDateLabel)}</div>
          <div>Page ${pageNum} of ${totalPages}</div>
        </div>
      </div>
    `;
  }

  return pagesHtml;
}

function buildAttendanceHtml(
  course: CourseRow,
  students: StudentRow[],
  attendanceSession: AttendanceSessionRow,
  sessionsInScope: AttendanceSessionListItem[],
  logoDataUri: string,
  instructorName: string,
  settings?: { classTime?: string; classRoom?: string; numberOfStudents?: string | number; classRepresentativeName?: string },
  group?: 'main' | 'alias' | null
) {
  const useSplit = Boolean(course.aliasEnabled && course.alternateCode?.trim());

  let pagesHtml: string;
  if (useSplit && group === 'alias') {
    // Only the alias-code document.
    pagesHtml = buildPagesHtml({ ...course, code: course.alternateCode }, students.filter((s) => s.useAlias), attendanceSession, sessionsInScope, logoDataUri, instructorName, settings, 1);
  } else if (useSplit) {
    // Only the original-code document (also the default when a split course's
    // print is requested with no explicit group, e.g. a direct URL hit).
    pagesHtml = buildPagesHtml(course, students.filter((s) => !s.useAlias), attendanceSession, sessionsInScope, logoDataUri, instructorName, settings, 1);
  } else {
    pagesHtml = buildPagesHtml(course, students, attendanceSession, sessionsInScope, logoDataUri, instructorName, settings);
  }

  return `
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>Attendance Sheet</title>
    <style>
      @page {
        size: A4 landscape;
        margin: 8mm 10mm;
      }

      html, body {
        margin: 0;
        padding: 0;
        font-family: Arial, Helvetica, sans-serif;
        color: #000;
      }

      .page {
        page-break-after: always;
        width: 100%;
      }

      .page:last-child {
        page-break-after: avoid;
      }

      .sheet {
        width: 100%;
      }

      .top {
        display: grid;
        grid-template-columns: 220px 1fr;
        align-items: start;
        gap: 8px;
      }

      .logo {
        width: 210px;
        height: auto;
        display: block;
      }

      .title-wrap {
        text-align: center;
      }

      .title {
        display: inline-block;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.2px;
        background: #cfcfcf;
        padding: 2px 8px;
      }

      .meta {
        margin-top: 8px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        column-gap: 40px;
        font-size: 12px;
        line-height: 1.3;
        font-weight: 700;
      }

      .line {
        display: grid;
        grid-template-columns: 150px 20px 1fr;
      }

      .line.right {
        grid-template-columns: 190px 20px 1fr;
      }

      .attendance-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        margin-top: 6px;
        font-size: 12px;
      }

      .attendance-table th,
      .attendance-table td {
        border: 1.6px solid #111;
        padding: 0;
      }

      .sl-head,
      .sl-cell {
        width: 38px;
        text-align: center;
        font-weight: 700;
        font-size: 12px;
        padding: 2px 4px;
      }

      .id-head,
      .id-cell {
        width: 110px;
        text-align: center;
        font-weight: 700;
        font-size: 12px;
        padding: 2px 4px;
      }

      .name-head,
      .name {
        width: 300px;
        padding: 2px 8px;
        font-weight: 700;
        font-size: 12px;
      }

      .name {
        font-weight: 500;
      }

      .class-date-head {
        text-align: center;
        font-style: italic;
        font-weight: 500;
        font-size: 12px;
        position: relative;
      }

      .class-date-head .arrow {
        position: absolute;
        right: 10px;
      }

      .day-head {
        width: 18px;
        text-align: center;
        font-size: 10px;
        font-weight: 700;
        height: 72px;
        vertical-align: bottom;
        position: relative;
      }

      .day-num {
        font-size: 10px;
        font-weight: 700;
        line-height: 1;
      }

      .day-date-vertical {
        writing-mode: vertical-rl;
        text-orientation: mixed;
        transform: rotate(180deg);
        font-size: 9px;
        line-height: 1;
        margin: 2px auto 0;
        opacity: 0.9;
      }

      .grid-cell {
        width: 18px;
        height: 22px;
        text-align: center;
        vertical-align: middle;
        font-size: 12px;
        font-weight: 700;
      }

      .student-row td {
        height: 22px;
        padding: 2px 4px;
      }

      .blank-rows td {
        height: auto;
      }

      .probation-note {
        margin-top: 6px;
        font-size: 12px;
      }

      .footer {
        display: flex;
        justify-content: space-between;
        margin-top: 6px;
        font-size: 12px;
        font-style: italic;
      }

      tr.probation .name strong {
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    ${pagesHtml}
    <script>
      window.onload = function() {
        setTimeout(function() {
          window.print();
        }, 500);
      };
    </script>
  </body>
  </html>
  `;
}

function escapeHtml(input: unknown) {
  if (input == null) return '';
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: courseId } = await params;
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');
    const groupParam = url.searchParams.get('group');
    const group = groupParam === 'alias' ? 'alias' : groupParam === 'main' ? 'main' : null;

    await dbConnect();

    const course = await Course.findOne({ _id: courseId, userId: session.user.id }).lean<CourseRow>();
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

    const students = await Student.find({ courseId }).sort({ studentId: 1 }).lean<StudentRow[]>();

    let attendanceSession: AttendanceSessionRow = null;
    if (sessionId) {
      attendanceSession = await AttendanceSession.findOne({ _id: sessionId, courseId }).lean<AttendanceSessionRow>();
    } else {
      attendanceSession = await AttendanceSession.findOne({ courseId }).sort({ date: -1 }).lean<AttendanceSessionRow>();
    }

    // Show every session for the course on one continuous sheet (capped at 30
    // date-columns below), rather than only the calendar month of one session.
    const sessionsInScope = await AttendanceSession.find({ courseId })
      .sort({ date: 1 })
      .lean<AttendanceSessionListItem[]>();

    const logoDataUri = await getLogoDataUri();

    const classTime = url.searchParams.get('classTime') || course.classTime || undefined;
    const classRoom = url.searchParams.get('classRoom') || course.classRoom || undefined;
    const numberOfStudents = url.searchParams.get('numberOfStudents') || (course.numberOfStudents != null ? String(course.numberOfStudents) : undefined);
    const classRepresentativeId = url.searchParams.get('classRepresentativeId') || (course.classRepresentativeId ? String(course.classRepresentativeId) : undefined);

    let classRepresentativeName: string | undefined = undefined;
    if (classRepresentativeId) {
      try {
        const rep = await Student.findOne({ _id: classRepresentativeId, courseId }).lean<{ name?: string }>();
        classRepresentativeName = rep?.name;
      } catch {
        classRepresentativeName = undefined;
      }
    }

    const html = buildAttendanceHtml(
      course,
      students,
      attendanceSession,
      sessionsInScope,
      logoDataUri,
      session.user.name || '',
      {
        classTime,
        classRoom,
        numberOfStudents,
        classRepresentativeName,
      },
      group
    );

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('attendance-pdf error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}
