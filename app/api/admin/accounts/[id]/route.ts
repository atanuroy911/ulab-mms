import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import Course from '@/models/Course';
import Student from '@/models/Student';
import Department from '@/models/Department';
import { verifyAdminToken, verifyAdminAccess } from '@/lib/adminAuth';
import { cascadeDeleteCourseData } from '@/lib/courseCascadeDelete';

async function resolveId(params: Promise<{ id: string }>) {
  const resolved = await params;
  return resolved.id;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ok = await verifyAdminToken(request);
    if (!ok) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    await dbConnect();
    const id = await resolveId(params);

    const user = await User.findById(id)
      .select('name email role roles departmentId coordinatorDepartments googleId createdAt')
      .lean();
    if (!user) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const courses = await Course.find({ userId: id })
      .select('name code semester year section courseType isArchived createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const studentCounts = await Student.aggregate([
      { $match: { courseId: { $in: courses.map((c) => c._id) } } },
      { $group: { _id: '$courseId', count: { $sum: 1 } } },
    ]);
    const countByCourseId = new Map(studentCounts.map((c) => [String(c._id), c.count as number]));

    return NextResponse.json({
      account: {
        _id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role || 'user',
        roles: user.roles?.length ? user.roles : ['teacher'],
        departmentId: user.departmentId ? String(user.departmentId) : null,
        coordinatorDepartments: user.coordinatorDepartments || [],
        provider: user.googleId ? 'google' : 'credentials',
        createdAt: user.createdAt,
      },
      courses: courses.map((course) => ({
        _id: String(course._id),
        name: course.name,
        code: course.code,
        semester: course.semester,
        year: course.year,
        section: course.section,
        courseType: course.courseType,
        isArchived: course.isArchived,
        createdAt: course.createdAt,
        studentCount: countByCourseId.get(String(course._id)) || 0,
      })),
    });
  } catch (error) {
    console.error('Get admin account error:', error);
    return NextResponse.json({ error: 'Failed to load account' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await verifyAdminAccess(request);
    if (!access.ok) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    await dbConnect();
    const id = await resolveId(params);
    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === 'string' ? body.name.trim() : undefined;
    const roles = Array.isArray(body?.roles) ? body.roles : undefined;
    const departmentId = body?.departmentId !== undefined ? body.departmentId || null : undefined;
    const coordinatorDepartments = Array.isArray(body?.coordinatorDepartments) ? body.coordinatorDepartments : undefined;

    // Granting/revoking roles or department authority is a privilege change - it must be
    // traceable to a real, identity-bearing admin account, not just "whoever knows the
    // shared admin password" (which carries no userId at all - see lib/adminAuth.ts).
    // Renaming an account (name only) stays available to the shared-password login.
    const isPrivilegeChange = roles !== undefined || departmentId !== undefined || coordinatorDepartments !== undefined;
    if (isPrivilegeChange && !access.userId) {
      return NextResponse.json(
        { error: 'Changing roles/department requires signing in with an admin-role account, not the shared admin password' },
        { status: 403 }
      );
    }

    if (name !== undefined && !name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    if (roles !== undefined) {
      const validRoles = new Set(['admin', 'coordinator', 'teacher']);
      if (roles.length === 0 || !roles.every((r: unknown) => typeof r === 'string' && validRoles.has(r))) {
        return NextResponse.json({ error: 'roles must be a non-empty array of admin/coordinator/teacher' }, { status: 400 });
      }
    }

    let normalizedCoordinatorDepartments: string[] | undefined;
    if (coordinatorDepartments !== undefined) {
      if (!coordinatorDepartments.every((d: unknown) => typeof d === 'string')) {
        return NextResponse.json({ error: 'coordinatorDepartments must be an array of department codes' }, { status: 400 });
      }
      const normalizedCodes: string[] = coordinatorDepartments.map((d: string) => d.trim().toUpperCase()).filter(Boolean);
      normalizedCoordinatorDepartments = normalizedCodes;
      // Validate against real departments so a typo doesn't silently produce a coordinator
      // with permanent, invisible 403s (lib/capstoneAuth.ts compares this array verbatim
      // against CapstoneSession.department, which is also always upper-cased).
      if (normalizedCodes.length > 0) {
        const validCodes = await Department.find({ code: { $in: normalizedCodes } }).select('code').lean();
        const validCodeSet = new Set(validCodes.map((d) => d.code));
        const unknown = normalizedCodes.filter((code) => !validCodeSet.has(code));
        if (unknown.length > 0) {
          return NextResponse.json({ error: `Unknown department code(s): ${unknown.join(', ')}` }, { status: 400 });
        }
      }
    }

    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // findByIdAndUpdate would bypass the pre('save') hook that keeps the legacy `role`
    // field in sync with `roles` - use .save() so app/api/auth/users/route.ts's
    // role==='admin' check keeps working the moment roles change.
    if (name !== undefined) user.name = name;
    if (roles !== undefined) user.roles = roles;
    if (departmentId !== undefined) user.departmentId = departmentId as any;
    if (normalizedCoordinatorDepartments !== undefined) user.coordinatorDepartments = normalizedCoordinatorDepartments;
    await user.save();

    return NextResponse.json({
      account: {
        _id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        roles: user.roles?.length ? user.roles : ['teacher'],
        departmentId: user.departmentId ? String(user.departmentId) : null,
        coordinatorDepartments: user.coordinatorDepartments || [],
      },
    });
  } catch (error) {
    console.error('Update admin account error:', error);
    return NextResponse.json({ error: 'Failed to update account' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ok = await verifyAdminToken(request);
    if (!ok) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    await dbConnect();
    const id = await resolveId(params);
    const body = await request.json().catch(() => ({}));
    const confirmEmail = typeof body?.confirmEmail === 'string' ? body.confirmEmail.trim().toLowerCase() : '';

    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    if (confirmEmail !== user.email.toLowerCase()) {
      return NextResponse.json({ error: 'Confirmation email does not match this account' }, { status: 400 });
    }

    const courses = await Course.find({ userId: id }).select('_id').lean();
    await Promise.all(courses.map((course) => cascadeDeleteCourseData(String(course._id))));
    await Course.deleteMany({ userId: id });
    await User.findByIdAndDelete(id);

    return NextResponse.json({ message: 'Account and all owned courses deleted', coursesDeleted: courses.length });
  } catch (error) {
    console.error('Delete admin account error:', error);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
