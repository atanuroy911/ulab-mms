// One-off, explicitly-run cleanup of dead capstone-era collections.
//
// Run with: npm run cleanup:legacy            (dry run - reports only, changes nothing)
//           npm run cleanup:legacy -- --apply (backs up, then drops)
//
// This is deliberately NOT a migration in scripts/migrate.js. That runner is additive-only
// by contract and must never delete; dropping collections is a separate, deliberate,
// backed-up decision that a human triggers on purpose.
//
// Every collection targeted here is verified EMPTY before it is dropped. If any of them has
// grown documents since this script was written, the drop is refused for that collection -
// the script never destroys data, it only removes confirmed-empty husks.

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Each entry documents WHY it is dead, so this is auditable a year from now.
const TARGETS = [
  {
    name: 'capstonegroups',
    reason:
      'Legacy pre-rebuild capstone groups. Superseded by the rebuilt CapstoneGroup schema. ' +
      'Carries stale indexes from two different schema generations (courseId_1_groupNumber_1 ' +
      'from the original model, plus sessionId/track indexes from a brief period when the ' +
      'rebuilt model still pointed here). Dropping it lets the rebuilt model reclaim the ' +
      'clean default collection name with only its own indexes.',
  },
  {
    name: 'capstonemarks',
    reason:
      'Legacy capstone marks. Superseded by capstonemarksubmissions, which fixes the unique ' +
      'index bug (keyed on supervisorId instead of the actual submitter, so a second ' +
      'evaluator grading the same student silently collided). No model or code path targets ' +
      'this collection any more.',
  },
  {
    name: 'files',
    reason:
      'Orphaned. The StoredFile model writes to `storedfiles`; nothing reads or writes ' +
      '`files`. Left behind by an earlier upload implementation.',
  },
];

// Opt-in extra, behind --reclaim-name. Dropping this one is only correct when models/
// CapstoneGroup.ts is repointed at the plain 'capstonegroups' name in the SAME deploy -
// otherwise the app keeps writing to a collection this script just deleted. Kept separate
// from TARGETS so a routine cleanup can never trigger it by accident.
const RECLAIM_TARGET = {
  name: 'capstonegroups_v2',
  reason:
    'Transitional collection created only to dodge the stale indexes on `capstonegroups`. ' +
    'Once the legacy collection is gone that workaround is unnecessary and the model can ' +
    'move back to the plain `capstonegroups` name, letting Mongoose rebuild the correct ' +
    'indexes on next connect. Only meaningful while empty, i.e. before any real group exists.',
};

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0 && !line.trim().startsWith('#')) {
      const key = line.slice(0, i).trim();
      if (!process.env[key]) {
        process.env[key] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      }
    }
  }
}

async function main() {
  loadEnv();
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGODB_URI || process.env.MONGODB_URL;
  if (!uri) {
    console.error('Please set MONGODB_URI (e.g. in .env.local).');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  console.log(`Connected to "${db.databaseName}"`);
  console.log(apply ? 'Mode: APPLY (will back up, then drop)\n' : 'Mode: DRY RUN (nothing will change)\n');

  const reclaim = process.argv.includes('--reclaim-name');
  const targets = reclaim ? [...TARGETS, RECLAIM_TARGET] : TARGETS;
  if (reclaim) {
    console.log('--reclaim-name given: capstonegroups_v2 is included.');
    console.log('   Ensure models/CapstoneGroup.ts points at the plain name in the same deploy.\n');
  }

  const present = new Set((await db.listCollections().toArray()).map((c) => c.name));

  const backupDir = path.join(process.cwd(), 'backups', `legacy-drop-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const plan = [];

  for (const target of targets) {
    if (!present.has(target.name)) {
      console.log(`- ${target.name}: not present, nothing to do`);
      continue;
    }
    const count = await db.collection(target.name).countDocuments();
    if (count > 0) {
      // The whole safety contract of this script. A non-empty target means reality has
      // diverged from the assumption this cleanup was written under - refuse and let a
      // human look, rather than destroying records.
      console.log(`! ${target.name}: has ${count} document(s) - REFUSING to drop. Investigate before rerunning.`);
      continue;
    }
    console.log(`- ${target.name}: empty, eligible for drop`);
    console.log(`    why: ${target.reason}`);
    plan.push(target.name);
  }

  if (plan.length === 0) {
    console.log('\nNothing to drop.');
    await mongoose.disconnect();
    return;
  }

  if (!apply) {
    console.log(`\nDry run complete. ${plan.length} collection(s) would be dropped: ${plan.join(', ')}`);
    console.log('Re-run with --apply to perform the backup and drop.');
    if (!reclaim) {
      console.log('Add --reclaim-name to also include capstonegroups_v2 (see note in this file).');
    }
    await mongoose.disconnect();
    return;
  }

  // Back up even though every target is empty: the index definitions and the fact the
  // collection existed are themselves worth keeping a record of.
  fs.mkdirSync(backupDir, { recursive: true });
  for (const name of plan) {
    const docs = await db.collection(name).find().toArray();
    const indexes = await db.collection(name).indexes();
    fs.writeFileSync(
      path.join(backupDir, `${name}.json`),
      JSON.stringify({ collection: name, droppedAt: new Date().toISOString(), indexes, documents: docs }, null, 2)
    );
  }
  console.log(`\nBacked up ${plan.length} collection(s) to ${backupDir}`);

  for (const name of plan) {
    await db.collection(name).drop();
    console.log(`  dropped ${name}`);
  }

  console.log('\nCleanup complete.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
