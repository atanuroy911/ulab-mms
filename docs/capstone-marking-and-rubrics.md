# Capstone Marking: xlsx Templates, Formulas, and Rubric Migration Notes

This documents what's actually inside `public/templates/capstone/` (which the app does not
read programmatically — see [capstone.md](capstone.md)) and how it compares to the in-app
`RubricTemplate` system, as groundwork for migrating the new report rubrics.

## Source files

| File | Role |
|---|---|
| `CSE 4098A Spring 2026.xlsx` | Live gradebook for CSE4098A (first capstone course) |
| `CSE 4098B Spring 2026.xlsx` | Live gradebook for CSE4098B (second/continuation course) |
| `Assessment Rubric for Report CSE4098A.docx` | New report rubric, 11 criteria, max 33 |
| `Assessment Rubric for Report CSE4098B.docx` | New report rubric, 14 criteria, max 42 |
| `Capstone 4098A/4098B Presentation Marking Summer 2026.pdf` | Presentation rubric sheet, 5 criteria, max 45 (both courses, near-identical) |
| `Weekly Journal_CSE4098 A, B, C and 499.docx` | Plain weekly log template — **not a scored rubric** |

## 1. Workbook structure (identical shape in both A and B files)

Six sheets per workbook, cross-referencing each other:

1. **`..._Grade`** — the roster and final grade
2. **`..._Report`** — report component detail (supervisor + evaluators)
3. **`..._Presentatio`** — presentation component detail (supervisor + evaluators)
4. **`CO_Report Evaluation` / `CO Report Evaluation`** — per-CO sub-scores (CO1–CO3) from Evaluator1/Evaluator2/Supervisor
5. **`CO_PO_Attainment_Analysis` / `CO-PO Attainment Analysis`** — maps assessment items → COs → POs, computes attainment
6. **`ContinuousQualityImprovement`** — CQI form, auto-pulls CO attainment %, states the improvement criterion and instructor's plan

### `..._Grade` sheet (per-student row)

| Column | Formula | Weight of Total |
|---|---|---|
| D `Report` | `=..._Report!AB<row>` | 40% |
| E `Presentation` | `=MIN(45, IF(..._Presentatio!<col><row>>1, <same>, <same>*45))` | 45% |
| F `Peer` | manual entry, 0–5 | 5% |
| G `Weekly Journal` | manual entry, 0–10 | 10% |
| H `Total` | `=SUM(D:G)` | 100 |
| I `Grade` | nested `IF` letter-grade bands on H |

Letter bands (both files share the same breakpoints from B down, only the top cutoff differs):

- **CSE4098A**: A+ ≥98, A ≥85, A- ≥80, B+ ≥75, B ≥70, B- ≥65, C+ ≥60, C ≥55, D ≥50, else F
- **CSE4098B**: A+ ≥95, A ≥85, A- ≥80, B+ ≥75, B ≥70, B- ≥65, C+ ≥60, C ≥55, D ≥50, else F

(The differing A+ cutoff, 98 vs 95, looks like an inconsistency between the two course files rather than an intentional policy — worth confirming with the department before encoding it anywhere.)

### `..._Report` sheet

- `D` = Supervisor's raw score, out of **33 (4098A)** / **42 (4098B)** — matches the rubric doc's criteria count × 3.
- `E` (Supervisor Marks, 40%-scale) = `ROUND(40 * D / 33_or_42, 2)`
- One column per assigned evaluator, raw score same scale as D
- `AA` (Evaluator Marks, 40%-scale) = `ROUND(40 * AVERAGE(all evaluator columns) / 33_or_42, 2)` — averages across however many evaluators actually scored (blank cells excluded by `AVERAGE`)
- `AB` (Total, feeds Grade!D) = `ROUND(E*60% + AA*40%, 2)` — **supervisor is weighted 60%, evaluator average 40%**, within the Report component

### `..._Presentatio` sheet

Same shape as Report, but raw scale is **45** for both courses:

- `E` = `(50 * SupervisorRaw) / 45`
- `Z` (4098A) / `Y` (4098B) = `(50 * AVERAGE(evaluator columns)) / 45`
- Total = `ROUND(E*60% + Z(or Y)*40%, 2)` — again 60/40 supervisor/evaluator split
- The Grade sheet then clamps this via `MIN(45, ...)`, and defensively multiplies by 45 if the value looks like it's still a 0–1 fraction (`IF(value>1, value, value*45)`) — a guard against a formula-copy mistake, not a real branch in normal use.

### `CO_Report Evaluation` sheet

Independent of the raw report total — tracks CO1/CO2/CO3 sub-scores contributed by Evaluator 1, Evaluator 2, and Supervisor separately, then:

```
Final_CO_n = (Evaluator1_CO_n + Evaluator2_CO_n + Supervisor_CO_n) / 3
```

This feeds `CO_PO_Attainment_Analysis`, not the student's numeric grade.

### `CO_PO_Attainment_Analysis` sheet

- Maps each assessment item (Report, Peer, Term Final Presentation, Weekly Journal, …) to the COs it contributes marks toward, and maps each CO to the POs it maps to (a 0/1 matrix).
- Computes, per student per CO, whether they cleared the threshold, then aggregates to a class-level attainment percentage per CO.

### `ContinuousQualityImprovement` sheet

- Pulls course metadata (`Course Code`, `Credit`, `Number of Students = ..._Grade!$H$103`) and per-CO attainment from `CO_PO_Attainment_Analysis`.
- States the criterion: **"60% of the students to achieve 55% of the allocated mark"**.
- `CO attainment = (count of students meeting the criterion for CO_n) / (total students)`.
- Free-text fields for the instructor's improvement plan.

### Combined formula (informally)

```
Total = 0.40 × [0.60×(SupReport/ReportMax) + 0.40×(AvgEvalReport/ReportMax)] × 100
      + 0.45 × [0.60×(SupPresentation/45)   + 0.40×(AvgEvalPresentation/45)] × 100
      + Peer(0–5)
      + WeeklyJournal(0–10)
```
where `ReportMax` is 33 for 4098A, 42 for 4098B.

## 2. The new report rubric docs — full criteria

### CSE4098A Report Rubric — 11 criteria, max 33 (matches `..._Report!D` scale)

Each scored **0 (No/wrong answer) / 1 (Poor) / 2 (Satisfactory) / 3 (Excellent)**:

1. Abstract
2. Background Literature `[CO1]`
3. Problem statement `[CO1]`
4. Objective & Significance of the study `[CO1]`
5. Scope & Limitation `[CO1]`
6. Tools `[CO1]`
7. Literature Review & Analysis `[CO2]`
8. Requirements, Task Distribution, and Budgets `[CO3]`
9. Conclusion
10. References & Citations
11. Communication (Spelling, Grammar, Punctuation, and Plagiarism)

### CSE4098B Report Rubric — 14 criteria, max 42 (matches `..._Report!D` scale)

1. Abstract, Background Literature, Problem statement, Objective & Significance, Scope & Limitation *(combined into one row)*
2. Literature Review `[CO1]`
3. Identification of Performance Evaluation Criterion `[CO1]`
4. Literature Analysis `[CO2]`
5. Project Management and Financial Activity `[CO3]`
6. Usage of Modern Tools `[CO4]`
7. Design the Solution `[CO5]`
8. Implement the Solution `[CO6]`
9. Investigate the Experimental Result `[CO6]`
10. Societal, health, safety, legal and cultural aspects `[CO7]`
11. Environment and sustainability `[CO8]`
12. Ethical and professional principles `[CO9]`
13. Conclusion
14. References & Citations, Spelling, Grammar, Punctuation and Plagiarism

**Note**: the docx table has some visually duplicated rows from merged cells in the original Word table — the counts above (11 and 14) are the de-duplicated criteria, and they match the xlsx "Provided in Rubrics: 33 / 42" labels exactly, confirming these are the authoritative, current rubrics behind the report scores.

### Presentation rubric (PDF, both courses) — 5 criteria, max 45

Scored **0 / 3 / 6 / 9** (equivalent to level 0–3 × 3):

1. Presentation Skills (Eye contact, Language, Visual aid)
2. Organization of the Presentation Material *(tagged `[CO5:A1]` in 4098A)*
3. Contents
4. Question Answer *(tagged `[CO11:A2]` in 4098B instead)*
5. Time Management

This is effectively identical to the system's existing built-in `PRESENTATION_CRITERIA` in [lib/rubricSeed.ts](../lib/rubricSeed.ts) — no migration needed for presentation, it already exists.

### Weekly Journal doc

Not a rubric — a log template (Week / Date range / Work Done / Supervisor Evaluation-Comments / Signature). The 0–10 mark in the gradebook is a direct supervisor judgment call, not derived from scored criteria.

## 2b. Peer and Weekly Journal marking in the xlsx and in the app

**In the xlsx**: confirmed by inspecting every cell in `..._Grade!F` (Peer) and `..._Grade!G` (Weekly Journal) across all ~83 (4098A) / ~68 (4098B) student rows — **no formulas, no backing rubric sheet**. Both are flat, manually-typed numbers:

- Peer: observed range 0–5 (max 5, matching the "Peer (5%)" header)
- Weekly Journal: observed range 4–10 (max 10, matching the "Weekly Journal (10%)" header)

Only the supervisor enters these (the workbook has no per-evaluator columns for either, unlike Report/Presentation which split supervisor/evaluator 60/40). There's no peer-review matrix (students rating each other) anywhere in the workbook — "Peer" here is the supervisor's single mark for the student's contribution to the group, not a peer-evaluation survey.

**In the app**, both categories have **two different entry points that don't agree on scale**:

1. **Group-based flow** (the one actually linked from the category page, `.../peer/group/[groupId]` and `.../weekly-journal/group/[groupId]`) — correctly caps input client-side (`Math.max(0, Math.min(5, num))` for peer, `min(10, ...)` for weekly journal) and posts to the dedicated [`submit-peer-marks`](../app/api/capstone/submit-peer-marks/route.ts) / [`submit-marks`](../app/api/capstone/submit-marks/route.ts) routes, which enforce group membership but **do not re-validate the 5/10 ceiling server-side**.
2. **Flat student-list flow** ([`peer/page.tsx`](../app/capstone/supervisor/%5Bsemester%5D/%5Bcategory%5D/peer/page.tsx), [`weekly-journal/page.tsx`](../app/capstone/supervisor/%5Bsemester%5D/%5Bcategory%5D/weekly-journal/page.tsx)) — lets any signed-in supervisor pick from **all students in the system** (not scoped to their group), labels the field "Marks (0-100)", validates only `0 ≤ marksNum ≤ 100`, and posts through the generic [`POST /api/capstone`](../app/api/capstone/route.ts) route instead of the dedicated ones.

Both flows are still reachable in the UI (the group flow via "Submit Marks" buttons on the groups list embedded in the same page as the flat list). So today it's possible to record a Peer or Weekly Journal mark as high as 100 through the second flow, even though the xlsx and the group-flow's own client-side cap treat 5 and 10 as the real ceilings — and `CapstoneMarks` schema-level validation (`models/CapstoneMarks.ts`) allows up to 100 for every mark field regardless of category, so nothing in the backend catches this. Worth deciding whether the flat-list flow should be removed/fixed or is intentionally a legacy/alternate path.

## 3. Current in-app rubric system vs. these new rubrics

[models/RubricTemplate.ts](../models/RubricTemplate.ts):

- **Hard-coded to exactly 5 criteria** (`validator: v.length === 5`, keys fixed to `c1`..`c5`).
- Each criterion has exactly 4 level descriptions (0–3).
- Enforced both on create (`POST /api/admin/rubrics`) and update (`PUT /api/admin/rubrics/[id]`, [route.ts](../app/api/admin/rubrics/%5Bid%5D/route.ts) line 35: `criteria.length !== 5` → 400).
- Scoring formula ([app/utils/projectRubric.ts](../app/utils/projectRubric.ts)): `Σ (score_i/3) × (totalMarks/5)` for `i in 1..5` — the `/5` is hardcoded, not derived from `criteria.length`.
- Currently used for **Project/exam** marking only (`Exam.rubricTemplateId`), via `RubricManagement.tsx` in the admin dashboard. Not currently wired to capstone at all — capstone marking (`CapstoneMarks`) has no `rubricTemplateId` field and no rubric-driven scoring; supervisors/evaluators just type a raw number into `supervisorMarks`/`evaluatorMarks`/etc.
- Two built-in (`isSystem: true`) templates are seeded on every GET: `complex-engineering` (5 criteria, from `RUBRIC_CRITERIA`) and `presentation` (5 criteria, matches the capstone presentation PDF).

**Why the report rubrics don't fit as-is**: they have 11 and 14 criteria respectively, not 5, and their raw max (33, 42) is a direct function of criterion count × 3 — the model, the admin UI (`RubricManagement.tsx`), and the scoring formula (`/5`) would all need to generalize from "exactly 5" to "N criteria" to represent them faithfully. Forcing them into 5 buckets would lose the criterion-level granularity that supervisors/evaluators currently see and would misrepresent the 33/42-point scale baked into the live xlsx gradebooks.

**Also not yet modeled anywhere in the app**: the 60/40 supervisor/evaluator split within each component, the component weights (Report 40% / Presentation 45% / Peer 5% / Weekly Journal 10%), the letter-grade bands, and the CO/PO attainment machinery (CO_Report Evaluation, CO_PO_Attainment_Analysis, CQI). All of that currently lives only in the xlsx formulas — `CapstoneMarks` only auto-computes `finalMarks = avg(supervisorMarks, evaluatorMarks)` when both are present, which is a different (and much simpler) formula than what the xlsx actually does.

## Open questions before implementing a migration

1. Should `RubricTemplate` be generalized to N criteria (schema + admin UI + `calculateProjectMark`), or should capstone report rubrics live in a separate model given they're structurally different from the Project rubric use case (different weight-per-item math, tied to CO tags per criterion)?
2. Should the capstone components (Report/Presentation/Peer/Weekly Journal weights, the 60/40 supervisor/evaluator split, and the letter-grade bands) be encoded in the app at all, or does the xlsx remain the source of truth and the app stays a raw-marks store?
3. Is the CSE4098A vs CSE4098B differing A+ cutoff (98 vs 95) intentional or a copy-paste inconsistency to fix before encoding it anywhere?
4. Does CO/PO attainment tracking belong on the roadmap, or is that explicitly out of scope for now?
