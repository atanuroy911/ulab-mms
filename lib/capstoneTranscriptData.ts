import CapstoneGroup from '@/models/CapstoneGroup';
import Department from '@/models/Department';
import User from '@/models/User';
import { getLogoDataUri } from '@/lib/capstonePrint';
import type { Frame } from '@/lib/capstoneTranscript';

// Data the grade reports need beyond the grades themselves.

export async function frameFor(department: string, title: string, subtitle?: string): Promise<Frame> {
  const [dept, logoDataUri] = await Promise.all([Department.findOne({ code: department }).select('name').lean<{ name?: string }>(), getLogoDataUri()]);
  return {
    logoDataUri,
    department,
    // Stored names vary ("BSc in Computer Science & Engineering"); the header wants the subject.
    departmentName: `Department of ${(dept?.name || department).replace(/^(department of|b\.?\s?sc\.?\s+in|bachelor of science in)\s+/i, '')}`,
    title,
    subtitle,
  };
}

/** Each group's current evaluators by name (including name-only ones from an imported workbook), and the workbook's supervisor initials when no supervisor is set. */
export async function groupExtras(groupIds: string[]): Promise<Map<string, { evaluators: string[]; supervisorLabel: string | null }>> {
  const groups = await CapstoneGroup.find({ _id: { $in: groupIds } }).select('evaluators placeholderEvaluators supervisorId supervisorLabel').lean();
  const userIds = groups.flatMap((g) => g.evaluators.filter((e) => !e.unassignedAt).map((e) => e.evaluatorId));
  const users = await User.find({ _id: { $in: userIds } }).select('name').lean();
  const nameOf = new Map(users.map((u) => [String(u._id), u.name as string]));
  return new Map(
    groups.map((g) => [
      String(g._id),
      {
        evaluators: [
          ...g.evaluators.filter((e) => !e.unassignedAt).map((e) => nameOf.get(String(e.evaluatorId)) || 'Evaluator'),
          ...(g.placeholderEvaluators || []).filter((p) => !p.removedAt).map((p) => p.label),
        ],
        supervisorLabel: g.supervisorId ? null : g.supervisorLabel ?? null,
      },
    ])
  );
}
