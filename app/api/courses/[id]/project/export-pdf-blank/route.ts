import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import ProjectGroup from '@/models/ProjectGroup';
import Course from '@/models/Course';
import Student from '@/models/Student';
import Exam from '@/models/Exam';
import RubricTemplate from '@/models/RubricTemplate';

export async function GET(
  _req: NextRequest,
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

    const projectGroup = await ProjectGroup.findOne({ courseId: id });
    const projectExams = await Exam.find({ courseId: id, examCategory: 'Project' });

    const templateIds = [...new Set(projectExams.map((e: any) => e.rubricTemplateId?.toString()).filter(Boolean))];
    const templates = await RubricTemplate.find({ _id: { $in: templateIds } });
    const templatesById = new Map(templates.map((t: any) => [t._id.toString(), t]));

    const groups = projectGroup?.groups || [];

    const allStudentIds = groups.flatMap((g: any) => g.studentIds);
    const studentDocs = await Student.find({ _id: { $in: allStudentIds } }).select('name studentId _id');
    const studentMap = new Map(studentDocs.map((s: any) => [s._id.toString(), s]));

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Blank Rubrics — ${course.code} ${course.name}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 24px; }
  .page-break { page-break-after: always; }
  h1 { font-size: 18px; font-weight: bold; margin-bottom: 4px; border-bottom: 2px solid #111; padding-bottom: 8px; }
  h2 { font-size: 14px; font-weight: bold; margin-bottom: 8px; margin-top: 16px;}
  .subtitle { font-size: 12px; color: #555; margin-bottom: 20px; }
  .group-info { margin-bottom: 20px; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; }
  .members-list { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px; }
  .student-chip { display: inline-block; background: #fff; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 8px; font-size: 12px; font-weight: bold; }
  
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; font-weight: bold; font-size: 11px; }
  
  .score-col { width: 18%; text-align: center; }
  .score-col strong { display: block; font-size: 14px; margin-bottom: 4px; }
  .score-desc { font-size: 10px; color: #555; }
  
  .reasoning-box { height: 120px; border: 1px solid #cbd5e1; padding: 8px; margin-bottom: 20px; border-radius: 4px; }
  .reasoning-box .title { font-weight: bold; margin-bottom: 8px; color: #555; }
  
  .final-score { display: flex; justify-content: flex-end; align-items: center; margin-top: 16px; }
  .final-score-box { border: 2px solid #111; padding: 8px 16px; font-size: 16px; font-weight: bold; min-width: 150px; text-align: center; border-radius: 4px; }
</style>
</head>
<body>

${groups.length === 0 ? '<p>No groups created yet.</p>' : groups.map((group: any, index: number) => {
  const members = group.studentIds.map((sid: any) => {
    const s = studentMap.get(sid.toString());
    return s ? `<span class="student-chip">${s.name} (${s.studentId})</span>` : '';
  }).join('');
  
  return `
  <div class="${index < groups.length - 1 ? 'page-break' : ''}">
    <h1>${course.code} — ${course.name}</h1>
    <div class="subtitle">Project Grading Sheet • Semester: ${course.semester} ${course.year}</div>
    
    <div class="group-info">
      <div style="font-size: 16px; font-weight: bold; margin-bottom: 4px;">Group ${group.groupNumber}</div>
      <div style="font-size: 14px; color: #333;">Project Title: <strong>${group.projectTitle || '__________________________________________________'}</strong></div>
      <div class="members-list">${members || '<span style="color:#aaa;font-style:italic">No members assigned</span>'}</div>
    </div>
    
    ${projectExams.map((exam: any) => {
      const template = exam.rubricTemplateId ? templatesById.get(exam.rubricTemplateId.toString()) : null;
      const criteria = template?.criteria || [];

      return `
      <h2>${exam.displayName} (Total Marks: ${exam.totalMarks})${template ? ` — ${template.name}` : ' — Direct Mark'}</h2>
      ${template ? `
      <table>
        <thead>
          <tr>
            <th style="width: 28%">Criteria</th>
            <th class="score-col">0</th>
            <th class="score-col">1</th>
            <th class="score-col">2</th>
            <th class="score-col">3</th>
          </tr>
        </thead>
        <tbody>
          ${criteria.map((c: any) => `
            <tr>
              <td>
                <strong>${c.key.toUpperCase()}: ${c.label}</strong><br/>
                <span style="font-size: 9px; color: #888;">${c.co || ''}</span>
              </td>
              <td class="score-col"><span class="score-desc">${c.descriptions[0]}</span></td>
              <td class="score-col"><span class="score-desc">${c.descriptions[1]}</span></td>
              <td class="score-col"><span class="score-desc">${c.descriptions[2]}</span></td>
              <td class="score-col"><span class="score-desc">${c.descriptions[3]}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ` : ''}

      <div class="reasoning-box">
        <div class="title">Reasoning / Comments:</div>
      </div>

      <div class="final-score">
        <div class="final-score-box">
          Final Score: &nbsp; &nbsp; &nbsp; &nbsp; / ${exam.totalMarks}
        </div>
      </div>
    `;
    }).join('<div style="margin-top: 40px; border-top: 2px dashed #ccc; padding-top: 40px;"></div>')}
  </div>
  `;
}).join('')}

<script>window.print();</script>
</body>
</html>`;

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (error: any) {
    console.error('Export Blank PDF Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
