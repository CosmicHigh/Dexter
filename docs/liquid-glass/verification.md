# Dexter Liquid Glass implementation and verification

Implemented from the complete [supplied specification](specification.md), starting from a clean checkout of `3d8b0437445f5d7977edf2c1261cdaee45b61f3c`. Delivery branch: `codex/ios26-liquid-glass`. Browser evidence was collected on 4 October 2026.

## What changed

`app/src/main/assets/Dexter.html` now contains a complete presentation system: system-first typography with offline Inter, inline SVG symbols, light/dark semantic colours and six accents, neutral grouped workout content, floating glass navigation and toolbar groups, and a shared modal sheet shell. Today, Cardio, Progress, History, sessions, Settings, every picker/reference/backup sheet and all eight program editor views use the new controls and type scale.

Navigation uses one measured traveling selection overlay, arrow/Home/End keyboard support, touch drag preview/commit/cancel, per-tab scroll restoration and a compact title on scroll. Sheets have independent content scrolling, medium/large detents, captured handle gestures, an accessible current detent action, focus containment/restoration, an inert background and a visible close/back action. Session logging and steppers update immediately; appearance effects have bounded lifetimes and outgoing visuals are inert snapshots.

Reduce motion and Reduce transparency are real Settings switches stored separately in `dexter.presentation.v1`. Effective reductions combine the local toggle with the OS request. High contrast, text scaling, visible focus and removal of viewport zoom restrictions are included. Motion settles without a permanent animation loop.

The final HTML is **419,328 bytes** (about 409.5 KiB), versus 8,577,205 bytes at the baseline. Inter is a 48,256-byte Latin variable WOFF2 embedded in the HTML; its complete SIL OFL notice is packaged in [Inter-LICENSE.txt](../../app/src/main/assets/Inter-LICENSE.txt).

## Preservation and review

The three vendored React, ReactDOM and DC runtime script bodies are byte-for-byte identical to the starting commit; the presentation test checks their SHA-256 hashes. The component-script boundary, `data-props`, `{{ app }}` binding and `/* __END__ */` marker are preserved. Structural method-boundary comparison found 53 inherited methods unchanged after trimming only surrounding whitespace, including storage, calculations, backups, daily additions, progress resets and custom cardio. Session callbacks and progression rules were carried forward while their rendered controls changed.

Workout data still uses `dexter.material.v1` and version-3 backups. Workout import/export/reset does not include or reset presentation preferences. Java, Gradle, Manifest and Android bridge source files are unchanged. The original dependency-free workout tests are unchanged. The existing smoke test changed only its old Material-glyph selectors to real named buttons/tabs; its data assertions remain intact.

Independent read-only review found an editor Done contrast issue and cancellation that left a tab highlight under the wrong item. Both were fixed and covered by real-browser regressions. Further testing fixed captured-touch handoff, sheet capture-loss cleanup, accessible detent labels, long-name wrapping, full-row editor button targets, and motion reduction during an active gesture. No further data or bridge regression was found.

Changed files comprise the HTML and font licence, three new presentation/browser suites and an optics probe, narrow smoke selectors, test instructions, the supplied specification/implementation plan, the honest reference-target board, and the evidence in this directory.

## Executed checks

| Command | Result |
|---|---|
| `node tests/workout-features.test.cjs` | 13/13 pass, unchanged assertions |
| `node tests/presentation.test.cjs` | 11/11 pass, including runtime hashes and independent preference storage |
| `DEXTER_CHROMIUM_PATH=/usr/bin/chromium node tests/browser-smoke.cjs` | Pass; daily additions, shared tracking, resets without History loss, custom cardio, reloads, 320/390/460px; no page errors |
| `DEXTER_CHROMIUM_PATH=/usr/bin/chromium node tests/presentation-interactions.cjs` | Pass; real-touch commit/cancel, live OS reduction, pointer capture, continuous indicator travel, sheet detents, actual Done contrast, full-row hit areas, long names at 320px/200% |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/dexter-playwright DEXTER_CHROMIUM_PATH=/usr/bin/chromium DEXTER_EVIDENCE_DIR=/tmp/dexter-final-evidence node tests/liquid-glass-browser.cjs` | Pass; both themes, full functional/visual matrix, recordings and traces |
| `DEXTER_CHROMIUM_PATH=/usr/bin/chromium DEXTER_EVIDENCE_DIR=/tmp/dexter-final-evidence node tests/optics-probe.cjs` | Pass; actual baseline/candidate captures, stable label geometry and unique filter IDs |
| Component script `node --check`; `git diff --check` | Pass |

The workout suite and original smoke workflow also passed **before** implementation. The new preference tests were run failing before implementation; the interrupted-gesture regression reproduced `270px` under History while Today remained selected before its correction.

The broad suite traverses all editor routes and sheet types, weighted/core/timed sets, repeated steppers, complete/undo, progression, daily add, custom cardio creation/validation/deletion, bodyweight, multi-exercise progress reset with preserved History, current/legacy backups, browser download/file/paste import, and simulated native export success/cancellation. It checks typing/selection through theme/accent/toast changes, immediate state updates, focus wrapping/restoration, disabled controls, interrupted transitions, OS/local reductions, repeated subscriptions/filter counts, duplicate SVG IDs and idle animation cleanup.

The visual run generated 217 captures across light/dark, widths 320/360/390/430/1280, text scales 100/130/200%, landscape, all six accents, empty/populated/rest/training states, long names, many cardio types and 200 History dates. Representative artifacts are retained below; the runner can regenerate the complete matrix and full raw traces. Test conditions and measured results are in [evidence/report.json](evidence/report.json).

## Visual and motion evidence

| Flow | Light | Dark |
|---|---|---|
| Today | [Screenshot](evidence/light-today-initial.png) | [Screenshot](evidence/dark-today-initial.png) |
| Session, completed set | [Screenshot](evidence/light-session-done.png) | [Screenshot](evidence/dark-session-done.png) |
| Timed session | [Screenshot](evidence/light-session-timed.png) | [Screenshot](evidence/dark-session-timed.png) |
| Cardio with custom types | [Screenshot](evidence/light-cardio-many-types.png) | [Screenshot](evidence/dark-cardio-many-types.png) |
| Progress/bodyweight | [Screenshot](evidence/light-progress-bodyweight.png) | [Screenshot](evidence/dark-progress-bodyweight.png) |
| History, 200 dates | [Screenshot](evidence/light-history-200-dates.png) | [Screenshot](evidence/dark-history-200-dates.png) |
| Expanded Settings | [Screenshot](evidence/light-settings-expanded.png) | [Screenshot](evidence/dark-settings-expanded.png) |
| Program editor | [Screenshot](evidence/light-editor-program.png) | [Screenshot](evidence/dark-editor-program.png) |
| Exercise editor | [Screenshot](evidence/light-editor-exercise.png) | [Screenshot](evidence/dark-editor-exercise.png) |
| Reference sheet | [Screenshot](evidence/light-exercise-reference.png) | [Screenshot](evidence/dark-exercise-reference.png) |
| Today, 320px/200% | [Screenshot](evidence/light-today-320-200.png) | [Screenshot](evidence/dark-today-320-200.png) |
| Landscape sheet | [Screenshot](evidence/light-landscape-settings.png) | [Screenshot](evidence/dark-landscape-settings.png) |
| Interaction recording, 30 seconds | [WebM](evidence/light-interaction-excerpt.webm) | [WebM](evidence/dark-interaction-excerpt.webm) |

The recordings show tab travel, repeated modal presentation/cancellation, sheet handling and session changes. They are headless desktop Chromium recordings, not device recordings. [Baseline Today](evidence/baseline-today.png) and [baseline Cardio](evidence/baseline-cardio.png) retain the inspected pre-change presentation.

Mathematical checks of the actual shipped CTA token pairs give 5.40–6.68:1 in light and 8.56–10.92:1 in dark. Secondary text over the three opaque content surfaces has a minimum 5.74:1 in light and 7.07:1 in dark. [evidence/contrast.json](evidence/contrast.json) also records composited models for glass over the theme's page/card/inset surfaces and a busy checker of those surfaces. These models supplement inspection of the actual captures; they are not a pixel-based audit of every possible backdrop. The browser regression checks the editor Done action's computed foreground/background directly.

## Performance and optics

The test host is Linux x64 (`6.18.44`), Chromium **151.0.7922.173**, with 390×844 CSS-pixel recording viewport, device scale factor 1 and approximately 16.7ms visible rAF intervals. There is no physical device refresh-rate measurement. Automation, video recording and Chromium/Playwright tracing are active during these measurements.

[evidence/performance.md](evidence/performance.md) contains per-scenario frame interval percentiles, maximum intervals and long tasks for both themes. Sheet and weighted/core/timed session measurements contain no task over 50ms in this run. Rapid tab changes and entering History contain measured stalls above 50ms; the desktop large-fixture performance target is **not certified**. Rendering/main-thread traces were inspected: the expensive events are click handling/React updates and style/layout for the large lists; no continuously running presentation loop was found. The History measurement includes entering that tab as well as scrolling, so it does not isolate scroll cost. Median frame intervals alone are insufficient to establish smoothness or Android performance.

After settling in each theme, the probe observed **zero app-owned rAF callbacks, zero pending rAF jobs and zero running animations**. Repeated sheet cycles did not grow global subscriptions or filter nodes. Gesture updates use cached tab geometry and local styles, with no per-frame workout save/render. Covered glass effects suspend; content cards and charts have no backdrop blur. No blind list virtualization or geometry containment was introduced.

Optional SVG refraction is **disabled in the product**. The isolated [prototype](optics-prototype.html) uses distinct per-size maps and leaves labels in a separate layer. Chromium accepts its CSS URL filter recipe, but the [candidate capture](evidence/optics-candidate.png) transmits the checker across the control centre, unlike the smoother [baseline](evidence/optics-baseline.png). It does not establish the desired shallow-rim effect. Official reference comparison and the required Android optical/performance gate are also unavailable. The application keeps real backdrop blur/saturation and rim lighting without refraction. [Probe report](evidence/optics-report.json).

## Exact remaining limits

- **Official visual references:** Apple session/documentation hosts are unavailable under this environment's network policy. The [source-target board](reference/reference-board.html) records A1/A2/A3 and explicitly lacks official frames, timestamps and viewed motion. Typography, glyphs, easing, material recipes and sheet covers are web approximations; no pixel-perfect native comparison is claimed.
- **Actual file origin:** managed Chromium blocks `file://` navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`. The fallback cold-loads the unchanged packaged bytes through an in-memory fulfilled navigation with browser networking disabled and every subsequent request aborted; Inter loads and all tabs work. This proves embedded-asset independence here, not Android file-origin behavior.
- **Android build:** `bash ./gradlew test` could not write the environment's default Gradle cache. Retrying with `GRADLE_USER_HOME=/tmp/dexter-gradle bash ./gradlew test` reached the wrapper download and failed with `UnknownHostException: services.gradle.org`. No Android SDK/device was available; no APK build or Android test pass is claimed.
- **Physical Android checks:** pending actual WebView scrolling/frame rate, keyboard/visual-viewport resizing and focused-field reachability, system bars/safe-area insets, pinch zoom, Android Back, SAF export/import success/cancellation and file chooser fallback. Simulated native callbacks validate JavaScript routing only. The existing wrapper's Back action continues to use WebView history or finish the activity; it does not currently route Back into the sheet controller.
- **Interaction approximations:** long sheets expand/collapse through the handle and remain natively scrollable. Vertical cover/content fades are used instead of a source-connected geometry morph or physics spring. There is no optional chart scrub, parallax or ambient animation.

See [tests/README.md](../../tests/README.md) for complete reproducible test and recording setup.
