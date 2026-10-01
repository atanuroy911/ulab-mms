# [1.29.0](https://github.com/atanuroy911/ulab-mms/compare/v1.28.0...v1.29.0) (2026-10-01)


### Bug Fixes

* **capstone:** 'Sessions' links show the sessions list - an open session follows ?session= in the address ([17ddb0e](https://github.com/atanuroy911/ulab-mms/commit/17ddb0e22bc7d696dc9b34ad5e6525044b81812d))
* **capstone:** Back from marks/grades returns to the session; Simple view shows cached status at once with placeholders; new screens start at the top ([4c0ab1e](https://github.com/atanuroy911/ulab-mms/commit/4c0ab1e82b02058e8f9f664e5bdb516c176def87))
* **capstone:** inline edit/delete buttons on journal week tiles ([8539dc8](https://github.com/atanuroy911/ulab-mms/commit/8539dc8c36278f61118c6dcc969f73ce58b341c3))
* **capstone:** make journal PDF export button visible + fix JSX nesting ([b7e55ee](https://github.com/atanuroy911/ulab-mms/commit/b7e55ee41841f8731d2fa3f6d45e29507a31c1ad))
* **capstone:** setting the first supervisor of a group failed ('Cast to ObjectId ... "null"') and never emailed them ([73031e9](https://github.com/atanuroy911/ulab-mms/commit/73031e91e33f20b5e49b0f0121c1acb23e83e863))
* **student:** quick exams list, intro and results inside the portal layout like every other page ([cb6a959](https://github.com/atanuroy911/ulab-mms/commit/cb6a959652ad1fe2159ded4da60824db673e2268))


### Features

* **admin:** act as a student with write access for testing - Developer setting (off by default), 10 minutes, red banner, every change logged, never signs the admin out ([b36258a](https://github.com/atanuroy911/ulab-mms/commit/b36258a21126045cbd5a69e2773d5b11cd344c63))
* **admin:** view the student portal as any student - read-only, 30 minutes, verified admins only, every student write refused ([802f8f9](https://github.com/atanuroy911/ulab-mms/commit/802f8f96e29cf103fb61b6064473b36a80a12685))
* **capstone:** Simple mode carries through - simple Groups, step-by-step Enter marks, plain Grades; one Simple/Advanced choice for every session screen ([508011b](https://github.com/atanuroy911/ulab-mms/commit/508011b22d43b4afb4ee8416f1e2265e3cbcea65))
* **capstone:** Simple mode for sessions - stage, next step and six big buttons for the essentials; Advanced keeps everything ([c9c2391](https://github.com/atanuroy911/ulab-mms/commit/c9c2391329483ff73a3e16d3fbf3755f6d0df893))
* **capstone:** weekly journal PDF export + supervisor edit/delete of entries ([2ae5514](https://github.com/atanuroy911/ulab-mms/commit/2ae55149a75bed521e4c5b3885fbe2ed7ea35279))
* help people who get lost - 'Suggested here' in search, 'did you mean' for everyday words and typos, a helpful not-found page; newer features searchable ([c17af34](https://github.com/atanuroy911/ulab-mms/commit/c17af34d400542493cb476a04d7f4a9a938aee37))
* **student:** capstone journal in the portal - week strip at a glance (tap to write, edit or read), supervisor 'not assigned yet', '(you)' marker, guide only until the first entry ([e3978c6](https://github.com/atanuroy911/ulab-mms/commit/e3978c6478f1fbe511fe240d503d7f39fc0b5fcb))
* **student:** students can rename their project in any track until the session is finished ([f6184e1](https://github.com/atanuroy911/ulab-mms/commit/f6184e1634a0f83a009dcd07b9ac8e9ab31099eb))

# [1.28.0](https://github.com/atanuroy911/ulab-mms/compare/v1.27.0...v1.28.0) (2026-10-01)


### Features

* capstone course file - each sheet as its own PDF, for the whole track, one group or one student; grade and CO-attainment charts; follows the grading scheme ([71df9eb](https://github.com/atanuroy911/ulab-mms/commit/71df9ebe2a787b878e2c687ef5575110571a60f5))
* **capstone:** calmer session screen - 4 controls instead of 10: the stage's main action, Grades, one Print & export menu, and a More menu ([dc26aef](https://github.com/atanuroy911/ulab-mms/commit/dc26aef7dd3edd6d1928555742ecd6786f18d707))
* People & Emails - email coverage, everyone as CSV, paste ID/email lists to fill gaps ([8d76960](https://github.com/atanuroy911/ulab-mms/commit/8d76960094e82f393e053425bed196045ab8bbca))
* student notifications - every message in the portal bell, emailed when an address is known; quick exam, capstone start and project-group announcements ([b7b4d39](https://github.com/atanuroy911/ulab-mms/commit/b7b4d39a850c764fc079ac8b559dc2c15a5e3727))

# [1.27.0](https://github.com/atanuroy911/ulab-mms/compare/v1.26.0...v1.27.0) (2026-10-01)


### Bug Fixes

* **security:** GraphQL - owner/enrolment checks on every course and attendance query, audience-bound tokens, login rate limit, no introspection in production ([6f370cc](https://github.com/atanuroy911/ulab-mms/commit/6f370cc74dc564d8ec3372ecced4f13845247e45))


### Features

* authenticator 2FA for the shared admin login; 2FA-verified sessions can grant roles ([773b221](https://github.com/atanuroy911/ulab-mms/commit/773b2219999c81b2349edff906ad0f4c2bfd1d0a))
* capstone grade reports - individual (every term), group results and full grade sheet, printable ([ad0ee1c](https://github.com/atanuroy911/ulab-mms/commit/ad0ee1cd14e0c56d571af76c77b57e79ac4c0d74))
* group list export (.xlsx) in the department's layout, and a Reports menu for sessions ([3263960](https://github.com/atanuroy911/ulab-mms/commit/3263960cd7dda5226667a2e98010d929772448ea))
* personal authenticator 2FA for every teacher - asked on password and GraphQL sign-in, admin reset for lost phones ([1aaebf0](https://github.com/atanuroy911/ulab-mms/commit/1aaebf022abdf3f5592a1eb5e65e5054e94afee7))
* redesigned project group page - next-step panel, teammate search, confirmations, class progress ([7c44407](https://github.com/atanuroy911/ulab-mms/commit/7c444077930326f118fab6d512f72c0eca9d19cf))
* student portal - home, my courses (current and past), read-only course marks, attendance and project group ([3e490fe](https://github.com/atanuroy911/ulab-mms/commit/3e490feb2c75f0ca870ea9485bff43aae4b9eb8b))

# [1.26.0](https://github.com/atanuroy911/ulab-mms/compare/v1.25.0...v1.26.0) (2026-09-29)


### Features

* redesigned student quick exam screens - clearer list, rules checklist, mark for review, submit summary, score review ([3d48e80](https://github.com/atanuroy911/ulab-mms/commit/3d48e8079a8122775937a1e86bac72c4469b4127))

# [1.25.0](https://github.com/atanuroy911/ulab-mms/compare/v1.24.0...v1.25.0) (2026-09-29)


### Features

* open next semester's session from the move-on wizard; fix: reuse an inactive semester, send poster marks to the marks tab ([f259231](https://github.com/atanuroy911/ulab-mms/commit/f2592313d38ad4729963c280b7c4a78f5bbb7459))

# [1.24.0](https://github.com/atanuroy911/ulab-mms/compare/v1.23.0...v1.24.0) (2026-09-29)


### Features

* simple marks mode for teachers, link or remove name-only evaluators from imported workbooks ([27208bd](https://github.com/atanuroy911/ulab-mms/commit/27208bd20145cc5198978cb242727105191f203f))

# [1.23.0](https://github.com/atanuroy911/ulab-mms/compare/v1.22.0...v1.23.0) (2026-09-29)


### Features

* past-semester imports - groups without a supervisor, name-only evaluators, recorded CO marks ([efd1402](https://github.com/atanuroy911/ulab-mms/commit/efd140238cbf5ecef2ac91b3976daff3cf873c53))

# [1.22.0](https://github.com/atanuroy911/ulab-mms/compare/v1.21.0...v1.22.0) (2026-09-29)


### Features

* editable grading scheme descriptions and a one-line breakdown on scheme cards ([d4e0be8](https://github.com/atanuroy911/ulab-mms/commit/d4e0be8903655259fa14b12a1253f5a4f058def2))

# [1.21.0](https://github.com/atanuroy911/ulab-mms/compare/v1.20.0...v1.21.0) (2026-09-29)


### Features

* scheme summary in plain words, quick exam attendance, tidier panels ([43c6a7b](https://github.com/atanuroy911/ulab-mms/commit/43c6a7b41200fb146b02282a7cdb9e0fb1535179))

# [1.20.0](https://github.com/atanuroy911/ulab-mms/compare/v1.19.0...v1.20.0) (2026-09-29)


### Features

* Quick Exam (beta) - pasted MCQs, taken signed in, marked instantly ([67131f3](https://github.com/atanuroy911/ulab-mms/commit/67131f3c55253bca1c74f7bf27d36f40a780291f))

# [1.19.0](https://github.com/atanuroy911/ulab-mms/compare/v1.18.0...v1.19.0) (2026-09-26)


### Features

* CSE 4098C grading - report rubric, poster, per-track schemes ([9c96114](https://github.com/atanuroy911/ulab-mms/commit/9c9611464b63090cd2ad94ff9bf8d2309d9c1ca1))

# [1.18.0](https://github.com/atanuroy911/ulab-mms/compare/v1.17.0...v1.18.0) (2026-09-26)


### Features

* capstone stages, coordinator marks tools, evaluator selection ([fab2351](https://github.com/atanuroy911/ulab-mms/commit/fab235157f3fd598838935bba31d651d683d2f85))

# [1.17.0](https://github.com/atanuroy911/ulab-mms/compare/v1.16.0...v1.17.0) (2026-09-25)


### Features

* magical changes ([9c8e873](https://github.com/atanuroy911/ulab-mms/commit/9c8e873b7017caad1f97a2f3298e316fb6377963))

# [1.16.0](https://github.com/atanuroy911/ulab-mms/compare/v1.15.0...v1.16.0) (2026-09-24)


### Features

* scheme-driven capstone marking, coordinator sheet entry, dev testing access ([8f340b3](https://github.com/atanuroy911/ulab-mms/commit/8f340b3d539c2c4cad8ef48b79ad9f5d18673da9))

# [1.15.0](https://github.com/atanuroy911/ulab-mms/compare/v1.14.1...v1.15.0) (2026-09-23)


### Features

* role-aware global search and UX consistency fixes ([1662ea9](https://github.com/atanuroy911/ulab-mms/commit/1662ea94aac0e91b3b7c38c0f1c2723ec84d6e77))

## [1.14.1](https://github.com/atanuroy911/ulab-mms/compare/v1.14.0...v1.14.1) (2026-08-31)


### Bug Fixes

* class monitor remove fix ([c3f900d](https://github.com/atanuroy911/ulab-mms/commit/c3f900db1cebc2f695ddaf4f9ab8267204ee1134))

# [1.14.0](https://github.com/atanuroy911/ulab-mms/compare/v1.13.1...v1.14.0) (2026-08-30)


### Bug Fixes

* **export:** correct CourseSummary auto-fill and Lab final-exam matching ([1f6b8a3](https://github.com/atanuroy911/ulab-mms/commit/1f6b8a35890739c19c51fde3ec6b43f02e80ad25))
* **marks:** remove add-marks-via-dictation feature ([487da57](https://github.com/atanuroy911/ulab-mms/commit/487da572791455cfc74bd38fb95e4ad3885f84fa))
* **security:** derive mark courseId from the verified exam instead of the request body ([980c475](https://github.com/atanuroy911/ulab-mms/commit/980c47560d83fc4a2f528a9c21ab68ee28054220))
* **security:** escape user input interpolated into MongoDB regex queries ([6684c8e](https://github.com/atanuroy911/ulab-mms/commit/6684c8e030dcfe043ae72456fbf1dca800b36a38))
* **security:** restrict capstone mark submission to the group's assigned graders ([bfc4c9a](https://github.com/atanuroy911/ulab-mms/commit/bfc4c9a9e20ed8df08ad4cd4c21695cc9ab14dc7))
* **urms:** compute grade totals via the real aggregation logic ([b16da32](https://github.com/atanuroy911/ulab-mms/commit/b16da32b2c2bada034cc20788096371de8aed5fe))


### Features

* **attendance:** add per-date Randomize action ([2be0525](https://github.com/atanuroy911/ulab-mms/commit/2be05258d9b36569dbfb50997bdfbb610d6754db))
* **attendance:** show withdrawn students and cap missed-class projection ([5d54889](https://github.com/atanuroy911/ulab-mms/commit/5d54889720b4471c7c7bfa6223e014bd5cc33589))
* **marks:** add Grace bonus-marks workflow ([194e040](https://github.com/atanuroy911/ulab-mms/commit/194e0400c3018ba6d7a2930776d8b4acec0263eb))
* **marks:** add per-category highest/lowest/average statistics ([812ac22](https://github.com/atanuroy911/ulab-mms/commit/812ac22be047eda1a5bff44f429b4524b0fac24d))
* **project:** add bulk Combined-CO actions and fix concurrent-save errors ([57c5e32](https://github.com/atanuroy911/ulab-mms/commit/57c5e32545afe7f3dee6de9c2ed733a15b0490bc))
* **project:** expand/collapse Group column and move actions to a menu ([d9500b4](https://github.com/atanuroy911/ulab-mms/commit/d9500b482ccaa3b3614b97ae7e83b864cbb28bea))
* **students:** add Midterm/Final/Attendance/Performance columns ([ea7a746](https://github.com/atanuroy911/ulab-mms/commit/ea7a746e65f5a85a461912835afec5b7b7787dc8))
* **students:** redesign Students tab into a compact roster ([cde0dda](https://github.com/atanuroy911/ulab-mms/commit/cde0ddacf7f86466c37647143b348c67dccda2c6))
* **ui:** add explanatory tooltips to disabled and icon-only buttons ([c7fddef](https://github.com/atanuroy911/ulab-mms/commit/c7fddefb67f5d0e6f1cad84d65e4d27cfb3ae2c8))

## [1.13.1](https://github.com/atanuroy911/ulab-mms/compare/v1.13.0...v1.13.1) (2026-08-30)


### Bug Fixes

* CO PO File update again ([165a533](https://github.com/atanuroy911/ulab-mms/commit/165a5334e443cf47be0aa4fcbfa4f38fd238ad3f))

# [1.13.0](https://github.com/atanuroy911/ulab-mms/compare/v1.12.0...v1.13.0) (2026-08-30)


### Features

* lots of changes again ([8aa57db](https://github.com/atanuroy911/ulab-mms/commit/8aa57db1079cf9a8579dc044b8a62958261d2ab2))

# [1.12.0](https://github.com/atanuroy911/ulab-mms/compare/v1.11.0...v1.12.0) (2026-08-30)


### Features

* lots of changes to co po files ([a54eaa4](https://github.com/atanuroy911/ulab-mms/commit/a54eaa430049a20fe85538378a1da5d132ba5600))

# [1.11.0](https://github.com/atanuroy911/ulab-mms/compare/v1.10.0...v1.11.0) (2026-08-29)


### Features

* exam settings from marks columns, split CO-PO save, multi-column bulk paste/import, marks stats, and layout fixes ([185d299](https://github.com/atanuroy911/ulab-mms/commit/185d29921be57cd1aa916d070db8dd98b393bcdd))

# [1.10.0](https://github.com/atanuroy911/ulab-mms/compare/v1.9.1...v1.10.0) (2026-08-20)


### Bug Fixes

* marks tab ui fix + attendance fix ([5ba4e1b](https://github.com/atanuroy911/ulab-mms/commit/5ba4e1bb4d2addf7457a51ca709bc6672cadc7f0))


### Features

* CO for project ([85dfc28](https://github.com/atanuroy911/ulab-mms/commit/85dfc282b5fd16c403f6598f8103d250bc6ffad2))

## [1.9.1](https://github.com/atanuroy911/ulab-mms/compare/v1.9.0...v1.9.1) (2026-08-17)


### Bug Fixes

* UI Overhaul continuing ([2dde7f5](https://github.com/atanuroy911/ulab-mms/commit/2dde7f5a9755233e78b07434101797a3c472b31f))

# [1.9.0](https://github.com/atanuroy911/ulab-mms/compare/v1.8.1...v1.9.0) (2026-08-16)


### Features

* new stuff and ui changes ([0fdcc61](https://github.com/atanuroy911/ulab-mms/commit/0fdcc61e332dba2f9520af02b8bdc777e9752021))

## [1.8.1](https://github.com/atanuroy911/ulab-mms/compare/v1.8.0...v1.8.1) (2026-07-28)


### Bug Fixes

* CLA label fixes + student check marks fix ([c8af513](https://github.com/atanuroy911/ulab-mms/commit/c8af513a68cca1a7923fba8758cf2a947f1b5999))

# [1.8.0](https://github.com/atanuroy911/ulab-mms/compare/v1.7.0...v1.8.0) (2026-07-27)


### Bug Fixes

* drop "Signature:" label above instructor name, just a dash line ([180af62](https://github.com/atanuroy911/ulab-mms/commit/180af62cd91f955ace9b9edfdf84c98a71fdb5e6))
* fixed course file. remove modern pdf. fix alpha co po file ([53eacd5](https://github.com/atanuroy911/ulab-mms/commit/53eacd516bbdcc91962cb74afefe26141467b528))
* grades hidden button fix ([ecb449e](https://github.com/atanuroy911/ulab-mms/commit/ecb449e9021eaa3af5a8fb32cc4f2cf1270d23bb))
* import export bugs fixed ([348ecc2](https://github.com/atanuroy911/ulab-mms/commit/348ecc2b38b1857499d10a709d3e4640fafdb97a))
* resources tab partial fix and course file export dialoague added ([946f37a](https://github.com/atanuroy911/ulab-mms/commit/946f37a63a9eac5348240003227c112316128231))


### Features

* add CO Mark Distribution table + redesign the modern PDF report ([c22fd51](https://github.com/atanuroy911/ulab-mms/commit/c22fd51fb8b2d6afd518b55c62185b8ebd2445af))
* added import students from URMS (Beta) ([14658dc](https://github.com/atanuroy911/ulab-mms/commit/14658dc2ac172464f86b75a74e745fecb3ca9931))
* added select all select none and bulk delete in account manager and course manager in admin ([5680df7](https://github.com/atanuroy911/ulab-mms/commit/5680df72f150a52a84a2c9ad14de2f8470688a92))
* added student view details in admin ([dd03009](https://github.com/atanuroy911/ulab-mms/commit/dd0300937ea29818a1f93aa715518b60ffb2511d))
* advertised chrome extension ([f812b25](https://github.com/atanuroy911/ulab-mms/commit/f812b253cbea626c58e9c90b9366fa9fa8ce4f38))
* export to URMS auto fill grade ([4bff622](https://github.com/atanuroy911/ulab-mms/commit/4bff622dd9524d6b66a346d5a4267f3162fb0b43))

# [1.7.0](https://github.com/atanuroy911/ulab-mms/compare/v1.6.1...v1.7.0) (2026-07-25)


### Bug Fixes

* Excel-corrupting bugs in alpha Excel export (charts + merges) ([5f040f8](https://github.com/atanuroy911/ulab-mms/commit/5f040f8cf74b05cfb9d078d8f31bd7beb9e5d03d))
* restore charts, CO-PO mapping grid, signature line, real attendance ([f689a74](https://github.com/atanuroy911/ulab-mms/commit/f689a74b599950843a087ca0166915db8921afc2))


### Features

* add Export Course File PDF (Alpha) with Excel/Modern style picker ([6c0a27a](https://github.com/atanuroy911/ulab-mms/commit/6c0a27a2de1abc41df66c908d5bfc8c38ad0fa78))
* add student-count-independent CO-PO course file export (Alpha) ([687aad9](https://github.com/atanuroy911/ulab-mms/commit/687aad94f2d5e8ecccfc9bf8f539d1ba40297b20))
* allow viewing project groups/titles without signing in ([5dc369b](https://github.com/atanuroy911/ulab-mms/commit/5dc369baadd062a74247dac0ebafc8965c418490))
* move alpha exports to their own right-column section + alpha disclaimer ([f53c740](https://github.com/atanuroy911/ulab-mms/commit/f53c7404167492684282c2447ac2d49be9a640d2))

## [1.6.1](https://github.com/atanuroy911/ulab-mms/compare/v1.6.0...v1.6.1) (2026-07-25)


### Bug Fixes

* sync package-lock with package.json for deploy workflow ([8fbb1db](https://github.com/atanuroy911/ulab-mms/commit/8fbb1db0fdf3289e94cee6a5ed080b1bcb75effc))

# [1.6.0](https://github.com/atanuroy911/ulab-mms/compare/v1.5.0...v1.6.0) (2026-07-25)


### Bug Fixes

* attendance auto-login bypass and student attendance count mismatch ([44f2d92](https://github.com/atanuroy911/ulab-mms/commit/44f2d9228335e010fc704f8e755568fd3226ce72))
* close IDOR/auth gaps found in API security audit ([8dd0a16](https://github.com/atanuroy911/ulab-mms/commit/8dd0a162b6ea3b2978529189ed5f8bd71fdbcbc0))
* link mobile GraphQL attendance to real Student records ([99bad98](https://github.com/atanuroy911/ulab-mms/commit/99bad9808149c9cb86b1d1c43b5a3692d8088f65))
* make project page auto-refresh silent instead of full-page reload ([b128cbc](https://github.com/atanuroy911/ulab-mms/commit/b128cbc1cb604df156de4e54203d69a8f2a669cf))


### Features

* require Google sign-in (or admin password) before checking marks ([30c2fb2](https://github.com/atanuroy911/ulab-mms/commit/30c2fb2ce61e09e1d567c938d4763d34034c5474))

# [1.5.0](https://github.com/atanuroy911/ulab-mms/compare/v1.4.0...v1.5.0) (2026-07-21)


### Bug Fixes

* **courses:** don't treat a placeholder UNESCO code equal to the course code as a New Code ([710fe14](https://github.com/atanuroy911/ulab-mms/commit/710fe146e6f0238da5de61857c831a64b7527157))
* lock file sync attempt ([aef960e](https://github.com/atanuroy911/ulab-mms/commit/aef960e1def00071abc83b50fff1e61127bf8e9e))
* **students:** correctly parse the actual URMS attendance sheet PDF layout ([d789bec](https://github.com/atanuroy911/ulab-mms/commit/d789becf4537fe2993156510d6ed61b217b7f699))


### Features

* **api:** add GraphQL API layer for mobile app ([c8dfbd8](https://github.com/atanuroy911/ulab-mms/commit/c8dfbd826eb7e02d788550e8e8058566a1b424a2))
* **attendance:** add student attendance statistics ([de81b97](https://github.com/atanuroy911/ulab-mms/commit/de81b97b3834ac9667d78bc01ad473cb123302f0))
* **attendance:** show present/absent counts on check-in and on check-marks ([2de614b](https://github.com/atanuroy911/ulab-mms/commit/2de614bb9afcee0582acedb1a99ba03ad38ed6cc))
* **courses:** add optional attendance-sheet PDF import to the Add Course wizard ([bdf5df0](https://github.com/atanuroy911/ulab-mms/commit/bdf5df0c14faaf59d7cbf08728e46454ad7a0aa7))
* **courses:** add UNESCO code catalogue field, majors, and fixed-registry merge ([c619719](https://github.com/atanuroy911/ulab-mms/commit/c6197191cb501cae3d734cb5dd3a7ff1bbe5348d))
* **courses:** auto-fill New Code from catalogue and add bulk registry import ([747e7af](https://github.com/atanuroy911/ulab-mms/commit/747e7afb67e81bfcadd735f4b98b67bf32d62b52))
* **exams:** prompt for Quiz/Assignment(CLA) weightage+aggregation on first add ([95b5fbd](https://github.com/atanuroy911/ulab-mms/commit/95b5fbd19a87fedf80b8c35a5ed225fd056f99aa))
* **graphql:** add public studentCourses query for mobile course list ([48c739e](https://github.com/atanuroy911/ulab-mms/commit/48c739eb536687bfb68fca048d0d370645bd7432))
* **students:** add PDF import option to student roster import ([5a44504](https://github.com/atanuroy911/ulab-mms/commit/5a44504e7d1f3e5d5e2c16b2796fee8220721133))
* **students:** auto-fill class time/room from the parsed attendance PDF ([b9b8324](https://github.com/atanuroy911/ulab-mms/commit/b9b8324dc1f73137e6fac99774cd116df7208547))

# [1.4.0](https://github.com/atanuroy911/ulab-mms/compare/v1.3.0...v1.4.0) (2026-07-08)


### Bug Fixes

* restrict bulk paste marks to a single exam at a time ([832e281](https://github.com/atanuroy911/ulab-mms/commit/832e281af8ce7bb56ae5a43a63e9aa9b4c779cf3))
* student picker mouse clicks and duplicated class room on print ([2c37b5a](https://github.com/atanuroy911/ulab-mms/commit/2c37b5a25735d5aeb0328eea6690fbd9361f87a3))


### Features

* add format-help dialog to Bulk Paste Marks modal ([0242ad5](https://github.com/atanuroy911/ulab-mms/commit/0242ad5477323181cd682a3afaf78b7ae19ad536))
* add OCR/paste-list bulk attendance from Meet screenshots ([5787560](https://github.com/atanuroy911/ulab-mms/commit/5787560506d6a57a39322e2a1d9c60ff97a65438))
* print-options confirmation modal, center probation legend ([e9317cb](https://github.com/atanuroy911/ulab-mms/commit/e9317cba3ae2c1f3ccd95640108f1649b8a4b9c4))
* redesign attendance sheet footer, enlarge title, show rep ID ([6396132](https://github.com/atanuroy911/ulab-mms/commit/63961323eb4e7323e60eae12a318b8feecc9bc36))
* robust ID/name parsing and format-help for student import ([0eea786](https://github.com/atanuroy911/ulab-mms/commit/0eea786e46b2fce7cec12940ad64fa227c90b802))
* show existing marks in bulk paste preview with old/new columns ([1963752](https://github.com/atanuroy911/ulab-mms/commit/1963752da9a600639659e495c76de2390f23884c))
