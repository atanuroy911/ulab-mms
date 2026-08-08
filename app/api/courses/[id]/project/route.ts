import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import ProjectGroup from '@/models/ProjectGroup';
import Course from '@/models/Course';

// GET — fetch project session state for this course
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

    let projectGroup = await ProjectGroup.findOne({ courseId: id })
      .populate('groups.studentIds', 'name studentId');

    if (!projectGroup) {
      return NextResponse.json({
        courseId: id,
        isActive: false,
        maxMembersPerGroup: 4,
        groups: [],
      });
    }

    return NextResponse.json(projectGroup);
  } catch (error: any) {
    console.error('GET /api/courses/[id]/project error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// POST — toggle isActive (start/stop project session)
export async function POST(
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

    const body = await req.json().catch(() => ({}));
    const { maxMembersPerGroup } = body;

    let projectGroup = await ProjectGroup.findOne({ courseId: id });

    if (!projectGroup) {
      projectGroup = new ProjectGroup({
        courseId: id,
        isActive: true,
        maxMembersPerGroup: maxMembersPerGroup ?? 4,
        groups: [],
      });
    } else {
      projectGroup.isActive = !projectGroup.isActive;
      if (maxMembersPerGroup !== undefined && projectGroup.isActive) {
        projectGroup.maxMembersPerGroup = maxMembersPerGroup;
      }
    }

    await projectGroup.save();
    await projectGroup.populate('groups.studentIds', 'name studentId');

    return NextResponse.json(projectGroup);
  } catch (error: any) {
    console.error('POST /api/courses/[id]/project error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// PATCH — update a group's title, rubric scores, or maxMembersPerGroup
export async function PATCH(
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

    const body = await req.json();
    const { groupId, projectTitle, rubricScores, examRubricScores, maxMembersPerGroup } = body;

    const projectGroup = await ProjectGroup.findOne({ courseId: id });
    if (!projectGroup) {
      return NextResponse.json({ error: 'Project session not found' }, { status: 404 });
    }

    if (maxMembersPerGroup !== undefined) {
      projectGroup.maxMembersPerGroup = maxMembersPerGroup;
    }

    if (groupId) {
      const group = (projectGroup.groups as any).id(groupId);
      if (!group) {
        return NextResponse.json({ error: 'Group not found' }, { status: 404 });
      }
      if (projectTitle !== undefined) group.projectTitle = projectTitle;

      // Legacy single-rubric save
      if (rubricScores !== undefined) {
        group.rubricScores = rubricScores;
        group.markedAt = new Date();
      }

      // Per-exam rubric scores + mark mode
      if (examRubricScores !== undefined) {
        const { examId, scores, markMode, reasoning, directMark } = examRubricScores as {
          examId: string;
          scores?: { c1: number; c2: number; c3: number; c4: number; c5: number };
          markMode: 'direct' | 'rubric';
          reasoning?: string;
          directMark?: number;
        };

        // Completely bypass Mongoose deep array tracking by extracting, mutating, and replacing.
        const currentGroups = projectGroup.toObject().groups;
        const groupIndex = currentGroups.findIndex((g: any) => g._id.toString() === groupId);

        if (groupIndex !== -1) {
          const targetGroup = currentGroups[groupIndex];
          if (!targetGroup.examRubricScores) {
            targetGroup.examRubricScores = [];
          }

          const existingIndex = targetGroup.examRubricScores.findIndex(
            (e: any) => e.examId?.toString() === examId
          );

          if (existingIndex !== -1) {
            if (scores !== undefined) targetGroup.examRubricScores[existingIndex].scores = scores;
            if (markMode !== undefined) {
              targetGroup.examRubricScores[existingIndex].markMode = markMode;
            }
            if (reasoning !== undefined) {
              targetGroup.examRubricScores[existingIndex].reasoning = reasoning;
            }
            if (directMark !== undefined) {
              targetGroup.examRubricScores[existingIndex].directMark = directMark;
            }
          } else {
            targetGroup.examRubricScores.push({
              examId: examId as any,
              scores: scores || { c1: 0, c2: 0, c3: 0, c4: 0, c5: 0 },
              markMode: markMode || 'rubric',
              reasoning: reasoning || '',
              directMark: directMark ?? null,
            });
          }

          targetGroup.markedAt = new Date();

          // Completely re-assign to trigger full re-cast and save
          projectGroup.groups = currentGroups;
        }
      }
    }

    await projectGroup.save();
    await projectGroup.populate('groups.studentIds', 'name studentId');

    return NextResponse.json(projectGroup);
  } catch (error: any) {
    console.error('PATCH /api/courses/[id]/project error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
