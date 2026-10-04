# Dexter Liquid Glass implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement these tasks; independent reference gathering and tests use superpowers:dispatching-parallel-agents.

**Goal:** Implement the supplied complete iOS 26 presentation redesign while preserving Dexter's workout behavior.

**Architecture:** Retain the offline React 18.3.1, ReactDOM and DC runtime and the existing Component data methods. Replace shared rendering helpers, screen composition, navigation and sheet presentation. Own gesture, focus, viewport and animation resources in the Component lifecycle, separately from workout state.

**Tech stack:** Self-contained HTML, embedded Inter variable font, inline SVG symbols, React.createElement, CSS and bounded Web Animations API transitions.

**Spec:** [Supplied specification](specification.md)

## Global constraints

- Starting commit `3d8b0437445f5d7977edf2c1261cdaee45b61f3c`; clean checkout; branch `codex/ios26-liquid-glass`.
- Preserve `dexter.material.v1`, version-3 backups, all calculation/restore rules, timers, newer workout features and the Android bridge.
- Preserve vendored runtime bytes, `data-props`, `{{ app }}` and `/* __END__ */` boundaries.
- Offline assets only; presentation preferences use `dexter.presentation.v1` with two boolean reductions, effective OS OR local.
- Four tabs in original order; every sheet/editor view; no content-card blur or nested sampling filters.
- Keep Android Java/Gradle/Manifest unchanged unless an observed regression requires a narrow adjustment.

## Review focus

- Rapid interrupted gestures: no duplicate action or stuck overlay.
- Theme/toast/preference changes while typing: retain node, focus, value and caret.
- Zero animation duration: dialog cleanup and focus restoration still complete.
- Large text, long names and 320px widths: controls and final content remain reachable.
- Old stored profiles and 200 History dates: data equality and bounded rendering costs.

## Task 1: Baseline and references

- [x] Read complete supplied specification and repository/test/runtime/wrapper sources.
- [x] Record starting commit and clean state; create the requested new branch.
- [x] Run `node tests/workout-features.test.cjs` (13 pass).
- [x] Run `DEXTER_CHROMIUM_PATH=/usr/bin/chromium node tests/browser-smoke.cjs` (pass with local loopback permission).
- [x] Create an honest source-target board and capture baseline screenshots. Official Apple frames/transcripts are unavailable under the managed network policy; direct comparison remains pending.

## Task 2: Shared presentation and representative slice

**Files:** `app/src/main/assets/Dexter.html`, font license, `tests/presentation.test.cjs`.
**Interfaces:** `loadPresentation()`, `setPresentation(key,value)`, `effectivePresentation()`, `icon()`, `iconBtn()`, `card()`, `stepper()`, `mSwitch()`, `bottomSheet()`.

- [x] Add failing tests for preferences and UI lifecycle risks.
- [x] Embed licensed Inter, remove Material/Roboto assets, define theme/contrast/glass/type tokens and complete SVG registry.
- [x] Build Today, stable floating navigation, set controls and Settings in both themes; inspect screenshots before extending.
- [x] Implement measured single navigation indicator, drag commit/cancel, scroll restoration, compact title and bounded transitions.
- [x] Implement one dialog owner, viewport-safe detents, drag/cancel, focus trap/restoration, inert background and exit cleanup independent of animation events.
- [x] Run data and presentation tests and compare representative slice screenshots.

## Task 3: All screens and sheets

**Files:** `app/src/main/assets/Dexter.html`; retain business callbacks and metrics.

- [x] Recompose Cardio, Progress, History, active session, every picker, backup/reference/progression sheet and all eight editor views.
- [x] Use shared controls, quiet grouped content, semantic buttons/labelled fields and scalable type throughout.
- [x] Preserve daily additions, progress generations, custom cardio, program editing, bodyweight, backups and toast timing.
- [x] Test both themes, accents, empty/populated states, long names, responsive sizes and 200% text.

## Task 4: Verification and delivery

**Files:** `tests/liquid-glass-browser.cjs`, `docs/liquid-glass/verification.md`, representative screenshots/recordings.

- [x] Run unchanged data assertions and browser workflows; verify runtime/data method preservation.
- [x] Test rapid gestures, dialog focus, disabled motion, input stability, OS reductions, offline embedded assets and bridge simulations. Actual file navigation is blocked by managed browser policy and remains pending.
- [x] Record representative visuals/videos and browser traces with 200 History dates; evaluate optional rim refraction and document retain/reject decision.
- [x] Attempt Android test task; distinguish unavailable SDK/device checks explicitly.
- [x] Review whole diff, fix concrete findings, rerun affected checks and package verification evidence.

Final delivery: commit the verified tree, push `codex/ios26-liquid-glass` as the user's requested new branch, and verify the remote SHA. Physical Android and direct official-reference checks remain pending as recorded in `verification.md`.
