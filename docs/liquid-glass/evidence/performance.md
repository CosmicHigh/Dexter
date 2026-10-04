# Browser performance sample

Linux x64, Chromium 151.0.7922.173, 390×844 CSS-pixel viewport, device scale factor 1. Video recording, Playwright automation and both Chromium/Playwright tracing enabled. Fixture: 200 History date keys, weighted/core/timed exercises, long names and six custom cardio types. Visible rAF intervals are sampled; physical display refresh rate is unmeasured.

| Scenario | Frames | Median ms | p95 ms | Max ms | Tasks >50ms (durations ms) |
|---|---:|---:|---:|---:|---|
| dark: rapid tabs | 104 | 16.7 | 33.4 | 133.4 | 142, 79, 83, 73 |
| dark: sheet open/close/drag cancellation | 216 | 16.7 | 16.8 | 33.3 | 0 |
| dark: weighted/core/timed session logging | 279 | 16.7 | 16.8 | 16.8 | 0 |
| dark: History scroll with 200 dates | 111 | 16.7 | 33.3 | 100.1 | 57, 67, 100 |
| light: rapid tabs | 102 | 16.7 | 66.6 | 116.6 | 100, 66, 86, 74 |
| light: sheet open/close/drag cancellation | 206 | 16.7 | 16.8 | 33.4 | 0 |
| light: weighted/core/timed session logging | 284 | 16.7 | 16.8 | 16.8 | 0 |
| light: History scroll with 200 dates | 109 | 16.7 | 33.4 | 83.3 | 64, 66, 82 |

The History scenario includes switching into History before scrolling. This run does not isolate steady scrolling from the initial list construction. Automation/tracing load is included, and rAF intervals do not capture every compositing cost. The desktop target is not certified; no Android frame-rate pass is inferred.

## Rendering/main-thread trace inspection

| Theme | Event type | Count | Max ms | Events >50ms |
|---|---|---:|---:|---:|
| dark | EventDispatch | 1342 | 130.7 | 7 |
| dark | FunctionCall | 3436 | 116.8 | 3 |
| dark | Layout | 250 | 22.1 | 0 |
| dark | UpdateLayoutTree | 876 | 52.8 | 1 |
| dark | Paint | 662 | 8.2 | 0 |
| light | EventDispatch | 1346 | 87.6 | 7 |
| light | FunctionCall | 3438 | 78.4 | 5 |
| light | Layout | 252 | 23.5 | 0 |
| light | UpdateLayoutTree | 864 | 26.2 | 0 |
| light | Paint | 690 | 11.0 | 0 |

These are individual event durations and counts, not an additive wall-time total: trace scopes may overlap. Long click handling/React work and style/layout are visible on large-list transitions; the material count alone does not demonstrate performance. Full trace JSON and Playwright archives are generated in the evidence directory specified by the runner and excluded from Git to avoid committing hundreds of megabytes.

After settling, both theme probes observed zero app-owned rAF callbacks, zero pending app rAF requests and zero running animations. Repeated sheet cycles kept global listener and filter counts stable. Optional refraction remains disabled.

See [report.json](report.json) for every sampled frame interval and observed long task, and [../verification.md](../verification.md) for pending physical-device checks.
