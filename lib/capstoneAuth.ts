import { getServerSession } from 'next-auth';
import { authOptions, isStudentOnlySessionUser } from '@/app/api/auth/[...nextauth]/route';
import { ICapstoneGroup } from '@/models/CapstoneGroup';
import CapstoneSession from '@/models/CapstoneSession';

export interface CapstoneActor {
  userId: string;
  roles: string[];
  departmentId: string | null;
  coordinatorDepartments: string[];
}

/** Resolves the signed-in teacher/admin/coordinator session, or null if not signed in. */
export async function getCapstoneActor(): Promise<CapstoneActor | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  // Student-only session tokens (checkin/marks/project/student) must never act as a capstone
  // supervisor/coordinator/admin - see app/api/auth/[...nextauth]/route.ts. This previously
  // checked only 3 of the 4 flags (missing `studentSession`), which let a student's
  // google-student session pass through as a teacher.
  const anyUser = session.user as any;
  if (isStudentOnlySessionUser(anyUser)) return null;

  return {
    userId: session.user.id,
    // Absence of roles data must DENY, not grant - never default to ['teacher'] here.
    roles: anyUser.roles || [],
    departmentId: anyUser.departmentId ?? null,
    coordinatorDepartments: anyUser.coordinatorDepartments || [],
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

export function isGroupSupervisor(actor: CapstoneActor, group: ICapstoneGroup): boolean {
  return String(group.supervisorId) === actor.userId;
}

export function isGroupEvaluator(actor: CapstoneActor, group: ICapstoneGroup): boolean {
  return group.evaluators.some((e) => !e.unassignedAt && String(e.evaluatorId) === actor.userId);
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
