import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import ProjectGroup from '@/models/ProjectGroup';
import Course from '@/models/Course';
import Student from '@/models/Student';
import Exam from '@/models/Exam';
import RubricTemplate from '@/models/RubricTemplate';
import { calculateProjectMark } from '@/app/utils/projectRubric';

export async function GET(
  req: NextRequest,
  { params }: { params: any }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const course = await Course.findOne({ _id: id, userId: session.user.id });
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    const rubricFilter = req.nextUrl.searchParams.get('rubric'); // e.g. 'presentation' - filters to exams using this rubric slug

    const projectGroup = await ProjectGroup.findOne({ courseId: id });
    let projectExams = await Exam.find({ courseId: id, examCategory: 'Project' });

    // Batch-fetch every rubric template referenced by this course's Project exams
    const templateIds = [...new Set(projectExams.map((e: any) => e.rubricTemplateId?.toString()).filter(Boolean))];
    const templates = await RubricTemplate.find({ _id: { $in: templateIds } });
    const templatesById = new Map(templates.map((t: any) => [t._id.toString(), t]));

    if (rubricFilter) {
      projectExams = projectExams.filter((e: any) => {
        const t = e.rubricTemplateId ? templatesById.get(e.rubricTemplateId.toString()) : null;
        return t?.slug === rubricFilter;
      });
    }

    const groups = projectGroup?.groups || [];

    const allStudentIds = groups.flatMap((g: any) => g.studentIds);
    const studentDocs = await Student.find({ _id: { $in: allStudentIds } }).select('name studentId _id');
    const studentMap = new Map(studentDocs.map((s: any) => [s._id.toString(), s]));

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Project Groups — ${course.code} ${course.name}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 24px; }
  h1 { font-size: 16px; font-weight: bold; margin-bottom: 4px; }
  .subtitle { font-size: 11px; color: #555; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1e293b; color: #fff; text-align: left; padding: 8px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
  td { border-bottom: 1px solid #e2e8f0; padding: 8px 10px; vertical-align: top; }
  tr:nth-child(even) td { background: #f8fafc; }
  .group-num { font-weight: bold; font-size: 13px; text-align: center; }
  .student-chip { display: inline-block; background: #ede9fe; color: #4c1d95; border-radius: 4px; padding: 2px 6px; margin: 1px 2px 2px 0; font-size: 10px; }
  .score-cell { text-align: center; font-weight: bold; }
  .score-0 { color: #dc2626; }
  .score-1 { color: #d97706; }
  .score-2 { color: #2563eb; }
  .score-3 { color: #16a34a; }
  .mark-box { border: 1px solid #cbd5e1; border-radius: 4px; min-height: 28px; width: 80px; }
  .footer { margin-top: 20px; font-size: 10px; color: #888; border-top: 1px solid #e2e8f0; padding-top: 10px; }
  @media print { @page { margin: 1cm; } }
</style>
</head>
<body>
<h1>${course.code} — ${course.name}</h1>
<div class="subtitle">
  ${course.semester} ${course.year} &nbsp;•&nbsp; Project Groups &nbsp;•&nbsp;
  Max per group: ${projectGroup?.maxMembersPerGroup ?? '—'} &nbsp;•&nbsp;
  Generated: ${new Date().toLocaleString()}
</div>

${projectExams.length === 0 ? '<p>No project exams found.</p>' : projectExams.map((exam: any) => {
  const template = exam.rubricTemplateId ? templatesById.get(exam.rubricTemplateId.toString()) : null;
  const criteria = template?.criteria || [];

  return `
<h2 style="margin-top: 24px; margin-bottom: 8px; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 4px;">
  ${exam.displayName} <span style="font-weight: normal; color: #666; font-size: 11px; margin-left: 8px;">(Total Marks: ${exam.totalMarks})${template ? ` · ${template.name}` : ' · Direct mark (no rubric)'}</span>
</h2>
<table>
  <thead>
    <tr>
      <th style="width:45px">Grp</th>
      <th style="width:150px">Project Title</th>
      <th>Members</th>
      ${template
        ? criteria.map((c: any) => `<th style="width:48px;text-align:center" title="${c.label}">${c.label.split(' ').slice(0, 2).join(' ')}</th>`).join('')
        : ''
      }
      <th style="width:65px;text-align:center">Calc.</th>
      <th style="width:85px;text-align:center">Manual</th>
    </tr>
  </thead>
  <tbody>
    ${groups.length === 0
      ? `<tr><td colspan="10" style="text-align:center;color:#888;padding:24px">No groups created yet.</td></tr>`
      : groups.map((group: any) => {
          const members = group.studentIds.map((sid: any) => {
            const s = studentMap.get(sid.toString());
            return s ? `<span class="student-chip">${s.name} (${s.studentId})</span>` : '';
          }).join('');
          const examEntry = group.examRubricScores?.find((e: any) => e.examId?.toString() === exam?._id?.toString());

          if (!template) {
            const directMark = examEntry?.directMark;
            return `<tr>
              <td class="group-num">${group.groupNumber}</td>
              <td>${group.projectTitle || '<span style="color:#aaa;font-style:italic">—</span>'}</td>
              <td>${members || '<span style="color:#aaa;font-style:italic">No members</span>'}</td>
              <td class="score-cell">${directMark !== undefined && directMark !== null ? directMark : '<span style="color:#aaa">—</span>'}</td>
              <td><div class="mark-box"></div></td>
            </tr>`;
          }

          const rs = examEntry?.scores || { c1: 0, c2: 0, c3: 0, c4: 0, c5: 0 };
          const calcMark = calculateProjectMark(rs, exam.totalMarks);
          return `<tr>
            <td class="group-num">${group.groupNumber}</td>
            <td>${group.projectTitle || '<span style="color:#aaa;font-style:italic">—</span>'}</td>
            <td>${members || '<span style="color:#aaa;font-style:italic">No members</span>'}</td>
            ${(['c1','c2','c3','c4','c5'] as const).map(k => `<td class="score-cell score-${rs[k]}">${rs[k]}/3</td>`).join('')}
            <td class="score-cell">${calcMark > 0 ? calcMark : '<span style="color:#aaa">—</span>'}</td>
            <td><div class="mark-box"></div></td>
          </tr>`;
        }).join('')
    }
  </tbody>
</table>
`;
}).join('')}

<div class="footer">
  <strong>Scores:</strong> 0 = No/Wrong &nbsp;|&nbsp; 1 = Poor &nbsp;|&nbsp; 2 = Developing &nbsp;|&nbsp; 3 = Accomplished &nbsp;|&nbsp;
  <strong>Formula:</strong> Σ (score/3) × (Exam Marks/5) per criterion
</div>
<script>window.print();</script>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error: any) {
    console.error('GET /project/export-pdf error:', error);
    return NextResponse.json({ error: error.message || 'Export failed' }, { status: 500 });
  }
}
