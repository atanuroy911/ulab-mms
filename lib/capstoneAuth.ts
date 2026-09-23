import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { authOptions, isStudentOnlySessionUser } from '@/app/api/auth/[...nextauth]/route';
import { ICapstoneGroup } from '@/models/CapstoneGroup';
import CapstoneSession from '@/models/CapstoneSession';
import { getWebAdminUserId } from '@/lib/webAdminAccount';

export interface CapstoneActor {
  userId: string;
  roles: string[];
  departmentId: string | null;
  coordinatorDepartments: string[];
  /**
   * True only when acting through the /admin panel's built-in login with no teacher account
   * signed in. `userId` is then the "Web Admin" system user (lib/webAdminAccount.ts): it
   * names the actor in audit fields, but it is not a person and never marks.
   */
  systemAccount?: boolean;
}

/** Whether this request carries a valid /admin panel login (the `admin-token` cookie, see lib/adminAuth.ts). */
async function hasWebAdminLogin(): Promise<boolean> {
  try {
    const token = (await cookies()).get('admin-token')?.value;
    if (!token || !process.env.NEXTAUTH_SECRET) return false;
    const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.NEXTAUTH_SECRET));
    return payload.type === 'admin';
  } catch {
    return false;
  }
}

/**
 * Resolves who is acting on capstone:
 *
 *  - A signed-in teacher account (any role) acts as that person. If the same browser also
 *    holds the /admin panel login, the person additionally gets admin rights - it is still a
 *    real person, so their own name goes in the history and they can mark the groups they
 *    actually supervise or evaluate.
 *  - The /admin panel login alone is a web-admin: every management action an admin can do,
 *    in every department, recorded as "Web Admin". It never marks - see isGroupSupervisor.
 */
export async function getCapstoneActor(): Promise<CapstoneActor | null> {
  const session = await getServerSession(authOptions);
  // Student-only session tokens (checkin/marks/project/student) must never act as a capstone
  // supervisor/coordinator/admin - see app/api/auth/[...nextauth]/route.ts. This previously
  // checked only 3 of the 4 flags (missing `studentSession`), which let a student's
  // google-student session pass through as a teacher.
  const sessionUser = session?.user as
    | { id?: string; roles?: string[]; departmentId?: string | null; coordinatorDepartments?: string[] }
    | undefined;
  const teacher = sessionUser?.id && !isStudentOnlySessionUser(sessionUser) ? sessionUser : null;
  const webAdminLogin = await hasWebAdminLogin();

  if (teacher) {
    // Absence of roles data must DENY, not grant - never default to ['teacher'] here.
    const roles: string[] = teacher.roles || [];
    return {
      userId: teacher.id!,
      roles: webAdminLogin && !roles.includes('admin') ? [...roles, 'admin'] : roles,
      departmentId: teacher.departmentId ?? null,
      coordinatorDepartments: teacher.coordinatorDepartments || [],
    };
  }

  if (!webAdminLogin) return null;
  return {
    userId: await getWebAdminUserId(),
    roles: ['admin'],
    departmentId: null,
    coordinatorDepartments: [],
    systemAccount: true,
  };
}

export function isAdmin(actor: CapstoneActor): boolean {
  return actor.roles.includes('admin');
}

/** A coordinator's authority is scoped to the department(s) they're assigned to manage. */
export function isCoordinatorFor(actor: CapstoneActor, department: string): boolean {
  return actor.roles.includes('coordinator') && actor.coordinatorDepartments.includes(department);
}

export function canManageDepartment(actor: CapstoneActor, department: string): boolean {
  return isAdmin(actor) || isCoordinatorFor(actor, department);
}

// The Web Admin system account is never a grader - assignableUserError() refuses it as a
// supervisor/evaluator, and these fail closed for it regardless.
export function isGroupSupervisor(actor: CapstoneActor, group: ICapstoneGroup): boolean {
  return !actor.systemAccount && String(group.supervisorId) === actor.userId;
}

export function isGroupEvaluator(actor: CapstoneActor, group: ICapstoneGroup): boolean {
  return !actor.systemAccount && group.evaluators.some((e) => !e.unassignedAt && String(e.evaluatorId) === actor.userId);
}

/** Supervisor or an actively-assigned evaluator of this specific group. */
export function isGroupGrader(actor: CapstoneActor, group: ICapstoneGroup): boolean {
  return isGroupSupervisor(actor, group) || isGroupEvaluator(actor, group);
}

/** Loads a group's session in one round trip and checks manage authority on it. */
export async function canManageGroup(actor: CapstoneActor, group: ICapstoneGroup): Promise<boolean> {
  if (isAdmin(actor)) return true;
  const session = await CapstoneSession.findById(group.sessionId).select('department');
  if (!session) return false;
  return isCoordinatorFor(actor, session.department);
}
