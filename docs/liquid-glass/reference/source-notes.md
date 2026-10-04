# Liquid Glass reference record

Collected 4 October 2026, 11:27 UTC for Dexter's presentation redesign.

## Official source targets

These are the official Apple sources designated by the supplied implementation brief. They remain the visual authority. Their content was **not fetched or viewed in this environment**.

| ID | Official Apple source | Reference purpose | Local availability |
|---|---|---|---|
| A1 | [Meet Liquid Glass — WWDC25, session 219](https://developer.apple.com/videos/play/wwdc2025/219/) | Material hierarchy, content adaptation, interaction response, restrained use | Page, video and transcript unavailable |
| A2 | [Build a UIKit app with the new design — WWDC25, session 284](https://developer.apple.com/videos/play/wwdc2025/284/) | Native tab bars, toolbar groups, controls and sheets | Page, video and transcript unavailable |
| A3 | [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass) | Apple platform adoption guidance | Documentation unavailable |

Open [reference-board.html](reference-board.html) locally for the six component reference targets. It has no remote assets and makes no network requests merely by opening it. Source links require an environment permitted to reach Apple.

## Capture inventory and honest boundary

| Component | Preferred source | Frame / still | Timestamp | Motion observed |
|---|---|---|---|---|
| Tab bar | A2, with A1 for material principles | Not captured | Unavailable | No |
| Toolbar group | A2, with A1 for material principles | Not captured | Unavailable | No |
| Switch | A2 | Not captured | Unavailable | No |
| Grouped form | A2 | Not captured | Unavailable | No |
| Medium sheet | A2 | Not captured | Unavailable | No |
| Large sheet | A2 | Not captured | Unavailable | No |

This is a source-target board with explicit missing captures, **not a completed official screenshot board**. No Apple frame, quoted transcript, video timestamp, measured control dimension or animation timing has been invented. No community demo or generated illustration was substituted for Apple material. Visual fidelity and motion comparison against these sessions remain pending.

## Access evidence

The managed environment reported an enforced restricted network policy with the `package_managers` preset, no custom allowed hosts, and current observations. `/etc/codex/network-policy.json` version 1 listed GitHub and package registries, but not `developer.apple.com` or Apple's media hosts. It reported no configured VPN.

Tool discovery exposed GitHub search/fetch and the environment-status connector, but no general browser, web search or URL-fetch connector. The Apple domains were not requested through a disallowed alternate route. Proxy settings and CA verification were preserved.

The supported GitHub connector was checked for relevant public material owned by Apple:

- `Liquid Glass`, organization `apple`: unrelated device-management schema and other results; no usable iOS 26 visual reference.
- `wwdc2025/219`, organization `apple`: no results.
- `wwdc2025/284`, organization `apple`: no results.

Those unrelated results are not design references and have not been included in the board. An initial registry request in the default shell sandbox could not connect to the inherited proxy. The same registry request succeeded with the shell tool's supported additional network permission; the destination remained the policy-allowed `registry.npmjs.org`.

## Guidance available from the supplied brief

The guidance below comes from sections 5, 7 and 8 of [the implementation brief](../specification.md), not direct observation of an Apple session. Section 5 attributes the following material principles to A1: a separate glass control layer, adaptation to content underneath, restrained tinting, and avoidance of stacked glass.

Use those principles to make a coherent utility composition:

- Keep workout content on neutral grouped surfaces. Reserve glass primarily for floating navigation, toolbar groups and modal chrome; avoid turning every content row into an individually frosted card.
- Make related toolbar actions share one material shell. Place labels and icons above the sampled backdrop; do not blur or refract the text itself.
- Use a neutral glass body, a stronger upper rim and softer lower/side definition, restrained accent selection, and a local shadow appropriate to the control's elevation.
- Preserve readable labels and familiar control geometry while the shell responds to touch. Press feedback should be immediate and settle promptly; it should not require an ambient animation loop.
- Keep the tab capsule's single selected overlay aligned with the active item. Avoid four independent Material pill indicators.
- Build forms as coherent grouped rows with a calm type hierarchy, sentence-case labels, useful secondary contrast, and controls with room for long names and text scaling.
- Give medium and large sheets distinct geometry, a clear title/action hierarchy, scrollable content, and a reversible interaction. Verify their appearance with the keyboard and both themes.

The brief's `34/41` title size, `24–28 px` content radius, `32–38 px` sheet radius, `8 px` medium-sheet inset, `16–20 px` blur, alpha values, and motion ranges are **Dexter starting tokens**, not Apple measurements. Optional shallow rim refraction needs browser/WebView verification and a performance gate. Without session viewing, an easing curve or switch stretch must be described as an approximation, not an exact Apple motion match.

## Offline Inter asset provenance

The licensed font was obtained from the allowed npm registry on 4 October 2026. This font source is separate from the Apple visual references.

| Item | Value |
|---|---|
| Package | `@fontsource-variable/inter@5.3.0` |
| Registry metadata | `https://registry.npmjs.org/@fontsource-variable%2finter/latest` |
| Download | `https://registry.npmjs.org/@fontsource-variable/inter/-/inter-5.3.0.tgz` |
| Package SHA-1 | `351dd1e02dab63a6cf66d57ec36dcfd10c07f07b` — matched registry metadata |
| Selected asset | `/tmp/dexter-assets/package/files/inter-latin-wght-normal.woff2` |
| Selected asset size | 48,256 bytes |
| Selected asset SHA-256 | `3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62` |
| Weight/style | Variable weights 100–900, normal |
| Subset | Latin; other characters can fall back to the system font |
| License | SIL Open Font License 1.1, `/tmp/dexter-assets/package/LICENSE` |
| License SHA-256 | `3b0a5fca3d17942cde889069889dedbbbd075e9b599968c82a95f4d944e9b345` |
| Optional optical-size asset | `/tmp/dexter-assets/package/files/inter-latin-standard-normal.woff2` — 72,920 bytes |

The package's attribution reads: `Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter) Inter-Italic[opsz,wght].ttf: Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)`.

The OFL allows bundling and embedding. Preserve the complete copyright notice and license in a readable packaged notice or appropriate human-readable metadata. Do not depend on a CDN at runtime. Use platform system type first on Apple devices, with the embedded Inter variable font as the Android/browser fallback. Tune tracking on rendered Dexter text; SF-specific tracking is not an Inter requirement.
