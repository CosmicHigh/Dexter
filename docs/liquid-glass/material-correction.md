# Dexter material and composition correction

This correction follows the user's review of `codex/ios26-liquid-glass` at `e77116fe2505e5cddeb331c8a5c9c683378c603f`. It supersedes the earlier brief's decisions to keep most cards and controls solid, use a pure black dark background, make floating glass roughly 78% opaque, and make expanded sheets roughly 94% opaque. Those choices produced the reported Material 3 appearance and inconsistent glass.

## Implementation direction

- Keep the app as an offline HTML PWA/Android asset. CSS backdrop filtering is a web approximation of Apple's material; do not claim it reproduces native iOS refraction, lensing, system controls, or GPU behavior exactly.
- Put restrained accent colour in the scene behind the interface. The scene consists of two broad, static colour fields. Change it with the user's accent selection. Do not put gradients, noise, smoky textures, painted light streaks, moving blobs, or a white bevel inside glass surfaces. The user's image 8 is specifically a rejected treatment.
- Share neutral translucent fills, uniform thin rims, and restrained external shadows. Use separate optical weights for panels, interactive controls, and floating chrome. Preserve readable foregrounds instead of simply lowering opacity on an entire element.
- Use actual `backdrop-filter` and `-webkit-backdrop-filter`. A coloured translucent fill alone is insufficient for floating controls. Panel material is painted in a pseudo-element so the panel ancestor does not become a backdrop root that traps its child controls' sampling.
- A sheet provides the blur for its contents. Its grouped rows and fields use translucent inset fills instead of adding another blur pass to every row. This is deliberate shared material hierarchy, not an unexplained solid-grey exception. Keep the same sheet material at medium and large detents.
- Keep large History lists as a translucent content field, without a filter stretched across hundreds of rows. Avoid animated blur radius, continuous animation loops and full-screen blur passes. Measure the resulting costs on the actual target WebView.

## Composition changes

| Area | Corrected composition |
| --- | --- |
| Today | Recovery/training eyebrow, white large title, quieter summary and tinted glass action; no solid pastel CTA. |
| Weekly plan | Translucent strip and restrained selected-day fill. |
| Cardio | Consistent selector, duration field, Log action and translucent chart/stat panels. |
| Progress | Left-aligned paired statistics; bodyweight reading and chart precede the recording controls; shared glass exercise picker. |
| Active workout | Separate exercise summary and independent set rows; remove the large panel enclosing the entire workout and nested prescription card. |
| Exercise/session pickers | Grouped rows with separators and selected/check states; remove the stack of oversized rounded tiles. |
| Workout detail | Grouped sections and compact set chips instead of cards within cards. |
| Settings/editor/reference/backup | Preserve callbacks and input identity; route retained inline neutral/accent fills through shared presentation materials. |

## Motion and accessibility

The navigation selection follows intermediate finger positions while dragging, then settles at the selected tab. Previewing does not commit the route. Cancellation restores the original selection and releases capture. Existing interruptible sheet travel, detents, tab travel, press response, focus containment, opener restoration, and immediate workout saves remain in place.

Reduce Transparency and increased contrast disable backdrop filtering for floating chrome, controls, and panel pseudo-elements. They restore opaque readable fills and solid primary actions. The no-backdrop-filter fallback also uses opaque surfaces. Reduce Motion continues to remove spatial transitions and settle active presentation effects.

## Verification for this correction

Confirmed in this execution environment:

- `node tests/workout-features.test.cjs`: 13 checks pass.
- `node tests/presentation.test.cjs`: 13 checks pass, including continuous navigation preview/cancellation across geometry updates and six distinct accent choices.
- The new navigation regression fails against the original branch snapshot (indicator snaps to a tab centre), then passes against this correction.
- Vendored React, ReactDOM and DC runtime bodies remain byte-identical to the existing reference checks. Workout storage schema, calculation methods and backup payloads remain unchanged.
- New/updated browser test files pass `node --check`.

Not verified here:

- Browser screenshots, rendered contrast, actual pixel blur, animation appearance and responsive layouts. No Chromium executable is installed; the official Playwright download was denied by environment network policy. The cloud browser also denied local file navigation. These are environment blockers, not successful browser checks.
- Physical Android/iOS Safari rendering, frame rate, battery cost, keyboard/insets, Android Back and native backup bridge behavior. No device is available in this session.

The earlier branch's screenshot/video/performance evidence predates this correction and must not be reused as proof that this version passes. The material pixel test is new and has not completed its browser run in this environment.

## Required browser and device checks

Install `playwright` and `pngjs`, then Playwright Chromium (see `tests/README.md`). Run:

```sh
node tests/browser-smoke.cjs
node tests/presentation-interactions.cjs
node tests/material-optics-browser.cjs
node tests/liquid-glass-browser.cjs
```

The optics test compares real stripes with sampling on/off, checks that changing the actual backdrop changes the rendered material, verifies opaque reductions, tests a nested stepper inside a set-row panel, and compares medium/large sheet materials. It is designed to reject an opaque panel or a painted texture, rather than accepting a CSS declaration by itself. Its pixel captures are test scenery and are not shipped as application textures.

Inspect both themes and all six accents on widths 320/360/390/430, 200% text, and landscape. Check every picker, editor view, reference/progression sheet, backup sheet, toast and session state. Scroll charts and text behind the floating navigation and sheets: content should visibly defocus and contribute colour while labels remain readable. Inspect the completed and uncompleted steppers as well as nested input fields.

Finally run the APK on a physical target Android WebView and the PWA on iOS Safari. Record interactions and measure frame pacing before claiming native-quality appearance or smooth device performance. If costs are excessive, reduce blur radius or consolidate passes while retaining actual transparency and a coloured scene; do not silently return to the old opaque design.

## Official design references

- [Apple Human Interface Guidelines: Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- [Apple WWDC25: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)
- [Apple WWDC25: Get to know the new design system](https://developer.apple.com/videos/play/wwdc2025/356/)

Apple's material adapts to the content behind it. Preserve that relationship, the floating control hierarchy, and direct manipulation. A web-only implementation must be honest about the native effects it cannot reproduce.
