# Dexter — iOS 26 Liquid Glass implementation brief

A complete presentation-layer redesign with native-looking controls and fluid interaction, while preserving Dexter’s current workout behavior and data.

Revision: 4 October 2026. This document supersedes the original prompt in full. It is a specification for an implementation agent, not a claim that the redesign or its performance has already been tested.

## 1. The outcome to build

Rebuild Dexter’s visual and interaction system around the appearance of first-party iOS 26 applications. The deliverable must feel coherent across every screen, sheet, form, empty state and active workout—not merely acquire blur and new colours.

The target is an offline HTML app running in Android WebView and modern browsers. Native-looking means closely matching Apple’s composition, material hierarchy, control geometry and motion; it does not mean the WebView can invoke UIKit’s native Liquid Glass renderer. All numerical tokens below are project starting values, not Apple specifications. Refine them against references and measured behavior.

> **Success means recognizable iOS 26 design, immediate interaction, and complete functional parity.** Preserve the four tabs, their order, the existing content sequence and all actions. Recompose components within those regions to remove the Material design language.

## 2. The direction we selected

Use a restrained first-party utility aesthetic: generous typography, grouped content, floating glass navigation, tactile controls and contextual transitions. Dexter must remain easy to operate between workout sets.

The following alternatives were considered. The middle approach is the chosen implementation direction; its core glass appearance is mandatory, while expensive optical refinements have explicit capability and performance gates.

| Approach | Benefit | Trade-off | Decision |
|---|---|---|---|
| CSS blur and colour changes on existing components | Fast to produce | Leaves the existing visual structure and interactions intact | Insufficient |
| Rebuilt iOS-style component system with real backdrop blur, controlled highlights, coordinated motion and selective refraction | High fidelity with a manageable WebView workload | Requires careful component and lifecycle work | Selected |
| A custom optical renderer across every surface | Potentially richer refraction | Large rendering, accessibility and maintenance burden; harder to preserve ordinary DOM controls | Outside this task |

## 3. The source that must remain authoritative

Inspect the repository before editing. The baseline observed during this review is shown below; if the branch has advanced, reconcile the new code before making changes.

Never use an old line-number map or the previous prompt’s method list as a substitute for reading the actual file. Preserve runtime blocks by structural boundaries and verify their contents afterward.

| Item | Verified baseline / instruction |
|---|---|
| Repository | `https://github.com/CosmicHigh/Dexter` |
| Branch inspected | `master` |
| Commit inspected | `3d8b0437445f5d7977edf2c1261cdaee45b61f3c` |
| Primary product file | `app/src/main/assets/Dexter.html` |
| HTML blob inspected | `657ba120942abc7a79418dac47055bf5b07ef473` |
| Runtime | Vendored React 18.3.1 / ReactDOM, DC runtime, `class Component extends DCLogic`, `React.createElement` |
| Android configuration | `app/build.gradle.kts`: minSdk 35, targetSdk 36 at this baseline |
| Storage key | `dexter.material.v1` — retain exactly |
| Existing checks | `tests/workout-features.test.cjs`, `tests/browser-smoke.cjs`, `tests/README.md` |
| Old prompt baseline | `e5afddf` — superseded by the feature commit above |

## 4. The behavior contract

The current app is the source of truth for calculations, handlers, data models and backup compatibility. Preserve business logic verbatim wherever possible; changes to presentation methods must retain their embedded behavior, not just calls to named helpers.

The inventory below is a minimum. Discover and protect any additional behavior present when implementation begins.

### Persistent data

| Field or contract | Required preservation |
|---|---|
| `program` | All days, exercise IDs, metadata, sets, rep limits, RIR, flags, references and the seven-slot `weekPlan` |
| `logs` | Date keys, day IDs, exercise-indexed set rows, `w`, `r`, `done`, and `progressVersion` |
| `dailyExercises` | Per-date/per-day additions; original exercise IDs and metadata; reload persistence |
| `progressResets` | Per-exercise generation numbers used to filter Progress without deleting History |
| `customCardioTypes` | Persisted IDs and names; inclusion in selectors, logs and summaries |
| `bodyweight`, `cardio`, `phase` | Existing values, date rules and aggregation behavior |
| `theme`, `accentKey` | Existing light/dark choice and six persisted accent keys |
| Export format | Current version-3 workout backup and all its fields |
| Legacy imports | Existing compatibility and field-by-field restore semantics; do not replace with a simplistic whole-store assignment |

Do not add the previous prompt’s persisted `glass` field. Accessibility preferences introduced by this redesign belong to the separate presentation-only preference store described in section 14. Do not migrate, rename, clear or “clean up” existing workout data.

### Newer features that must survive

| Feature | Behavior to preserve | Relevant current code |
|---|---|---|
| Add an exercise for today | Available from Today and the active session; does not edit the saved routine; excludes IDs already present; reuses the selected exercise ID | `activeExercises`, `dailyExtras`, `workoutDay`, `exerciseMeta`, `availableDailyExercises`, `addDailyExercise`, `dailyAddButton`, `todayExerciseSheet` |
| Progress-only reset | Select one or more exercise trackers; increment reset generations; retain all workout History; new same-day activity participates in the new generation | `progressRowsFor`, `resetExerciseProgress`, `progSelectMode`, `progSelected`, `exPickerSheet`, `sessionView`’s `setRow` |
| Custom cardio | Trim and normalize names; reject empty/case-insensitive duplicates; create and select the new type; keep logging, summaries and restore working | `createCardioType`, `cardioTypes`, `cardioTotalsLast`, `cardioCreateSheet` |
| Daily exercise history | Resolve metadata and planned totals using the appropriate date; retain shared-ID tracking behavior | `exerciseMeta`, `workoutDay`, `daySummary`, `dayDetailSheet` |

### Existing interaction and calculation rules

| Area | Required behavior |
|---|---|
| Set logging | Kg step 2.5; repetitions step 1; timed step 5; minimum 0; current rounding; core exercises identified by `rir === '—'` retain their current control behavior |
| Completion | Preserve missing-repetition defaults, done/undone toggle, previous-session ghost values and exact `progressVersion` assignment rules |
| Progression prompt | All sets done and at the upper rep limit, once per exercise per session, excluding core; retain the existing approximately 400 ms timer and suggested `lastW(ex.id) + 2.5`; dismissal does not change weight automatically |
| Session navigation | Start, close, Next, Finish, exercise jumps, empty-day handling and out-of-range index correction |
| Metrics | Existing Epley calculation, top-set selection, volume, deltas, dates, workout counts and reset filtering; do not introduce new rounding or units |
| Cardio | Positive-minute validation; current logging/deletion behavior; 14-day chart, 7/30-day totals and newest-30 list; dynamic custom types included |
| Bodyweight | Save/upsert for today, existing validation and graph eligibility |
| History | All stored generations remain available; planned/done counts, skipped states, exercise names and date labels |
| Program editor | All eight views: program, day, ex, addex, copy, move, week, newday; retain duplicate/current-day disabled states, ID rules, copy/move semantics and deep-copy behavior |
| Delete day | Existing minimum-day restriction and conversion of affected week slots to `rest` |
| Reset program | Existing two-tap confirmation, no added timeout; closing settings clears confirmation; logs retained |
| Toasts | Current messages, kind and 2500 ms id-guarded expiration; visual dismissal must not revive an expired toast |
| Backup bridge | `window.Android.exportFile`, `window._exportCb`, `window.Android.importFile`, `window._importCb`; browser file/paste/download fallbacks |
| Copy | Keep existing product wording, labels and errors; remove CSS-forced uppercase from ordinary headings. Preserve acronyms such as RIR and user-entered names exactly |

## 5. The visual reference, before coding

Study official iOS 26 footage and frame examples before selecting final shapes and timings. Use the same reference across the redesign so individual controls do not look borrowed from unrelated platforms.

Apple’s presentation describes a separate glass control layer, adaptation to underlying content, restrained tinting, and avoidance of stacked glass. Treat these as the guiding material principles [A1]. The geometry and runtime strategy in this brief are Dexter-specific engineering decisions.

1. Read/watch [A1] and [A2], especially tab bars, toolbar groups, interactive controls and sheets.
2. Capture a small reference board locally from available official visuals: tab bar, toolbar, switch, grouped form and medium/large sheet. Record source URL and timestamp where applicable. If only still images are available, state that motion was not observed.
3. Capture Dexter’s baseline screens with representative existing data and its empty states.
4. Build one representative slice: Today, floating tab bar, active set controls and Settings sheet. Include both themes.
5. Compare silhouettes, type hierarchy, spacing, fill opacity, edge definition and motion. Refine before applying the system throughout the app.
6. Continue through all screens after the slice meets the design and performance requirements; a prototype alone is not the finished deliverable.

## 6. The material hierarchy

Use glass where it establishes controls above content. Workout information stays stable and legible while navigation and transient controls have depth, transmitted colour and tactile response.

Avoid fake status bars, home indicators, phone frames, decorative lens flares, moving wallpaper or imitation OS branding. Keep Dexter’s identity in content accents and typography.

| Layer | Treatment | Limits |
|---|---|---|
| Page | Neutral grouped background; optional static, very faint accent wash localized to the Today hero | No full-screen animated gradient blobs; all page/wrapper backgrounds follow theme |
| Content | Borderless grouped surfaces, restrained separators, clear text hierarchy | No backdrop blur on cards, log rows or exercise tiles |
| Floating controls | Regular-style glass approximation with backdrop blur, translucent body, restrained rim and elevation | Glass must remain perceptible without looking like a bright outlined plastic capsule |
| Selected segment/tab | Thin fill, local highlight and depth within its host | No second backdrop filter inside a glass host |
| Modal backdrop | Dim scrim | No full-screen blur |
| Sheet | One glass surface at medium height; becomes mostly opaque at large height | Inner controls use fills, never nested backdrop filters |
| Toast | Compact transient surface | When over an open glass sheet, use an opaque/translucent fill without a second sampling blur |

## 7. The component system

Replace the old components and inline visual decisions systematically. Centralize semantic tokens and reusable rendering helpers so a component looks and behaves the same everywhere.

These replacements are mandatory. Retain the existing information order and action availability even where a new component has a different internal layout.

| Existing treatment | Replacement |
|---|---|
| Roboto/Roboto Flex and heavily weighted compact labels | Platform system type on Apple devices; bundled, licensed Inter variable fallback for Android; calmer type hierarchy |
| Material Symbols font | Small, consistent bundled SVG symbol set, with semantic mappings and explicit missing-icon checks |
| Full-width tonal bottom navigation with individual pill indicators | One floating glass capsule with one smoothly moving selection overlay |
| Tonal cards with outlines and repeated shadows | Grouped content surfaces; shared containers for related rows; shadows reserved primarily for floating controls |
| Gradient-heavy hero and decorative circles | Spacious content hero, neutral surface, accent-coloured title or key number, one prominent action |
| Checkmarked Material switch | iOS-inspired pill switch, solid thumb at rest, subtle stretch and illumination on interaction |
| Dashed add buttons | Tinted plus action or a full-width grouped add row |
| Opaque generic bottom sheet | Inset medium sheet, clear title/action hierarchy, responsive detents and reversible presentation |
| Repeated bounce/stagger on every screen update | Short contextual transitions; state changes update in place |

### Typography and geometry

Use the following baseline in CSS pixels at a 16 px root, expressed in rem for type. Do not copy SF-specific tracking mechanically onto Inter; tune by rendering actual Dexter names and numeric values.

| Role | Starting size / line-height / weight | Rules |
|---|---|---|
| Large screen title | 34 / 41 / 700 | Left aligned, normal or slightly negative tracking |
| Hero title | 28 / 34 / 650–700 | May wrap; no forced single-line truncation of essential information |
| Sheet/session heading | 22 / 28 / 650 | Allow multiline exercise names |
| Main body/control label | 17 / 22 / 400–600 | Stable baseline and comfortable touch spacing |
| Secondary label | 15 / 20 / 400–500 | Must retain useful contrast |
| Caption | 13 / 18 / 400–500 | Use sparingly; not for primary actions |
| Tab label | 11–12 / 14–16 / 500–600 | Always readable at normal size; layout adapts to larger text |
| Large value | 34–44 / 1.1–1.2 / 650–700 | Tabular numerals; stable unit alignment |
| Page spacing | 16 px sides; 20–24 px between major sections | Narrow-screen padding may reduce to 12 px |
| Content cards | 24–28 px radius; 16–20 px padding | Nested radii follow padding approximately, with visual correction |
| Row | At least 56 px; taller for two lines | No fixed height that clips scaled text |
| Toolbar target | At least 44 × 44 px | Prefer 48 px where space permits |
| Primary action | At least 52–56 px tall | Capsule; text can grow without clipping |
| Sheet | Around 32–38 px corner radius | Medium floats with 8 px side/bottom inset; large approaches container edges |

### Colour tokens

Use one selected app accent for navigation and primary actions. Keep category colour inside data/content where useful: cardio teal, strength/progress amber, History coral. All six existing accent keys remain selectable.

| Token | Light starting value | Dark starting value |
|---|---|---|
| Page | `#F2F2F7` | `#000000` |
| Content surface | `#FFFFFF` | `#1C1C1E` |
| Inset surface | `#F0F0F5` | `#2C2C2E` |
| Primary label | `#161619` | `#F5F5F7` |
| Secondary label | `#5D5D66` | `#B8B8C0` |
| Violet | `#8940B4` | `#D49AFF` |
| Teal | `#006D77` | `#65D5DE` |
| Coral | `#B94325` | `#FFA18A` |
| Amber | `#855000` | `#FFBC57` |
| Pink | `#BB2453` | `#FF91B1` |
| Blue | `#0062CC` | `#79B8FF` |

These accent values are starting foreground colours, not an instruction to use identical values for every fill. Define separate accent text, subtle fill, prominent fill and on-fill label tokens. Verify every combination; use a darker fill or near-black label when white does not pass. Avoid very low-alpha grey for meaningful hints or placeholders.

## 8. Glass that looks deliberate

The baseline material must combine real transmitted background colour, modest blur, edge definition and elevation. Blur alone is insufficient, but stronger optical effects must not distort labels or make routine input expensive.

Use **one backdrop sampling surface per glass component**. Put rim/highlight decoration on pseudo-elements and actual text/icons above the effect surface. Never filter the text itself.

### Starting recipe and adaptation

| Part | Starting treatment | Implementation boundary |
|---|---|---|
| Backdrop | 16–20 px blur, saturation around 1.2–1.35 | Constant during interaction; tune with reference and contrast checks |
| Light body | Neutral light translucent fill, initially around 0.65–0.80 alpha | Increase opacity over busy content; not a universal guarantee of contrast |
| Dark body | Neutral charcoal translucent fill, initially around 0.65–0.82 alpha | Retain depth while keeping labels readable |
| Rim | Thin upper-edge highlight plus much weaker lower/side definition | No equally bright white border all around |
| Elevation | Soft local shadow, stronger for sheets than small controls | Static shadows; animate the opacity of a prepared shadow layer if needed |
| Touch response | Localized highlight and slight compression | Highlight on pointer press, brief decay on release; no continuous shimmer |
| Content adaptation | Conservative fill and precomputed theme variants; strengthen separation when content passes under bars | Do not claim to sample background luminance unless actually implemented and tested |
| Glass colour | Mostly neutral; subtle accent tint on selected/primary controls | No saturated rainbow rims or chromatic fringes |

This is a Regular-style approximation. Do not conflate Apple’s Regular/Clear material variants with similarly named user-facing transparency preferences. Dexter has no requirement for a media-oriented Clear material. Do not add a “Clear/Tinted/Solid” selector to satisfy a visual checklist.

### Selective optical enhancement

Implement and evaluate a small refraction prototype on the tab-bar body and one standalone control. Enable it only when it improves the reference match and passes actual rendering and performance checks; record the decision in the implementation notes.

1. Test SVG displacement with a visible geometric backdrop on the target browser/WebView. `CSS.supports` and a Chromium user-agent check are only preliminary signals, not evidence of correct rendering.
2. Keep displacement concentrated at a shallow rim; center content stays stable. Do not use full-surface watery distortion.
3. Give independently sized or animated instances unique filter IDs. Share an immutable filter only for truly identical geometry; never mutate a shared filter to animate one instance.
4. Generate maps on size changes outside active gestures, cache bounded results, and release observers/resources when nodes disappear. No per-frame canvas generation or DOM readback.
5. Keep any filter off the text/icon subtree. No displacement on sheets, long lists or whole screens.
6. Avoid animating filter parameters in production by default. Prefer motion of the existing shell and opacity of its highlight; parameter animation requires its own measured pass.
7. On a failed enhancement gate, ship the polished baseline material and explicitly state which optical behavior is approximated. Do not silently substitute opaque flat controls everywhere.

## 9. Navigation that feels attached to the content

Keep the four existing tab IDs and labels: `today` → Today, `conditioning` → Cardio, `progress` → Progress, `history` → History. The bar remains a stable part of the shell while screen content changes.

Use a floating capsule inset about 16–20 px horizontally and 8–12 px above the bottom safe area, with a nominal height of 64–68 px. Enlarge it when text scaling requires; it must not become a fixed-height clipping box.

1. Render a single glass bar body. Each tab has an icon, a label, a semantic target and a visible selected state.
2. Render one selection overlay behind icon/label content using a fill and restrained highlight. It moves continuously between measured tab positions; it has no separate backdrop filter.
3. Keep the bar and selection overlay mounted with stable keys across normal renders. Use separate wrappers for positioning, travel and press scale so transforms do not overwrite one another.
4. Commit a tapped tab immediately. Animate the visual transition afterward. Fast repeated taps must retarget from the current position, not queue four animations.
5. For drag selection, preview the nearest tab while dragging; commit once on release. Use a small movement threshold, pointer capture and cancel handling. Suppress the synthetic click after a drag; restore the original selection on cancellation.
6. On tab change, use a short crossfade with at most 8–12 px directional translation. Avoid card-by-card stagger and whole-page zoom. Keep the outgoing visual inert and remove it promptly; do not run business logic again just to render an exit.
7. Preserve in-memory scroll positions per tab as presentation state. Do not reset a screen’s scroll or an input’s value merely because theme, accent, toast or selection changed.
8. Keep the full four-item bar visible by default. The old prompt’s mandatory shrinking to a single selected icon is removed: it hides destinations and adds unnecessary gesture complexity. Do not add auto-minimize in this pass.

### Top chrome and scroll edges

Use a large title in the content flow with a compact title appearing when it scrolls away. Retain Today’s theme and settings actions in a single floating group; preserve other existing settings entry points.

| Element | Requirement |
|---|---|
| Top toolbar | Stable touch targets, neutral labels, shared glass group for adjacent actions |
| Title collapse | Ref-driven CSS variables; no app state updates on every scroll event; no layout jumps |
| Scroll edge | Soft background fade; add a small masked blur only if tested and needed |
| Bottom edge | Prefer a fade under the bar; avoid an extra full-width blur by default |
| Content clearance | Enough top/bottom padding that titles, final rows and focused fields are never hidden beneath floating chrome |
| Desktop | Center the current approximately 460 px app column; avoid a fake device frame or a new dashboard layout |

## 10. Sheets with convincing weight

Use one shared presentation system for all sheet types, including the newer daily-exercise and custom-cardio sheets. Keep the existing content and action semantics; visual transitions must not become dependencies of business logic.

Medium sheets float inside the viewport. Large sheets become more opaque and approach the container edges, following the direction demonstrated in Apple’s UIKit session [A2].

### Sheet behavior

1. Use auto-height for short reference/progression/pick-day content. Use medium/large detents for longer Settings, editor, History detail and exercise lists. Choose the initial detent that exposes primary actions; do not force a cramped medium sheet on every form.
2. Derive usable height from the actual visual viewport and safe areas. When the keyboard appears, keep the focused field and its action reachable; allow normal content scrolling immediately.
3. Dragging the grabber/header controls the sheet. Content pans scroll the content; transfer a downward drag to the sheet only when the scroll container is at its top and the gesture clearly intends dismissal. Never hijack text selection, input interaction or list scrolling.
4. Use a short transform-led presentation from the bottom. A contextual source transition may connect the opener to the sheet using a temporary, inert shell; crossfade content at its final readable geometry rather than stretching live text.
5. Do not require a large animated `clip-path` over a blurred sheet. Use it only if a measured prototype is both smoother and more faithful than the simpler shell transition.
6. Retarget or cancel on rapid open/close gestures. Complete cleanup on finish, cancellation or a bounded fallback timer; never depend solely on `transitionend`.
7. Maintain one interactive sheet at a time. When a handler replaces Settings with Editor, run its state change immediately and coordinate the visual handoff. Any retained outgoing shell is inert and cannot save, submit or receive focus.
8. Background becomes inert; focus enters the dialog and stays within it; Escape closes; focus returns to the opener if it still exists. Preserve scrim-tap dismissal and visible close/back controls. Match the wrapper’s existing Android Back behavior rather than inventing a competing navigation stack.
9. For detent movement, transform the shell while keeping text at normal scale. Commit geometry at stable boundaries where feasible; if height must change during a gesture, confine layout work to the sheet and profile it.

### Inner controls

| Component inside a sheet | Treatment |
|---|---|
| Rows and fields | Quiet translucent or opaque fills with sufficient contrast |
| Primary button | Accent fill with tested label contrast |
| Switch/segmented thumb | Fill, highlight and shadow; no sampling blur |
| Destructive action | Red text/fill consistent with existing confirmation semantics |
| Nested navigation | Directional content transition; stable header and accessible Back/Done controls |

## 11. Every Dexter screen, completely covered

Apply the new system to every listed state. Preserve content sequence and existing routes; a visually complete Today screen does not compensate for a legacy editor or a missing new control.

Use **the same component grammar throughout the app**. Controls such as add, delete, choose, save and dismiss must remain visually and behaviorally consistent.

| Screen/state | Required composition and coverage |
|---|---|
| Today: training day | Large Dexter title, existing date information, neutral spacious hero with coloured title/key values and prominent Start action; grouped exercise plan; daily-add action; weekly schedule |
| Today: rest day | Quiet recovery card with current copy, Train anyway, program editing and weekly schedule; keep current daily-add availability rules |
| Weekly schedule | Seven readable day cells; restrained selected/today emphasis; preserve whole-card editor entry and assignment behavior |
| Active session | Compact header and progress ring, exercise title/muscle labels, prescription values, clear set rows, previous-value hints, exercise navigator, daily-add action and bottom Next/Finish control |
| Set rows | Aligned numeric columns, clear Kg/Reps/Secs labels, large minus/plus and complete targets; done state uses restrained fill and a check, not a neon wash |
| Daily exercise picker | Current eligible list and empty state; identify its today-only purpose using existing copy; preserve ID reuse and exclusion rules |
| Cardio | Current logging area, type selection, custom-type creation, minutes field, Log, 14-day chart, totals and recent sessions |
| Custom cardio types | Dynamic selector that handles many types and long names: horizontally scrollable choices or an accessible picker; never assume exactly three equal segments |
| Custom-cardio sheet | Text entry, current validation and Create action; keyboard-safe layout and selected new type after creation |
| Progress | Workout counts, bodyweight, per-exercise selection, e1RM where eligible, top-set/volume tiles, deltas, This/Last session, settings entry |
| Exercise selection/reset | Preserve ordinary selection and multi-select mode; checkbox states, Cancel and Delete progress count; retain History-preservation explanation |
| Bodyweight | Stable field, Save, latest value and actual graph eligibility; long values/units do not shift the action offscreen |
| History | Grouped date/day rows with completion information; empty state; full detail sheet with retained old generations and skipped exercises |
| Settings | Theme switch, six accent choices, program editor entry, backup actions, presentation accessibility controls, existing program reset sequence |
| Editor: program/day | Readable day/exercise lists; all reorder, copy, move, remove and delete actions retained; if actions need a compact disclosure, all must remain reachable and named |
| Editor: exercise | Name, primary/assist, set and rep limits, RIR choices, flags and reference text; no hidden fields or accidental commit changes |
| Editor: add/copy/move | Custom creation and all library entries; current/already-added disabled states and correct destinations |
| Editor: week/newday | All seven assignments and exact creation defaults |
| Reference | Complete existing exercise cues, stretch/disc notes and timed/repetition labels |
| Progression | Existing threshold and suggestion; readable static number; short appearance without count-up that delays understanding |
| Restore | Native/file/paste paths, warnings and validation; working textarea selection and keyboard layout |
| Toast | Current message, compact surface, appropriate semantic icon and colour; visible above safe areas and current primary controls |

### Reusable controls

| Control | Native-looking direction | Interaction guard |
|---|---|---|
| Switch | Capsule track, rounded solid thumb; modest thumb stretch and soft inner illumination while pressed | Full hit area at least 44 px tall; Space and pointer operation; no Material check glyph |
| Stepper | Unified capsule/group, balanced plus/minus targets, stable tabular number | Commit each tap immediately; no mandatory rolling-digit animation; do not add press-repeat behavior unless it already exists |
| Segmented selector | Quiet track and single traveling overlay | Handle text scaling, keyboard arrows and dynamic item counts |
| Add row | Plus symbol and accent label | No dashed border; preserve action placement |
| Charts | Clear grid, restrained fill, readable labels; existing formulas/data unchanged | No replay on set/input updates. Read-only scrub is optional and must not block vertical scrolling or add a blurred callout over glass |
| Primary CTA | Capsule with controlled tint and consistent pressed feedback | Correct contrast in every theme/accent; never always-white text without checking the fill |
| Icon action | Consistent glyph weight, optical alignment and visible focus | Semantic label and real hit area, including 32–36 px visible glyph containers |

## 12. Motion with no waiting

The app should feel connected to the user’s finger, then settle promptly. The values below are tuning ranges for Dexter, not measurements of Apple’s private animation system.

**State updates immediately; animation follows.** Preserve existing intentional timers such as the progression prompt, but never delay save/delete/navigation merely to finish an effect.

| Event | Motion target | Starting timing / amplitude |
|---|---|---|
| Press | Small compression plus local highlight | 70–100 ms to scale around 0.97–0.985; smaller compression for large buttons |
| Release | Quick damped return | 180–260 ms; little or no visible overshoot |
| Tab selection | Continuous travel with slight directional stretch | 220–300 ms; peak stretch around 1.04–1.07; independently wrapped from translation |
| Tab content | Short fade and small directional travel | 160–220 ms; no global zoom or list cascade |
| Sheet open/close | Weighted, reversible translation; restrained scrim fade | 280–360 / 200–280 ms |
| Detent release | Velocity-aware settle | Approximately 250–380 ms, adjustable to travel distance |
| Source connection | Temporary shell grows/moves, content fades at final geometry | 260–360 ms; no live text stretch |
| Session enter/exit | Vertical cover motion | 280–360 / 220–280 ms; avoid scaling the entire blurred app beneath it |
| Exercise change | Short directional transition | 180–240 ms, 12–20 px; retain stable set controls when only a value changes |
| Set complete | Check appears and row fill changes | 140–200 ms; one modest pulse at most |
| Stepper value | Immediate number replacement; optional very short opacity change | 0–100 ms; no queued odometer |
| Toast | Small rise and fade | 160–220 ms; fit within the existing lifetime |
| Theme/accent | Limited surface/label transition | 160–220 ms; no universal `transition: all` |
| Charts | Optional first-entry reveal | At most 250–350 ms; skip on routine rerenders and large datasets |
| Idle | None | No ambient drift, looping shimmer, sensor listeners or continuously running spring loop |

### Animation ownership

1. Use transform and opacity for most motion. Background/colour changes may paint; keep their scope small. Profile clipping, SVG strokes, filters and geometry instead of assuming compositor acceleration [W1].
2. Separate wrappers for placement, motion and tactile scale. One controller owns each animated property; CSS transitions, WAAPI and a gesture spring must not fight for the same transform.
3. Preserve current position when retargeting. Cancel previous work cleanly; do not start a new animation from its old origin.
4. If using a spring integrator, use consistent seconds and px/s, real elapsed time, bounded substeps after long frames, an explicit rest threshold and cancellation. Stop at rest and when hidden. Tune from recordings; do not claim a hand-written easing curve is an exact Apple spring.
5. Keep live data and animated display state separate. A deleted cardio record is removed/saved immediately; a temporary inert visual row may animate away without keeping the record alive.
6. Reduced motion removes travel, scale, stretch, parallax, scrub interpolation and chart reveals. Use immediate changes or brief opacity transitions. Cleanup and deletion still run when no animation event fires.

## 13. The runtime that keeps it smooth

Dexter’s React tree can rerender frequently while logging. The new presentation must survive these renders without remounting controls, losing focus or restarting entrance effects.

Keep business state in the existing model and motion resources in a small, separately owned presentation controller. Do not introduce a framework migration, router, global state library or perpetual render loop.

1. Preserve vendored React/ReactDOM and DC runtime blocks. Keep the component-script boundary, `data-props`, `{{ app }}` binding and `/* __END__ */` marker. Do not use old absolute line numbers for splicing.
2. The DC template compiler uses double-brace bindings. Avoid accidental `{{`/`}}` sequences in generated template/CSS text outside the intentional binding. Component script text must not accidentally contain a closing HTML script tag.
3. Put SVG symbols/filter definitions in the rendered app tree, not in `<helmet>` expecting SVG hoisting. Use unique IDs across concurrently mounted trees; never insert unescaped user data as SVG/HTML.
4. Preserve stable keys for screens, controls, fields, tabs and row identities. Theme/accent/toast updates must not recreate active inputs or reset textarea cursor position.
5. Register listeners/observers once per owned node and release them when it leaves. Repeated ref callbacks must not accumulate subscriptions. Verify the actual DC lifecycle before assuming React class hooks behave identically.
6. Scroll/pointer updates write to local refs/CSS variables, coalesced to one rAF. They do not call `go`, `commit`, `forceUpdate` or `save` every frame. Business handlers continue using their existing state paths.
7. Read layout in a measurement phase; write afterward. Cache geometry and refresh on relevant resize/font/viewport changes. Avoid forced layout inside repeated pointer moves.
8. No blanket `translateZ(0)` or permanent `will-change` across the tree. Promote only demonstrated hot surfaces; remove hints after animation where useful.
9. Keep filters off large scroll containers. Use one glass surface for a toolbar group rather than one per adjacent button. When a sheet covers the screen, suspend obscured glass effects.
10. Use list optimizations only after checking their effect on measurement, scroll restoration and focus. Do not blindly combine containment with effects that need to overflow card bounds.
11. Check the Android wrapper’s existing inset and keyboard handling. Apply safe-area padding once, avoiding double insets. Do not assume `env(safe-area-inset-*)` alone represents Android’s actual system bars.
12. No runtime CDN/fonts/icons requests. Package actual assets offline and retain appropriate licence notices. Measure the final file size; do not promise the old prompt’s 0.45 MB estimate.
13. Current Node tests extract the class, not arbitrary preceding helpers. Keep logic-used helpers inside the class or update the extraction harness narrowly to load the real component script. Do not weaken assertions or require a browser merely to run data tests.
14. Maintain visual-only transition bookkeeping so outgoing views do not repeat methods that mutate data during rendering. Existing `sessionView` calls `ensureSessionLog`; do not call it a second time merely to obtain an exit snapshot.

## 14. Accessibility as part of the design

Provide readable glass in both themes and all accents. OS preferences alone may not be consistently exposed through Android WebView, so the design includes explicit presentation controls.

Ordinary text needs at least 4.5:1 contrast; qualifying large text may use 3:1 [W2]. Evaluate composited glass over representative light, dark and busy content rather than checking only a nominal token pair.

| Requirement | Implementation |
|---|---|
| Reduce motion | Follow `prefers-reduced-motion` when exposed, plus a Settings override |
| Reduce transparency | Follow `prefers-reduced-transparency` when exposed, plus a Settings override; replace sampling effects with fully opaque readable surfaces |
| Increase contrast | Honor `prefers-contrast: more` where exposed; stronger text/control distinction and visible focus; test it independently of motion |
| Preference storage | New local key `dexter.presentation.v1`, object `{reduceMotion:false, reduceTransparency:false}`; effective reduction is OS request OR local toggle; default false follows the OS rather than overriding it |
| Compatibility | This key contains no workout data and does not change existing workout save/export/import/reset behavior; storage errors fall back safely |
| Text scaling | Test 100%, 130% and 200%; allow rows, sheets and controls to grow/reflow; no essential clipped labels |
| Zoom | Remove `user-scalable=no` and maximum-scale restrictions from viewport declarations; preserve `viewport-fit=cover`; verify wrapper behavior separately |
| Targets | At least 44 × 44 CSS px including hit area; 48 px where practical; targets may not overlap |
| Semantics | Real buttons and labelled fields; switch state; selected tab; keyboard-operable selectors; visible focus; no colour-only completion state |
| Modals | Labelled dialog, focus containment/restoration, background inert, close action and keyboard support |
| Charts | Text summary of the data; scrub cannot be the only route to values |
| Announcements | Polite toast/status messages; avoid announcing decorative motion or every intermediate scrub position |

## 15. Performance must be demonstrated

A count of blurred elements is not a sufficient performance budget. Filtered area, overlap, device pixel ratio and moving content underneath can matter more than the number of nodes.

The following are project acceptance targets. Record the device, WebView/browser version, refresh rate, data fixture and test conditions; distinguish physical-device measurements from desktop emulation.

1. Start with the baseline glass implementation. Measure the representative slice before extending it everywhere.
2. On a representative 60 Hz Android device, aim for smooth scrolling and transitions near 60 fps; investigate any sustained run below 55 fps or visible stalls. For 90/120 Hz screens, evaluate against their actual frame interval rather than a fixed 24 ms threshold.
3. Record repeated tab changes, sheet open/close/drag, session logging and a History fixture with at least 200 dates. Keep data realistic enough to exercise current calculations and render costs.
4. Target immediate visible feedback on touch and no animation-induced long task above 50 ms. A desktop trace cannot certify the APK’s behavior.
5. Inspect paint/compositing work and main-thread traces, not only rAF deltas. An animated backdrop can cost rendering time even when JavaScript is idle.
6. For optional refraction, compare baseline/enhanced recordings on the same device. Disable that enhancement if it introduces visible stutter or repeated missed frames; preserve the baseline glass styling and motion.
7. Any runtime degradation is one-way for that app session, operates only on decorative enhancement, and accounts for visibility changes and refresh rate. It must not change data or leave half-finished gestures.
8. If baseline glass is too costly, first reduce filtered area, remove optional scroll-edge blur and pause covered surfaces. Preserve the floating geometry, typography, interaction and core material treatment.
9. Verify idle behavior: no ongoing rAF loop after settling and no animation work while the document is hidden. Inspect repeated open/close cycles for growing listeners or DOM/filter nodes.
10. If no physical Android device is available, complete browser verification and label Android performance, keyboard, bridge and inset checks as pending. Never fabricate a device pass.

## 16. The implementation sequence

Work against a fresh repository checkout and its applicable instructions. The task is to change presentation while preserving the inspected behavior, so make changes in reviewable stages and keep a working baseline.

The old extract/splice appendices are removed. This brief intentionally supplies requirements rather than claiming that missing scripts are executable; the implementation agent must deliver actual working code and any scripts it chooses to use.

1. Read repository guidance, the current HTML, Android bridge/inset configuration, and existing tests. Record the actual starting commit and working-tree state.
2. Capture baseline data fixtures and run existing relevant checks before editing. Record existing failures separately from regressions.
3. Build the reference board and representative visual slice described in section 5. Compare both themes and active interaction states.
4. Establish tokens, offline typography/icons, glass surface helpers, motion ownership and the sheet/tab shell.
5. Replace every presentation component in section 11; port embedded callbacks faithfully from the current source. Include all newer daily/progress/custom-cardio behavior.
6. Use structural file edits that preserve runtime blocks. If a build script is useful, write and run it locally; fail on ambiguous/missing markers rather than silently replacing the wrong region.
7. Preserve unrelated Java, Gradle, Manifest and bridge behavior. If an actual inset/keyboard issue requires a narrow wrapper adjustment, explain and test it; do not assume such changes are inherently required or inherently forbidden.
8. Run functional checks, inspect screenshots and interaction recordings, test keyboard/accessibility states, and profile the browser. Fix concrete regressions before adding optional optics.
9. Evaluate the refraction enhancement and document the decision. Keep the feature complete if that enhancement cannot meet its gate.
10. Produce the completed app change and concise evidence described below. Repository commit/push/PR actions follow the user’s actual authorization and environment workflow; this document is not a request to merge or deploy automatically.

## 17. Verification against real failure modes

Run the existing tests without weakening their behavioral assertions. Extend them only where new presentation lifecycle or event routing introduces a concrete risk; do not substitute token/class-name checks for usable interactions.

Use the repository’s documented commands, adapting dependencies only as its instructions require:

```sh
node tests/workout-features.test.cjs
node tests/browser-smoke.cjs
```

The existing browser check has special handling for the runtime’s optional self-fetch. Read `tests/README.md`; an HTTP preview alone is not proof of behavior under the APK’s `file://` origin. Android test tasks and on-device verification remain separate.

### Functional acceptance

| Scenario | Evidence required |
|---|---|
| Existing stored profile | Same workout data after loading, logging, reloading and exporting; visual preferences stored separately |
| Daily additions | Add from Today and active session; no routine mutation; same ID; duplicate excluded; survives reload; appears correctly in History |
| Progress reset | Multi-select reset retains old History; trackers filter the old generation; new same-day logging uses the correct generation; backup round-trip preserves it |
| Cardio | Default and multiple custom types; long names; invalid/duplicate type; minutes validation; totals and delete; current/legacy restore |
| Session | Weighted, core and timed exercise; repeated steppers; complete/undo; previous values; exactly-once progression trigger; Next/Finish and daily-add |
| Program editing | All eight editor views and actions; reorder, copy, move, delete-day/week updates; disabled actions remain disabled |
| Backups | Browser export/import/paste plus native bridge success, cancellation and fallback where testable |
| Data metrics | Same fixture produces identical e1RM, volume, deltas, planned/done counts and date ranges before and after |
| Rapid gestures | Tap between tabs rapidly, interrupt sheet open/close, pointercancel, change exercise while a toast appears; no stuck overlay or duplicate action |
| Animation disabled | Logging, deletion, reset, focus restoration and cleanup work without transition events |
| Input stability | Type in all editable fields; change presentation state; no cursor jump, lost value or unwanted blur |
| New a11y preferences | Reload persists toggles; effective OS reductions cannot be overridden off; workout backups unchanged |

### Visual and device acceptance

| Matrix | Required coverage |
|---|---|
| Themes/accents | Every screen in light and dark; all six accents on hero, primary control, selection, switch and Settings |
| Width/scale | 320, 360, 390, 430 CSS px and desktop; 100%, 130%, 200% text scaling; landscape where supported |
| Content states | Empty/populated tabs, rest/training day, done/undone sets, long names, many cardio types, History with 200 dates |
| Sheets | All sheet types; initial and expanded geometry; scrolled content; keyboard open; close/back/focus behavior |
| Motion | Record tab selection, touch feedback, sheet drag, session change and rapid interruption; still screenshots cannot prove fluidity |
| Offline | Cold-load actual packaged assets without network; no missing font/icons or runtime requests needed for operation |
| Android | Actual keyboard, system bars, export/import bridge, Back behavior and scrolling when available |

Reject the visual result if any major flow still uses legacy Material controls, if the result is uniformly frosted cards, if text and controls are stretched during morphs, or if chrome hides content at rest. Correct those defects before claiming the overhaul is finished.

## 18. What the implementing agent must return

The deliverable is a working, complete presentation overhaul plus verifiable evidence. Do not return a partial CSS overlay, a plan without implementation, or a screenshot-only mockup when asked to implement this brief.

| Deliverable | Required contents |
|---|---|
| Updated `app/src/main/assets/Dexter.html` | All screens and controls; existing runtime/data/bridge behavior preserved; self-contained offline assets |
| Any supporting files | Actual scripts/assets/tests used, with complete contents and licences; no unresolved substitution markers |
| Review summary | Starting commit, changed files, what changed visually, preservation approach and material limitations |
| Functional evidence | Commands run and results; existing failures distinguished; no “passed” without execution |
| Visual evidence | Representative screenshots and short interaction recordings for both themes |
| Performance evidence | Device/browser details, measured scenarios and whether optional refraction was retained |
| Remaining limitations | Exact pending physical-device checks and justified approximations; no claim of pixel-perfect native rendering without comparison |

## 19. Sources and the boundary of their claims

These sources establish platform design principles and web engineering constraints. The proposed components, tokens, animation ranges, feature-preservation rules and implementation sequence are this brief’s recommendations for Dexter.

Use official source material to validate the design; do not replace it with community glass demos as the visual authority. Some Apple documentation pages require JavaScript; the official session transcripts are readable alternatives.

| ID | Source | Used for |
|---|---|---|
| A1 | [Apple — Meet Liquid Glass, WWDC25 session 219](https://developer.apple.com/videos/play/wwdc2025/219/) | Material hierarchy, adaptation, interaction response and restrained use |
| A2 | [Apple — Build a UIKit app with the new design, WWDC25 session 284](https://developer.apple.com/videos/play/wwdc2025/284/) | Native component and sheet examples |
| A3 | [Apple — Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass) | Further implementation reference for Apple platforms; not a WebView API |
| W1 | [Google web.dev — How to create high-performance CSS animations](https://web.dev/articles/animations-guide) | Rendering cost, animation properties and profiling |
| W2 | [W3C — Understanding WCAG 2.2 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) | Text contrast thresholds |
| R1 | [Dexter baseline source](https://github.com/CosmicHigh/Dexter/blob/3d8b0437445f5d7977edf2c1261cdaee45b61f3c/app/src/main/assets/Dexter.html) | Current behavior and state model inspected for this brief |
| R2 | [Dexter test instructions](https://github.com/CosmicHigh/Dexter/blob/3d8b0437445f5d7977edf2c1261cdaee45b61f3c/tests/README.md) | Existing verification workflow |

## 20. The final decision rule

Preserve the user’s app while replacing its complete presentation system. Judge the result by its actual appearance, feel and behavior across the full app.

```text
Current Dexter behavior and data remain intact.
Every component adopts the coherent iOS 26 visual system.
Motion responds immediately, interrupts cleanly and settles promptly.
Measured verification determines whether the implementation is complete.
```
