// One-off, explicitly-run repair for unique+sparse indexes holding explicit nulls.
//
// Run with: npm run fix:sparse-nulls            (dry run - reports only, changes nothing)
//           npm run fix:sparse-nulls -- --apply (backs up the affected ids, then repairs)
//
// Why: a sparse unique index skips documents that LACK a field, but still indexes an
// explicit `null` - so only ONE document may hold null, and the next insert of another null
// fails with E11000 (e.g. "users index: googleId_1 dup key: { googleId: null }"). Until
// Sept 2026, User.googleId and StudentAccount.googleId defaulted to null, which broke
// capstone invites and adding students to groups. The models no longer default to null;
// this script cleans up documents written before that fix.
//
// Safety contract:
//  - Only touches fields of UNIQUE + SPARSE single-field indexes, found from the live index
//    list rather than hard-coded, so it covers every such field in the database.
//  - Only removes a field whose value is literally null ($type: 'null'). Removing it is
//    equivalent for the app (missing and null both read as "not set") and is what the
//    index expects. Real values are never touched.
//  - Each update re-checks `$type: 'null'` in its filter, so a document that changed after
//    the scan is left alone.
//  - --apply first writes the affected _ids to backups/ so the change can be audited.

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

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
  console.log(apply ? 'Mode: APPLY (will back up ids, then remove explicit nulls)\n' : 'Mode: DRY RUN (nothing will change)\n');

  // Scan every collection's unique+sparse single-field indexes for explicit nulls.
  const plan = [];
  for (const { name } of await db.listCollections().toArray()) {
    const collection = db.collection(name);
    for (const index of await collection.indexes()) {
      const fields = Object.keys(index.key);
      if (!index.unique || !index.sparse || fields.length !== 1) continue;
      const field = fields[0];
      const ids = await collection
        .find({ [field]: { $type: 'null' } })
        .project({ _id: 1 })
        .map((d) => d._id)
        .toArray();
      console.log(`${ids.length > 0 ? '!' : '-'} ${name}.${field} (${index.name}): ${ids.length} explicit null(s)`);
      if (ids.length > 0) plan.push({ collection: name, field, index: index.name, ids });
    }
  }

  if (plan.length === 0) {
    console.log('\nNothing to repair.');
    await mongoose.disconnect();
    return;
  }

  for (const entry of plan) {
    console.log(`\n${entry.collection}.${entry.field} - affected _ids:`);
    for (const id of entry.ids) console.log(`   ${id}`);
  }

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to remove these null fields.');
    await mongoose.disconnect();
    return;
  }

  const backupDir = path.join(process.cwd(), 'backups', `sparse-nulls-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(
    path.join(backupDir, 'affected.json'),
    JSON.stringify(
      plan.map((p) => ({ ...p, ids: p.ids.map(String), note: 'field was explicit null; removed with $unset' })),
      null,
      2
    )
  );
  console.log(`\nBacked up affected ids to ${backupDir}`);

  for (const entry of plan) {
    const result = await db.collection(entry.collection).updateMany(
      { _id: { $in: entry.ids }, [entry.field]: { $type: 'null' } },
      { $unset: { [entry.field]: '' } }
    );
    console.log(`+ ${entry.collection}.${entry.field}: removed null on ${result.modifiedCount} of ${entry.ids.length} document(s)`);
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
