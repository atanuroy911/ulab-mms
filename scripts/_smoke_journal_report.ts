// Throwaway smoke test: the journal report on the local dev server. GETs only.
import { readFileSync, writeFileSync } from 'fs';
import { SignJWT } from 'jose';
import { encode } from 'next-auth/jwt';
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('=');
  if (i > 0 && !process.env[line.slice(0, i).trim()]) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
const BASE = 'http://localhost:3000';
const SESSION = '6abbda00c813bb1a1b38e4cc';
const out = process.env.OUT!;
let fails = 0;
const ok = (c: boolean, m: string) => {
  console.log(c ? 'PASS' : 'FAIL', m);
  if (!c) fails++;
};

async function main() {
  const admin = `admin-token=${await new SignJWT({ type: 'admin', role: 'admin', mfa: true }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('10m').sign(new TextEncoder().encode(process.env.NEXTAUTH_SECRET))}`;
  const get = (path: string, cookie?: string) => fetch(BASE + path, cookie ? { headers: { cookie } } : {});
  const R = `/api/capstone/sessions/${SESSION}/journal-report`;

  ok((await get(R)).status === 401, 'no sign-in refused');
  ok((await get(`${R}?track=X`, admin)).status === 400, 'bad track refused');

  for (const [name, q] of [['all', ''], ['A', '?track=A']] as const) {
    const t = Date.now();
    const r = await get(R + q, admin);
    const html = await r.text();
    writeFileSync(`${out}/journal-${name}.html`, html);
    ok(r.status === 200 && html.includes('University of Liberal Arts Bangladesh') && html.includes('Weekly Journal Record'), `${name} renders (${(html.length / 1024).toFixed(0)} KB, ${Date.now() - t} ms, ${(html.match(/<section class="group">/g) || []).length} groups, ${(html.match(/<div class="member">/g) || []).length} students)`);
  }

  const { default: dbConnect } = await import('../lib/mongodb');
  await dbConnect();
  const { default: CapstoneGroup } = await import('../models/CapstoneGroup');
  const { default: User } = await import('../models/User');
  const { default: WeeklyJournalEntry } = await import('../models/WeeklyJournalEntry');
  const supervised = await CapstoneGroup.findOne({ sessionId: SESSION, supervisorId: { $ne: null } }).lean();
  const other = await CapstoneGroup.findOne({ sessionId: SESSION, _id: { $ne: supervised!._id }, supervisorId: { $ne: supervised!.supervisorId } }).lean();
  const sup = await User.findById(supervised!.supervisorId).lean<{ _id: unknown; name: string; email: string; roles: string[]; departmentId?: unknown }>();
  console.log('supervisor', sup?.name, 'group', supervised!.track, supervised!.groupNumber);

  const one = await get(`${R}?groupId=${supervised!._id}`, admin);
  const oneHtml = await one.text();
  writeFileSync(`${out}/journal-one.html`, oneHtml);
  ok(one.status === 200 && (oneHtml.match(/<section class="group">/g) || []).length === 1, 'single group');
  const sample = await WeeklyJournalEntry.findOne({ groupId: supervised!._id, submittedAt: { $ne: null } }).lean();
  if (sample) ok(oneHtml.includes('Recorded') && /\d{2} \w{3} \d{4}<br><span class="sub">\d{2}:\d{2}/.test(oneHtml), 'recorded date+time shown');

  const teacher = `next-auth.session-token=${await encode({
    token: { id: String(sup!._id), sub: String(sup!._id), name: sup!.name, email: sup!.email, roles: (sup!.roles || []).filter((r) => r !== 'admin' && r !== 'coordinator'), coordinatorDepartments: [] },
    secret: process.env.NEXTAUTH_SECRET!,
  })}`;
  const mine = await get(R, teacher);
  const mineHtml = await mine.text();
  writeFileSync(`${out}/journal-mine.html`, mineHtml);
  const n = await CapstoneGroup.countDocuments({ sessionId: SESSION, supervisorId: sup!._id });
  ok(mine.status === 200 && (mineHtml.match(/<section class="group">/g) || []).length === n, `supervisor gets only their ${n} group(s)`);
  if (other) ok((await get(`${R}?groupId=${other._id}`, teacher)).status === 403, "supervisor refused another supervisor's group");

  console.log(fails ? `${fails} FAILED` : 'all passed');
  process.exit(fails ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
