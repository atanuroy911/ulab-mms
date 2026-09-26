import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import CapstoneSession from '@/models/CapstoneSession';
import '@/models/Semester';
import { getCapstoneActor, isAdmin, isCoordinatorFor } from '@/lib/capstoneAuth';
import { computeSessionGrades } from '@/lib/capstoneGrades';

// GET /api/capstone/sessions/[id]/marks-export
//
// Every submitted mark in the session as a CSV, one row per mark - every grader, every
// component (poster included), with its scale and whether the grade counts it.
//
// Built on computeSessionGrades, the same function the grades page, the gradebook export and
// the course file use, so "Counted" here is exactly what the grade was computed from. It
// previously read the collection itself: it included unsubmitted drafts, showed only the
// first two assigned evaluators (not the ones that count) and only the current supervisor.
//
// Admin or coordinator for this department only.

const COMPONENT_LABEL: Record<string, string> = {
  report: 'Report',
  presentation: 'Presentation',
  peer: 'Peer',
  weeklyJournal: 'Weekly Journal',
  poster: 'Poster',
};

const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await dbConnect();

    const session = await CapstoneSession.findById(id).populate('semesterId', 'name');
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (!isAdmin(actor) && !isCoordinatorFor(actor, session.department)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { groups } = await computeSessionGrades(session);

    const header = [
      'Track',
      'Group',
      'Project',
      'Supervisor',
      'Student ID',
      'Student Name',
      'Component',
      'Grader',
      'Grader Role',
      'Mark',
      'Out Of',
      'Counted In Grade',
      'Entered By',
    ];
    const rows: string[] = [header.map(csvCell).join(',')];

    for (const group of groups) {
      for (const member of group.members) {
        const subs = [...member.submissions].sort(
          (a, b) =>
            a.component.localeCompare(b.component) ||
            (a.submitterRole === b.submitterRole ? a.submitterName.localeCompare(b.submitterName) : a.submitterRole === 'supervisor' ? -1 : 1)
        );
        if (subs.length === 0) {
          // Keep ungraded students visible so gaps are obvious.
          rows.push(
            [group.track, group.groupNumber, group.projectTitle, group.supervisorName, member.studentId, member.name, '', '', '', '', '', '', '']
              .map(csvCell)
              .join(',')
          );
          continue;
        }
        for (const s of subs) {
          rows.push(
            [
              group.track,
              group.groupNumber,
              group.projectTitle,
              group.supervisorName,
              member.studentId,
              member.name,
              COMPONENT_LABEL[s.component] || s.component,
              s.submitterName,
              s.submitterRole === 'supervisor' ? 'Supervisor' : 'Evaluator',
              s.rawScore,
              s.rubricMax ?? '',
              s.counted ? 'Yes' : 'No',
              s.enteredByName || '',
            ]
              .map(csvCell)
              .join(',')
          );
        }
      }
    }

    const semName =
      typeof session.semesterId === 'object' && session.semesterId !== null
        ? String((session.semesterId as unknown as { name?: string }).name || '')
        : '';
    // BOM so Excel opens UTF-8 names correctly.
    return new NextResponse(`﻿${rows.join('\r\n')}`, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="capstone-marks-${session.department}-${semName.replace(/[^\w-]+/g, '_')}.csv"`,
      },
    });
  } catch (error) {
    console.error('GET /api/capstone/sessions/[id]/marks-export error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Export failed' }, { status: 500 });
  }
}
