import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import dbConnect from '@/lib/mongodb';
import CapstoneSession from '@/models/CapstoneSession';
import Semester from '@/models/Semester';
import { getCapstoneActor, isAdmin, isCoordinatorFor } from '@/lib/capstoneAuth';
import { computeSessionGrades } from '@/lib/capstoneGrades';
import type { MemberGrade } from '@/lib/capstoneGrades';

/**
 * GET /api/capstone/sessions/[id]/grades-export
 *
 * The full gradebook as a .xlsx, shaped like the department's existing workbooks: a roster
 * sheet with one row per student and the computed component columns, a detail sheet with
 * every individual submission, and a summary of which scheme each track graded under.
 *
 * Coordinator/admin only. Unlike the JSON grades endpoint there is no per-supervisor view
 * here - a whole-cohort spreadsheet is inherently a coordinator artefact.
 */

const COMPONENT_LABELS: Record<string, string> = {
  report: 'Report',
  presentation: 'Presentation',
  peer: 'Peer',
  weeklyJournal: 'Weekly Journal',
  poster: 'Poster',
};

/**
 * The per-component numbers for one student's gradebook row.
 *
 * Which nodes count as "components" is decided structurally by componentNodeIds() on the
 * scheme graph, not by guessing from node labels - so the export adapts to whatever graph
 * the coordinator built, and intermediate values (the raw 0-1 rubric fractions feeding a
 * 60/40 blend) never appear as if they were marks.
 */
function componentColumns(member: MemberGrade, nodeIds: string[]): Record<string, number> {
  const wanted = new Set(nodeIds);
  const out: Record<string, number> = {};
  for (const entry of member.trace) {
    if (wanted.has(entry.nodeId)) {
      out[entry.label] = Number(entry.value.toFixed(2));
    }
  }
  return out;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await dbConnect();

    const session = await CapstoneSession.findById(id);
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    if (!isAdmin(actor) && !isCoordinatorFor(actor, session.department)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const semester = await Semester.findById(session.semesterId).select('name').lean();
    const semesterName = (semester as { name?: string } | null)?.name || '';

    const { tracks, groups } = await computeSessionGrades(session);

    const workbook = XLSX.utils.book_new();

    // ── Sheet 1: Grades ────────────────────────────────────────────────────────────────
    // One row per student. Identity columns first so the sheet is usable as a roster even
    // before any marks exist.
    const gradeRows: Record<string, unknown>[] = [];
    const dynamicColumns = new Set<string>();

    for (const group of groups) {
      for (const member of group.members) {
        const components = componentColumns(member, group.componentNodeIds);
        for (const key of Object.keys(components)) dynamicColumns.add(key);

        gradeRows.push({
          'Student ID': member.studentId,
          'Name': member.name || '',
          'Email': member.email || '',
          'Track': group.track,
          'Group': group.groupNumber,
          'Project Title': group.projectTitle,
          'Supervisor': group.supervisorName || '',
          ...components,
          'Total': member.score === null ? '' : Number(member.score.toFixed(2)),
          'Grade': member.letter || '',
          // Makes an incomplete row self-explanatory in the spreadsheet instead of looking
          // like a genuine zero.
          'Not Yet Graded': member.missingComponents.length
            ? member.missingComponents.map((c) => COMPONENT_LABELS[c] || c).join(', ')
            : '',
          'Scheme': group.schemeName || 'none pinned',
          ...(member.error ? { 'Error': member.error } : {}),
        });
      }
    }

    // A stable column order across every row, so students whose scheme produced fewer
    // nodes still line up under the same headers.
    const header = [
      'Student ID',
      'Name',
      'Email',
      'Track',
      'Group',
      'Project Title',
      'Supervisor',
      ...[...dynamicColumns],
      'Total',
      'Grade',
      'Not Yet Graded',
      'Scheme',
    ];

    const gradeSheet = XLSX.utils.json_to_sheet(
      gradeRows.length
        ? gradeRows
        : [Object.fromEntries(header.map((h) => [h, '']))],
      { header }
    );
    gradeSheet['!cols'] = header.map((h) => ({
      wch: h === 'Project Title' ? 34 : h === 'Email' || h === 'Supervisor' ? 26 : Math.max(12, h.length + 2),
    }));
    gradeSheet['!freeze'] = { xSplit: 2, ySplit: 1 };
    XLSX.utils.book_append_sheet(workbook, gradeSheet, 'Grades');

    // ── Sheet 2: Submissions ───────────────────────────────────────────────────────────
    // Every individual mark, including ones the scheme did not count. Without this the
    // coordinator can see a total but not who gave what, which is exactly the question
    // that comes up when a student queries a grade.
    const detailRows: Record<string, unknown>[] = [];
    for (const group of groups) {
      for (const member of group.members) {
        for (const sub of member.submissions) {
          detailRows.push({
            'Student ID': member.studentId,
            'Name': member.name || '',
            'Track': group.track,
            'Group': group.groupNumber,
            'Component': COMPONENT_LABELS[sub.component] || sub.component,
            'Submitted By': sub.submitterName,
            'Role': sub.submitterRole === 'supervisor' ? 'Supervisor' : 'Evaluator',
            'Counted': sub.counted ? 'Yes' : 'No',
            'Raw Score': sub.rawScore,
            'Out Of': sub.rubricMax ?? '',
          });
        }
      }
    }

    const detailHeader = [
      'Student ID',
      'Name',
      'Track',
      'Group',
      'Component',
      'Submitted By',
      'Role',
      'Counted',
      'Raw Score',
      'Out Of',
    ];
    const detailSheet = XLSX.utils.json_to_sheet(
      detailRows.length ? detailRows : [Object.fromEntries(detailHeader.map((h) => [h, '']))],
      { header: detailHeader }
    );
    detailSheet['!cols'] = detailHeader.map((h) => ({ wch: Math.max(12, h.length + 4) }));
    detailSheet['!freeze'] = { xSplit: 2, ySplit: 1 };
    XLSX.utils.book_append_sheet(workbook, detailSheet, 'Submissions');

    // ── Sheet 3: Scheme Info ───────────────────────────────────────────────────────────
    // Records which arithmetic produced these numbers, so the file is self-explanatory
    // months later when the scheme has moved on.
    const infoRows = [
      { Field: 'Department', Value: session.department },
      { Field: 'Semester', Value: semesterName },
      { Field: 'Session Status', Value: session.status },
      { Field: 'Exported At', Value: new Date().toISOString() },
      { Field: '', Value: '' },
      ...tracks.map((t) => ({
        Field: `Track ${t.track}`,
        Value: t.schemeName
          ? `${t.schemeName} (v${t.version ?? '-'}) — ${t.status}${t.message ? ': ' + t.message : ''}`
          : (t.message || 'no scheme pinned'),
      })),
    ];
    const infoSheet = XLSX.utils.json_to_sheet(infoRows, { header: ['Field', 'Value'] });
    infoSheet['!cols'] = [{ wch: 20 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(workbook, infoSheet, 'Scheme Info');

    const buffer: Buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const safeSemester = semesterName.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const filename = `capstone-grades-${session.department}${safeSemester ? '-' + safeSemester : ''}-${new Date()
      .toISOString()
      .slice(0, 10)}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: unknown) {
    console.error('GET /api/capstone/sessions/[id]/grades-export error:', error);
    return NextResponse.json({ error: 'Failed to export grades' }, { status: 500 });
  }
}
