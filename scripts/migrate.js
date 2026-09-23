// Ordered, idempotent, ledger-backed migration runner.
//
// Run with: npm run migrate  (requires MONGODB_URI in the environment)
//
// Migrations run explicitly, on demand - never as a side effect of a request handler (the
// deleted lib/migrations.ts used to run its index fix on every capstone-group POST, which is
// exactly the footgun this runner replaces). Each migration is idempotent and records its
// name in the `_migrations` collection once it succeeds, so re-running this script is safe
// and only unapplied migrations execute.
//
// This is deliberately a plain CommonJS script (matching every other scripts/*.js file) since
// the project has no ts-node/tsx - it connects directly with mongoose rather than importing
// the app's TS models.

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGODB_URL;
  if (!uri) {
    console.error('Please set MONGODB_URI (e.g. mongodb+srv://...).');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB\n');

  const db = mongoose.connection.db;
  const ledger = db.collection('_migrations');

  for (const migration of migrations) {
    const already = await ledger.findOne({ name: migration.name });
    if (already) {
      console.log(`- ${migration.name}: already applied (${already.appliedAt.toISOString()})`);
      continue;
    }

    console.log(`* ${migration.name}: running...`);
    const result = await migration.run(db);
    await ledger.insertOne({ name: migration.name, appliedAt: new Date(), result: result || null });
    console.log(`  done${result ? ' - ' + JSON.stringify(result) : ''}`);
  }

  console.log('\nAll migrations up to date.');
  await mongoose.disconnect();
}

// ── Migration 1: backfill User.roles from the legacy scalar `role` ─────────────────────────
// Without this, every existing user has no `roles` array; the app's fail-closed default
// (lib/capstoneAuth.ts, app/api/auth/[...nextauth]/route.ts) treats missing roles as NO
// access, which would silently strip role-based admin/coordinator access from every account
// that predates the roles system.
async function backfillUserRoles(db) {
  const users = db.collection('users');
  const cursor = users.find({ $or: [{ roles: { $exists: false } }, { roles: { $size: 0 } }] });
  let updated = 0;
  while (await cursor.hasNext()) {
    const user = await cursor.next();
    const roles = user.role === 'admin' ? ['admin'] : ['teacher'];
    await users.updateOne({ _id: user._id }, { $set: { roles } });
    updated += 1;
  }
  return { updated };
}

// ── Migration 2: seed Department from the curated catalogue registry ───────────────────────
// Mirrors lib/departmentSeed.ts / lib/catalogueRegistry.ts exactly (same vm-sandboxed load of
// app/catalogue-registry/*.js), so the seeded departments always match what the app itself
// would seed - this script just runs it once, explicitly, instead of on every GET request.
function loadPrograms() {
  const registryDir = path.join(process.cwd(), 'app', 'catalogue-registry');
  const sandboxWindow = {};
  sandboxWindow.buildUlabCatalogue = (cfg) => cfg;
  sandboxWindow.window = sandboxWindow;
  const context = vm.createContext({ window: sandboxWindow, console });

  const files = fs.readdirSync(registryDir).filter((f) => f.endsWith('.js'));
  files.sort((a, b) => (a === 'registry.js' ? -1 : b === 'registry.js' ? 1 : a.localeCompare(b)));
  for (const file of files) {
    const code = fs.readFileSync(path.join(registryDir, file), 'utf-8');
    try {
      vm.runInContext(code, context, { filename: file });
    } catch (err) {
      console.error(`  failed to evaluate ${file}:`, err.message);
    }
  }
  return Array.isArray(sandboxWindow.ULAB_PROGRAMS) ? sandboxWindow.ULAB_PROGRAMS : [];
}

async function seedDepartments(db) {
  const programs = loadPrograms();
  const departments = db.collection('departments');
  let inserted = 0;
  for (const program of programs) {
    const existing = await departments.findOne({ code: program.id });
    if (existing) continue;
    await departments.insertOne({
      code: program.id,
      name: program.name,
      shortCode: program.short,
      icon: program.icon || '',
      headUserId: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    inserted += 1;
  }
  return { inserted, totalPrograms: programs.length };
}

// ── Migration 3: verify the new Student.studentId index exists ─────────────────────────────
// Mongoose auto-builds this on first connect (models/Student.ts declares it), so this is a
// verification/no-op step rather than a real migration - it documents the expectation and
// fails loudly if the index is somehow missing (e.g. autoIndex disabled in production).
async function verifyStudentIndex(db) {
  const indexes = await db.collection('students').indexes();
  const hasIndex = indexes.some((idx) => idx.key && idx.key.studentId === 1 && Object.keys(idx.key).length === 1);
  if (!hasIndex) {
    console.warn('  WARNING: students collection has no plain {studentId:1} index - creating it now.');
    await db.collection('students').createIndex({ studentId: 1 });
  }
  return { verified: true };
}

// ── REMOVED: a StudentAccount backfill used to live here. DO NOT re-add it. ────────────────
// It walked every distinct studentId in the `students` collection - i.e. every student who
// has ever been enrolled in ANY course - and minted a StudentAccount for each one. That is
// wrong on two counts:
//   1. Capstone is a new feature with no enrolled students yet. There was nothing to
//      "pre-populate" for, so it was pure noise in a collection that should have stayed empty.
//   2. Scope: a student taking an unrelated course has nothing to do with capstone. Bulk
//      copying the whole student body into a new identity collection is not this feature's
//      business.
// StudentAccount is created LAZILY and only for people who are actually involved: on a real
// google-student sign-in (app/api/auth/[...nextauth]/route.ts) or when a coordinator
// explicitly adds someone to a capstone group (app/api/capstone/sessions/[id]/groups and
// .../groups/[id]/members). That is the correct and only way rows should appear here.

// ── Migration 5: flag legacy capstone data for manual review (never auto-deletes) ──────────
// models/CapstoneGroup.ts now points at a fresh collection (capstonegroups_v2) specifically
// to avoid colliding with the legacy capstonegroups/capstonemarks collections and their old
// indexes. This migration does NOT delete the legacy collections - that's a deliberate,
// separately-run, backed-up decision (see the plan's Phase 0), not something a migration
// should do silently. It just reports what's there so it isn't forgotten.
async function flagLegacyCapstoneData(db) {
  const collections = await db.listCollections().toArray();
  const names = new Set(collections.map((c) => c.name));
  const report = {};
  for (const name of ['capstonegroups', 'capstonemarks']) {
    if (names.has(name)) {
      report[name] = await db.collection(name).countDocuments();
    }
  }
  if (Object.keys(report).length > 0) {
    console.warn(`  Legacy collections still present: ${JSON.stringify(report)}. Not deleted - back up and drop manually when ready.`);
  }
  return report;
}

// ── Migration 6: split chosenEvaluatorIds into per-component chosenEvaluators ───────────
// The old shape held ONE list of evaluators whose marks counted, shared by the presentation
// and the report. Those are graded in different sittings by different people, so one choice
// covering both silently mis-scored whichever component had a different panel.
//
// The new shape is { presentation: [...], report: [...] }. Existing rows are migrated by
// copying the single old list into BOTH components, which preserves exactly the behaviour
// those groups were graded under - the coordinator can then narrow either side.
//
// Additive and reversible: the legacy `chosenEvaluatorIds` field is left in place rather
// than $unset, so a rollback to the previous deploy keeps working.
async function splitChosenEvaluators(db) {
  const groups = db.collection('capstonegroups_v2');
  const cursor = groups.find({
    chosenEvaluatorIds: { $exists: true },
    chosenEvaluators: { $exists: false },
  });

  let updated = 0;
  while (await cursor.hasNext()) {
    const group = await cursor.next();
    const legacy = Array.isArray(group.chosenEvaluatorIds) ? group.chosenEvaluatorIds : [];
    await groups.updateOne(
      { _id: group._id },
      { $set: { chosenEvaluators: { presentation: legacy, report: legacy } } }
    );
    updated += 1;
  }

  // Groups that never had the old field still need the new one, so reads don't have to
  // defend against undefined everywhere.
  const backfilled = await groups.updateMany(
    { chosenEvaluators: { $exists: false } },
    { $set: { chosenEvaluators: { presentation: [], report: [] } } }
  );

  return { migratedFromLegacy: updated, backfilledEmpty: backfilled.modifiedCount };
}

// NOTE: every migration here must be additive and narrowly scoped. This runs against the
// PRODUCTION database - it must never delete, overwrite, or bulk-copy existing records, and
// must never touch a collection outside the feature it belongs to. (There is no '004' - see
// the removed StudentAccount backfill above for why.)
const migrations = [
  { name: '001-backfill-user-roles', run: backfillUserRoles },
  { name: '002-seed-departments', run: seedDepartments },
  { name: '003-verify-student-studentid-index', run: verifyStudentIndex },
  { name: '005-flag-legacy-capstone-data', run: flagLegacyCapstoneData },
  { name: '006-split-chosen-evaluators-per-component', run: splitChosenEvaluators },
];

main().catch((err) => {
  console.error('Migration run failed:', err);
  process.exit(1);
});
