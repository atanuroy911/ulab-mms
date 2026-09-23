import Department from '@/models/Department';
import { getFixedPrograms } from '@/lib/catalogueRegistry';

/**
 * Ensures a Department exists for every program in the curated catalogue registry
 * (app/catalogue-registry/registry.js, via lib/catalogueRegistry.ts). Safe to call on every
 * request - only inserts what's missing, never overwrites admin edits to existing
 * departments (e.g. a renamed shortCode or an assigned head).
 */
export async function ensureDefaultDepartments(): Promise<void> {
  const programs = getFixedPrograms();
  if (programs.length === 0) return;

  const existing = await Department.find({ code: { $in: programs.map((p) => p.id) } }).select('code');
  const existingCodes = new Set(existing.map((d) => d.code));

  const toInsert = programs
    .filter((p) => !existingCodes.has(p.id))
    .map((p) => ({
      code: p.id,
      name: p.name,
      shortCode: p.short,
      icon: p.icon,
      isActive: true,
    }));

  if (toInsert.length > 0) {
    await Department.insertMany(toInsert);
  }
}
