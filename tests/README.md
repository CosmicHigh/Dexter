# Dexter feature checks

Run the dependency-free regression suite with Node.js:

```sh
node tests/workout-features.test.cjs
```

The tests load the real Component logic and vendored React from the Android HTML asset. They cover day-only exercise persistence, shared IDs and tracking, preserved History after progress resets, same-day logging after resets, custom cardio totals, and current/legacy backup restoration.

For browser checks, install Playwright and its Chromium browser in your development environment, then run:

```sh
node tests/browser-smoke.cjs
```

An existing Chromium installation can be selected with `DEXTER_CHROMIUM_PATH`. Screenshots are written to the system temporary directory, or to `DEXTER_SCREENSHOT_DIR` if set. The browser check starts a local HTTP server and reproduces the Android asset's behavior by disabling the runtime's optional self-fetch, which fails under Android's `file://` origin.

The Android test task remains separate:

```sh
./gradlew test
```
