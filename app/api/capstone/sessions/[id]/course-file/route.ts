import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import CapstoneSession from '@/models/CapstoneSession';
import GradingScheme from '@/models/GradingScheme';
import Department from '@/models/Department';
import User from '@/models/User';
import '@/models/Semester';
import { getCapstoneActor, isAdmin, isCoordinatorFor } from '@/lib/capstoneAuth';
import { computeSessionGrades } from '@/lib/capstoneGrades';
import { validateScheme, type SchemeGraph } from '@/lib/gradingEngine';
import { defaultOutcomes, validateOutcomes, type CapstoneOutcomesConfig } from '@/lib/capstoneOutcomes';
import { buildCourseFileData } from '@/lib/capstoneCourseFile';
import { buildCourseFileHtml } from '@/lib/capstoneCourseFilePdf';
import { esc, getLogoDataUri } from '@/lib/capstonePrint';

export const runtime = 'nodejs';

// GET /api/capstone/sessions/[id]/course-file?track=A   (beta)
//
// The track's course file - grade sheet, marking detail, CO evaluation, CO-PO attainment and
// CQI - per student, built from the live marks and the track's pinned grading scheme (its
// graph and its COs). The capstone counterpart of a normal course's CO-PO PDF export: styled
// HTML the browser prints to PDF. Read-only; coordinator/admin only, since it is the whole
// cohort's marks.

function page(title: string, message: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(title)}</title></head><body style="font-family:Arial,sans-serif;padding:40px;max-width:640px;margin:auto;"><h2>${esc(title)}</h2><p>${esc(message)}</p></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const track = (request.nextUrl.searchParams.get('track') || '').toUpperCase();
    if (!['A', 'B', 'C'].includes(track)) {
      return NextResponse.json({ error: 'track must be A, B or C' }, { status: 400 });
    }

    await dbConnect();
    const session = await CapstoneSession.findById(id).populate('semesterId', 'name');
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (!isAdmin(actor) && !isCoordinatorFor(actor, session.department)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const courseCode = `${session.department}4098${track}`;
    const trackConfig = session.tracks.find((t) => t.track === track);
    if (!trackConfig) return page('No such track', `This session does not run ${courseCode}.`, 404);
    if (!trackConfig.gradingSchemeId) {
      return page('No grading scheme', `Pin a grading scheme to track ${track} before exporting its course file.`);
    }

    const scheme = await GradingScheme.findById(trackConfig.gradingSchemeId).lean();
    if (!scheme) return page('Grading scheme missing', 'The grading scheme pinned to this track no longer exists.');

    // Same resolution as computeSessionGrades: the pinned version, else the draft.
    const pinned = scheme.versions?.find((v) => v.version === trackConfig.gradingSchemeVersion);
    const graph: SchemeGraph = pinned ? { nodes: pinned.nodes, edges: pinned.edges } : { nodes: scheme.nodes || [], edges: scheme.edges || [] };
    if (validateScheme(graph).length > 0) {
      return page('Grading scheme has problems', `Fix and publish "${scheme.name}" before exporting - its grades cannot be computed.`);
    }

    // COs travel with the version. A version published before COs existed falls back to the
    // department defaults (said so on the scheme sheet) rather than borrowing the draft's,
    // which may not match what was graded.
    // COs also differ by track (4098A has 5, 4098B 11), so a scheme's COs only apply to the
    // track they are written for; one scheme pinned to several tracks uses each other
    // track's defaults.
    const stored = (pinned ? pinned.outcomes : scheme.outcomes) as CapstoneOutcomesConfig | null | undefined;
    let outcomesNote: string | null = null;
    if (!stored?.outcomes?.length) {
      outcomesNote = pinned
        ? `Version ${pinned.version} was published without course outcomes, so the department's default COs for ${courseCode} were used.`
        : `This scheme has no course outcomes yet, so the department's default COs for ${courseCode} were used.`;
    } else if ((stored.track || scheme.track || 'A') !== track) {
      outcomesNote = `This scheme's COs are written for 4098${stored.track || scheme.track || 'A'}, so the department's default COs for ${courseCode} were used.`;
    } else if (validateOutcomes(stored, track).length > 0) {
      outcomesNote = `This scheme's COs do not match the ${courseCode} rubric, so the department's default COs were used.`;
    }
    const outcomes = outcomesNote ? defaultOutcomes(track) : stored!;

    const grades = await computeSessionGrades(session, { track });
    const data = buildCourseFileData({ track, graph, outcomes, groups: grades.groups.filter((g) => g.track === track) });

    const [department, coordinator, logoDataUri] = await Promise.all([
      Department.findOne({ code: session.department }).select('name').lean(),
      actor.systemAccount ? null : User.findById(actor.userId).select('name').lean(),
      getLogoDataUri(),
    ]);
    const semesterName =
      typeof session.semesterId === 'object' && session.semesterId !== null ? String((session.semesterId as { name?: string }).name || '') : '';

    const html = buildCourseFileHtml(data, {
      courseCode,
      semesterName,
      departmentName: (department as { name?: string } | null)?.name || session.department,
      schemeName: scheme.name,
      schemeVersion: pinned ? pinned.version : null,
      outcomesNote,
      coordinatorName: (coordinator as { name?: string } | null)?.name || '',
      logoDataUri,
      generatedAt: new Date(),
    });

    return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (error) {
    console.error('course-file error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to build course file' }, { status: 500 });
  }
}
