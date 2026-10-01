import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import dbConnect from '@/lib/mongodb';
import CapstoneSession from '@/models/CapstoneSession';
import CapstoneGroup from '@/models/CapstoneGroup';
import StudentAccount from '@/models/StudentAccount';
import Semester from '@/models/Semester';
import User from '@/models/User';
import { getCapstoneActor, isAdmin, isCoordinatorFor } from '@/lib/capstoneAuth';

export const runtime = 'nodejs';

// GET /api/capstone/sessions/[id]/groups-export
// Every group of a session as a workbook laid out like the department's own group lists
// (e.g. "CSE4098A, CSE4098B, CSE4098C Fall 2026.xlsx"): one sheet per track, the group number
// and supervisor merged down each group, a blank row between groups. Coordinator/admin only.

const cleanName = (n: string) => n.replace(/\s*\(\d{6,}\)\s*$/, '');

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    await dbConnect();
    const session = await CapstoneSession.findById(id);
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (!isAdmin(actor) && !isCoordinatorFor(actor, session.department)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const [groups, semester] = await Promise.all([
      CapstoneGroup.find({ sessionId: id }).sort({ track: 1, groupNumber: 1 }).lean(),
      Semester.findById(session.semesterId).select('name').lean<{ name?: string }>(),
    ]);
    const studentIds = groups.flatMap((g) => g.members.filter((m) => !m.removedAt).map((m) => m.studentAccountId));
    const userIds = groups.flatMap((g) => [g.supervisorId, ...g.evaluators.filter((e) => !e.unassignedAt).map((e) => e.evaluatorId)]).filter(Boolean);
    const [students, users] = await Promise.all([
      StudentAccount.find({ _id: { $in: studentIds } }).select('studentId name email').lean(),
      User.find({ _id: { $in: userIds } }).select('name').lean(),
    ]);
    const studentById = new Map(students.map((s) => [String(s._id), s]));
    const userName = new Map(users.map((u) => [String(u._id), u.name as string]));
    const semesterName = semester?.name || '';

    const wb = new ExcelJS.Workbook();
    wb.creator = 'ULAB MMS';
    const thin = { style: 'thin' as const, color: { argb: 'FF999999' } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const tracks = [...new Set([...session.tracks.map((t) => t.track), ...groups.map((g) => g.track)])].sort();

    for (const track of tracks) {
      const ws = wb.addWorksheet(`${session.department}4098${track}`, { views: [{ state: 'frozen', ySplit: 2 }] });
      ws.columns = [
        { key: 'group', width: 9 },
        { key: 'id', width: 13 },
        { key: 'name', width: 30 },
        { key: 'email', width: 34 },
        { key: 'supervisor', width: 22 },
        { key: 'title', width: 50 },
        { key: 'evaluators', width: 30 },
      ];
      ws.mergeCells(1, 1, 1, 7);
      const title = ws.getCell(1, 1);
      title.value = `${session.department} 4098-${track} (${semesterName})`;
      title.font = { bold: true, size: 14 };
      title.alignment = { horizontal: 'center' };
      const head = ws.getRow(2);
      head.values = ['Group No', 'Student ID', 'Student Name', 'Email', 'Supervisor', 'Project Title', 'Evaluators'];
      head.font = { bold: true };
      head.eachCell((c) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7EEF8' } };
        c.border = border;
        c.alignment = { vertical: 'middle' };
      });

      let row = 3;
      for (const g of groups.filter((x) => x.track === track)) {
        const members = g.members.filter((m) => !m.removedAt);
        if (!members.length) continue;
        const supervisor = (g.supervisorId && userName.get(String(g.supervisorId))) || g.supervisorLabel || '';
        const evaluators = [
          ...g.evaluators.filter((e) => !e.unassignedAt).map((e) => userName.get(String(e.evaluatorId)) || ''),
          ...(g.placeholderEvaluators || []).filter((p) => !p.removedAt).map((p) => p.label),
        ]
          .filter(Boolean)
          .join(', ');
        const first = row;
        for (const m of members) {
          const s = studentById.get(String(m.studentAccountId));
          const r = ws.getRow(row);
          r.getCell(2).value = Number(s?.studentId || m.studentIdText) || s?.studentId || m.studentIdText;
          r.getCell(3).value = cleanName(s?.name || '');
          r.getCell(4).value = s?.email || '';
          for (let c = 1; c <= 7; c++) {
            r.getCell(c).border = border;
            r.getCell(c).alignment = { vertical: 'middle', wrapText: c === 6 || c === 7 };
          }
          r.getCell(2).numFmt = '0';
          row++;
        }
        // Group number, supervisor, title and evaluators belong to the whole group.
        for (const [col, value] of [
          [1, g.groupNumber],
          [5, supervisor],
          [6, g.projectTitle || ''],
          [7, evaluators],
        ] as const) {
          if (row - 1 > first) ws.mergeCells(first, col, row - 1, col);
          const cell = ws.getCell(first, col);
          cell.value = value;
          cell.alignment = { vertical: 'middle', horizontal: col === 1 ? 'center' : 'left', wrapText: true };
        }
        row++; // a blank row between groups, as in the department's lists
      }
    }

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const safe = `${session.department}4098 ${semesterName}`.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${safe}-groups.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('GET /api/capstone/sessions/[id]/groups-export error:', error);
    return NextResponse.json({ error: 'Failed to export the groups' }, { status: 500 });
  }
}
