# Dexter feature checks

Run the dependency-free regression suite with Node.js:

```sh
node tests/workout-features.test.cjs
node tests/presentation.test.cjs
```

The tests load the real Component logic and vendored React from the Android HTML asset. The workout suite covers day-only exercise persistence, shared IDs and tracking, preserved History after progress resets, same-day logging after resets, custom cardio totals, and current/legacy backup restoration. Its behavioral assertions are unchanged by the presentation rebuild.

The presentation suite verifies that the React, ReactDOM and DC runtime script bodies remain byte-for-byte identical to commit `3d8b0437445f5d7977edf2c1261cdaee45b61f3c`. It also exercises the independent accessibility preference store, malformed or unavailable storage, OS/local reduction rules, actual Settings switch handlers, and unchanged workout saves, version-3 exports and legacy restores.

For browser checks, install Playwright and its Chromium browser in your development environment, then run:

```sh
node tests/browser-smoke.cjs
node tests/presentation-interactions.cjs
```

An existing Chromium installation can be selected with `DEXTER_CHROMIUM_PATH`. Screenshots are written to the system temporary directory, or to `DEXTER_SCREENSHOT_DIR` if set. The browser check starts a local HTTP server and reproduces the Android asset's behavior by disabling the runtime's optional self-fetch, which fails under Android's `file://` origin.

The Android test task remains separate:

```sh
./gradlew test
```

Run the broader presentation lifecycle and evidence check after installing Playwright's Chromium and FFmpeg dependencies:

```sh
npx playwright install chromium ffmpeg
node tests/liquid-glass-browser.cjs
```

An existing Chromium installation can be selected with `DEXTER_CHROMIUM_PATH`. Set `DEXTER_EVIDENCE_DIR` to choose the artifact directory; the default is `dexter-liquid-glass-evidence` under the system temporary directory. This runner creates screenshots, recordings for both themes, short video excerpts when FFmpeg is available, Playwright traces, Chromium rendering/main-thread traces, and a JSON report containing frame samples and long tasks. `DEXTER_FFMPEG_PATH` selects an FFmpeg executable for creating the short excerpts. The full recordings remain available if excerpt generation is unavailable.

The runner drives real buttons, selected tabs, fields and dialogs. It covers rapid tab changes, repeated sheet presentation, actual touch cancellation, focus wrapping and restoration, background inertness, per-tab scroll restoration, active input/textarea identity and selection, reduced preferences without transition events, idle animation/listener cleanup, weighted/core/timed sessions, progression dismissal, all eight editor views and disabled destinations, daily additions, cardio validation, progress resets, browser backups and simulated native export callbacks. The fixtures include long names, many cardio types, and at least 200 History dates. The visual matrix covers both themes, six accents, widths 320/360/390/430/1280, text scales 100/130/200%, landscape, and populated/empty/rest states.

The focused interaction check exercises real touch drag commit/cancellation, an OS motion change during a drag, pointer-capture transfer/loss, accessible sheet detents, the editor Done action's actual contrast and row hit areas, and long custom names at 320px/200% text.

The final offline check attempts to cold-load the actual packaged HTML over `file://` with the browser network disabled, verifies the bundled Inter font, and traverses all four tabs. If managed Chromium policy explicitly rejects file navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`, the report leaves the real file-origin check pending. It then fulfills one HTTP navigation entirely from the unchanged packaged HTML bytes in memory with network disabled and every subsequent request aborted. That fallback checks embedded-asset independence, not Android file-origin behavior. Other file-loading errors fail the suite.

Evaluate the optional refraction prototype separately:

```sh
node tests/optics-probe.cjs
```

The prototype is excluded from the app. Its captures compare real baseline backdrop blur against an SVG rim candidate; successful CSS parsing alone does not establish a correct optical result or an Android performance pass.

On managed Linux where the browser cache is read-only and Playwright's FFmpeg download domain is unavailable, a system FFmpeg can be selected for video recording through a writable Playwright cache. For Playwright 1.62.1's FFmpeg revision 1011, the verified setup is:

```sh
mkdir -p /tmp/dexter-playwright/ffmpeg-1011
ln -s /usr/bin/ffmpeg /tmp/dexter-playwright/ffmpeg-1011/ffmpeg-linux
PLAYWRIGHT_BROWSERS_PATH=/tmp/dexter-playwright \
  DEXTER_CHROMIUM_PATH=/usr/bin/chromium \
  node tests/liquid-glass-browser.cjs
```

The report labels its measurements as desktop Chromium evidence. Screenshot capture, browser automation and tracing are part of its test conditions; frame samples cannot certify an APK's performance. Physical Android WebView frame rate, keyboard, system bars/insets, Android Back and native SAF bridge behavior remain separate checks. Simulated native callbacks verify JavaScript routing only.
