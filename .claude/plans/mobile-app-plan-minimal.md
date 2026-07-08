# ULAB MMS Mobile App — Student Edition (Phase 1)

## Status
- Teacher/instructor side: **not started, deferred**. Nothing in this plan builds it.
- Student side: **this is the build target**.
- This revision replaces the earlier draft, which assumed native Android
  Google Sign-In. Corrected direction: **no mobile OAuth client** — the app
  hands off to the existing web check-in flow instead. See below.

## Decision: No native Google Sign-In on Android

Two options were on the table for attendance check-in:

1. **Native Google Sign-In in the app** — requires registering a separate
   Android OAuth client (SHA-1 fingerprint) in Google Cloud Console, and
   duplicating the identity-resolution/name-matching logic that already
   lives in `app/api/attendance/checkin/route.ts` into a new mobile-specific
   endpoint.
2. **Open the existing web check-in page in Chrome Custom Tabs** — the app's
   only job is to scan the QR and launch the real check-in URL. Google OAuth,
   the "@ulab.edu.bd" restriction, the "Is this you?" name confirmation, and
   the anti-replay session-timestamp check all run exactly as they do today
   on web, unmodified.

**Decision: Option 2.** Confirmed with the user — no mobile OAuth setup
exists or is wanted, and the QR-scan requirement is specifically to prevent
cheating (proving the student is physically in the room), not to gate a
login. Chrome Custom Tabs is a real browser context (not an embedded
WebView), so Google's OAuth policy blocking WebView sign-in doesn't apply
here — this is not a workaround, it's how Google expects OAuth to be
launched from a native app.

### What this means for scope
- **Zero backend changes needed for check-in.** The `checkIn(sessionCode)`
  GraphQL mutation built earlier doesn't match reality and is now simply
  **unused** — it can stay dead in the schema for now or be deleted; either
  way nothing in this plan depends on it.
- The app never handles a Google token, never stores a student JWT for
  identity, never talks to `/api/graphql` for check-in at all.
- **Confirmed (`app/course/[id]/components/AttendanceView.tsx:175-180`):** the
  QR encodes a **static, reusable URL** —
  `https://<domain>/attendance/checkin/{courseId}?attendance=1` — with no
  session ID or timestamp in it. It's the same QR every class; whether a scan
  actually checks someone in depends entirely on whether the course has an
  *open* session at scan time, enforced server-side by the check-in page/API
  (`app/api/attendance/checkin/route.ts`, `AttendanceSession.open`). So the
  anti-cheating property isn't "the QR changes each class" — it's "you have
  to be scanning during the live window the instructor opens," combined with
  the Google-identity confirmation. Good news for the app: the QR payload is
  as simple as it gets — just the course check-in URL, decode it and open it
  in a Custom Tab, nothing else to parse.

## What the app actually does (revised)

1. **QR Scanner screen** (camera) — scans the QR the instructor displays.
2. **Launch Chrome Custom Tab** with the scanned URL. Student completes
   Google sign-in + confirmation entirely in that tab, exactly like today's
   web experience on a phone browser.
3. Custom Tab closes (or student backs out) → back in the app.
4. **Courses, marks & attendance stats screens** — public, roll-number-keyed
   lookups with no auth requirement, mixing REST and GraphQL (both already
   support this pattern, both unauthenticated by design here):
   - `studentCourses(studentId)` — GraphQL, for the course list (see Open
     Question 1)
   - `GET /api/student/marks?studentId=...` — REST, for marks per course
   - `GET /api/student/attendance/[courseId]?studentId=...` — REST, for
     attendance stats (equivalent GraphQL queries `myAttendanceStats`/
     `studentAttendanceStats` also exist)
   Student types their student ID once (or the app remembers it locally,
   plain `SharedPreferences` — it's not a secret, it's a roll number). No
   token, no login screen, no further backend work required — this is
   functionally a native wrapper around `/student/check-marks` and
   `/student/check-attendance`.

This makes the mobile app close to a **thin native shell**: QR scan → browser
handoff for check-in, plus two simple lookup screens for marks/attendance
that hit existing public REST endpoints.

## Included (Phase 1)
1. QR scanner (camera permission, scan → parse URL)
2. Chrome Custom Tabs launch for check-in
3. "My Courses" list — needs a new lightweight lookup since there's no login
   (see Open Question 1 below)
4. Marks per course (reuses `/api/student/marks`)
5. Attendance stats per course (reuses `/api/student/attendance/[courseId]`)
6. Remember last-used student ID locally so it's not re-typed every time

## Explicitly excluded (Phase 1)
- Any teacher/instructor feature
- Capstone, resources, admin
- Native Google Sign-In / mobile OAuth client
- The GraphQL `checkIn` mutation (superseded by Custom Tabs handoff)
- Push notifications, offline mode, dark mode, biometrics

## Screen Flow

```
[Splash] → [Enter/confirm Student ID once] (cached locally)
                    ↓
        ┌───────────┴────────────┐
        ↓                        ↓
 [Scan QR → Custom Tab]   [My Courses] (from /api/student/marks lookup)
   (opens web check-in,          ↓
    unmodified)          [Marks] / [Attendance stats]
```

## Open Questions

1. ~~"My Courses" list has no dedicated endpoint~~ — **resolved**. Added a
   public `studentCourses(studentId: String!): [Course!]!` GraphQL query
   (`lib/graphql/schema.ts`, `lib/graphql/resolvers/course.ts`) instead of a
   new REST route, since GraphQL is already wired up and this keeps mobile on
   one API surface. It follows the same no-auth, roll-number-lookup pattern
   as the existing public `/api/student/marks` REST endpoint: looks up
   `Student` records by `studentId` (case-insensitive), then returns the
   distinct `Course`s those records belong to. The Android app calls this
   once for the course list, then `myMarks`/`studentAttendanceStats` per
   course as needed — no need to derive courses from the marks payload.
2. ~~QR payload confirmation~~ — **resolved**, see above: static
   `/attendance/checkin/{courseId}?attendance=1` URL, no per-session data.

## Timeline

| Phase | Scope | Duration |
|---|---|---|
| 0 | Decide 1(a) vs 1(b) course-list approach (QR format already confirmed) | 0.5 day |
| 1 | Android project setup: Compose, camera/QR lib (ML Kit or ZXing), Custom Tabs | 2–3 days |
| 2 | QR scan → Custom Tab handoff | 1–2 days |
| 3 | Student ID entry/caching, courses + marks screens | 2–3 days |
| 4 | Attendance stats screen | 1–2 days |
| 5 | Polish, error states, testing | 2–3 days |

**Total: ~2–2.5 weeks** — significantly shorter than the earlier OAuth-based
plan, since there's no backend auth work and no mobile OAuth client to
provision.

## Why this is better than the earlier plan
- No new attack surface: identity/OAuth logic is not duplicated into a
  second (mobile) code path that could drift from web or be implemented
  less carefully.
- No Google Cloud Console setup blocking the start of development.
- Directly reuses the anti-cheating mechanism (QR + live session timestamp
  check) that's already correct on web, instead of re-deriving it.
- Smaller, faster to ship, easier to reason about.

## Next Step
Decide 1(a) vs 1(b) for the course list (recommend 1(a): derive from the
existing `/api/student/marks` response, no new endpoint), then start Phase 1
(Android project setup). No backend work is required before starting.
