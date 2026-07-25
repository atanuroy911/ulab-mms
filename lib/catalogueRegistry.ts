import fs from 'fs';
import path from 'path';
import vm from 'vm';

// Loads app/catalogue-registry/*.js (curated, PDF-transcribed program
// catalogues) into plain server-side data. Those files are IIFEs written to
// mutate a browser `window` global and end each program file by calling
// `window.buildUlabCatalogue(...)` — a function that doesn't exist anywhere
// in this repo (the files were prepared ahead of this feature and never
// wired in). We stub that function as the identity so each file's raw
// { courses, degreeRequirements, classifyByPattern } config is captured
// instead of executed further, and evaluate the files as-is via `vm` rather
// than hand-porting their data.

export interface FixedProgram {
  id: string;
  name: string;
  short: string;
  icon: string;
}

export interface FixedCourse {
  code: string;
  unescoCode: string;
  title: string;
  category: string;
  prereq: string[];
  oldCodes: string[];
}

interface CatalogueConfig {
  courses: FixedCourse[];
  degreeRequirements?: unknown;
  classifyByPattern?: (unescoCode: string) => string;
}

const REGISTRY_DIR = path.join(process.cwd(), 'app', 'catalogue-registry');

let cachedPrograms: FixedProgram[] | null = null;
let cachedCatalogues: Record<string, CatalogueConfig> | null = null;

function loadRegistry(): { programs: FixedProgram[]; catalogues: Record<string, CatalogueConfig> } {
  if (cachedPrograms && cachedCatalogues) {
    return { programs: cachedPrograms, catalogues: cachedCatalogues };
  }

  const sandboxWindow: Record<string, any> = {};
  sandboxWindow.buildUlabCatalogue = (cfg: CatalogueConfig) => cfg;
  sandboxWindow.window = sandboxWindow;

  const context = vm.createContext({ window: sandboxWindow, console });

  const files = fs.readdirSync(REGISTRY_DIR).filter((f) => f.endsWith('.js'));
  // registry.js only sets window.ULAB_PROGRAMS and doesn't depend on the
  // per-program files, but load it first for clarity/determinism.
  files.sort((a, b) => (a === 'registry.js' ? -1 : b === 'registry.js' ? 1 : a.localeCompare(b)));

  for (const file of files) {
    const code = fs.readFileSync(path.join(REGISTRY_DIR, file), 'utf-8');
    try {
      vm.runInContext(code, context, { filename: file });
    } catch (err) {
      console.error(`[catalogueRegistry] failed to evaluate ${file}:`, err);
    }
  }

  const programs: FixedProgram[] = Array.isArray(sandboxWindow.ULAB_PROGRAMS) ? sandboxWindow.ULAB_PROGRAMS : [];
  const catalogues: Record<string, CatalogueConfig> = sandboxWindow.ULAB_CATALOGUES || {};
  cachedPrograms = programs;
  cachedCatalogues = catalogues;

  return { programs, catalogues };
}

export function getFixedPrograms(): FixedProgram[] {
  return loadRegistry().programs;
}

export function getFixedCatalogue(programId: string): FixedCourse[] {
  const { catalogues } = loadRegistry();
  return catalogues[programId]?.courses ?? [];
}

export function findFixedCourseByCode(code: string): { course: FixedCourse; programId: string } | null {
  const { programs, catalogues } = loadRegistry();
  const normalized = code.trim().toUpperCase();
  for (const program of programs) {
    const courses = catalogues[program.id]?.courses ?? [];
    const match = courses.find((c) => c.code.toUpperCase() === normalized);
    if (match) {
      return { course: match, programId: program.id };
    }
  }
  return null;
}
