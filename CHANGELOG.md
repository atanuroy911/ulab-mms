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
