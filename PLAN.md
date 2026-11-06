# Research and measurement protocol

## Questions

1. Which CSS system-color keywords does each browser/system accept?
2. What values do they resolve to in requested light and dark color schemes?
3. Which colors are translucent, aliases, or fixed values rather than OS colors?
4. Which defined pairs meet contrast thresholds on known backdrops?
5. How do OS preference, accent, contrast themes, private browsing, installed
   contexts, browser versions, and time affect those findings?

Use the results to guide component defaults. Keep acceptance, color resolution,
native behavior, and contrast as separate findings; don’t turn a parser-support
table into a blanket accessibility claim.

## Initial scope

Record all 19 modern and 23 deprecated system colors from the linked catalog.
Vendor-specific proprietary keywords are outside this initial catalog.
The primary pair set is:

| Background   | Foreground       |
| ------------ | ---------------- |
| Canvas       | CanvasText       |
| Canvas       | LinkText         |
| Canvas       | VisitedText      |
| Canvas       | ActiveText       |
| ButtonFace   | ButtonText       |
| Field        | FieldText        |
| Highlight    | HighlightText    |
| SelectedItem | SelectedItemText |
| AccentColor  | AccentColorText  |
| Mark         | MarkText         |

Historical pairs cover ActiveCaption/CaptionText,
InactiveCaption/InactiveCaptionText, InfoBackground/InfoText, Menu/MenuText,
and Window/WindowText. Keep them identifiable as deprecated.

`VisitedText` is the explicit system keyword, not a probe of browsing history.
These measurements don’t establish what a real visited link or native control
will paint. A future control-specific study can compare native selection,
buttons, inputs, and actual `::selection` to the exposed tokens.

## Environment matrix

Start with the affected Android combination, then broaden coverage:

| System     | Browsers/contexts to run directly                                |
| ---------- | ---------------------------------------------------------------- |
| Android    | Chrome, Android System WebView, Firefox, Samsung Internet        |
| iOS/iPadOS | Safari and relevant other browsers; record actual engine/context |
| macOS      | Safari, Chrome/Chromium, Firefox                                 |
| Windows    | Edge, Chrome, Firefox; normal and Windows contrast themes        |
| Linux      | Chromium and Firefox; record desktop/theme                       |

For each available combination:

- OS light preference, then OS dark preference.
- Both requested CSS modes in each OS preference. A capture records both.
- Canvas backdrop first; white and black repeat captures for alpha sensitivity.
- Default OS accent, then a documented alternative where the platform supports it.
- Normal browsing first; private browsing and installed/embedded contexts where
  relevant and available.
- Browser default settings first. Experimental flags and accessibility overrides
  belong in separate, labeled captures.

Don’t call Chrome mobile emulation an Android run or a Playwright WebKit build
a Safari/iOS run. A WebView capture requires running the page in an actual
embedding app; a browser tab isn’t a substitute. Installed-app findings require
an actual installed context and suitable HTTPS hosting/installation setup.

## Procedure for each run

1. Use a clean copy of this page with the same protocol/catalog revision.
2. Check versions from About screens, not just user-agent strings. Verify the
   device clock too: capture timestamps come from that clock and are exported
   in UTC.
3. Record device model if relevant, browser/OS versions, context, OS preference,
   accent/contrast settings, display color settings, and flags in Notes.
   Avoid personal information.
4. Open the page in the target context. Check for visible startup errors.
5. Confirm the reported OS preference and forced-colors state. Resample after
   changing settings; capture again rather than relabeling old data.
6. Capture both modes on Canvas; inspect the live grid for unsupported colors
   and unexpected transparency.
7. Repeat on white/black where alpha could affect contrast.
8. Export JSON immediately. Keep the original export immutable.
9. Where a finding is surprising, reload and repeat under the same settings.
   Preserve both timestamps. Save a screenshot as corroboration, not as the
   numeric color measurement.
10. Import runs into the test page’s local comparison. Use the mode selector to compare
    equivalent requested schemes and read context/backdrop labels.

Settings can change while a capture runs. Don’t change them mid-capture.
The tool performs bounded synchronous measurements in isolated scheme probes;
both modes share one environment snapshot, not two separately verified OS states.
The capture review displays both saved modes together. The live display selector
doesn’t determine which modes are captured.

Browser/OS prefills are unverified browser reports. Confirm About-screen versions
before submitting; optional full-version hints are requested only by an explicit
button action. For local automated baselines, `npm run capture:local` records the
host OS and bundled engine versions with headed/headless and source provenance.
Keep those observations distinct from installed-browser and actual-device runs.

For Windows Contrast themes, follow the [Windows procedure](./README.md#windows-contrast-themes).
Confirm `forced-colors: active` instead of inferring it from a theme’s appearance.
Record the named or customized palette, collect an off-theme baseline, and keep
Edge/Chrome/Firefox runs separate. Light/dark requests can legitimately collapse
to one forced palette.
Use the dedicated `environment.forcedColorTheme` field for the author-reported
name; keep customized palette details in Notes. Older files may lack a name.
Don’t turn an active or unknown media state into “none” just because that name
is missing. For local recording, pass `--forced-color-theme "Actual theme name"`.

## Measurement controls

- Keyword acceptance is tested in the CSS `color` property.
- Read computed styles from generic spans in isolated requested-scheme containers.
- Don’t replace unsupported keywords with inherited colors or named-color
  approximations. N/A is an outcome, not an error to hide.
- Preserve original CSS strings alongside sRGB byte/hex conversion and alpha.
- For pair contrast, composite background over the declared opaque backdrop,
  then foreground over background; use the stored-byte method in the README.
- Force paint adjustment off only on reference swatches to show recorded values
  over the declared backdrop. Never disable user color preferences globally.
- If forced colors maps both requested schemes to the same palette, keep both
  observations and the forced-colors metadata. Don’t treat sameness as failure.
- Keep aliases and fixed values. Different keyword names needn’t mean different
  colors, and system colors needn’t expose the user’s OS accent.

## Quality checks

Before collecting a wider dataset:

1. Run unit and browser tests.
2. Check keyboard operation, visible errors, copy/download fallback, imports,
   horizontal table scrolling, and 200% zoom.
3. Verify an unsupported-keyword fixture produces N/A rather than an inherited
   default; check a deliberately malformed import leaves the collection intact.
4. Check black/white yields 21:1 and boundary tests use unrounded ratios.
5. Inspect translucent examples on different backdrops.
6. Confirm table headers and contrast row spans remain correct with several
   captures and both display modes.
7. Test a real phone export/import workflow, including access to downloaded files.

Automated accessibility checks and calculated ratios don’t prove the entire
tool or a component conforms. Screen-reader review and actual OS contrast-theme
review are separate checks.

## Archiving and comparison over time

Use an archive such as:

```text
captures/
  2026-11-05/
    android-chrome-normal-canvas.json
    android-chrome-normal-black.json
    windows-edge-contrast-theme-canvas.json
```

These are example names, not pre-filled results. Keep protocol source, browser
and OS notes, and optional screenshots with the exports. Exports are the durable
data; there is no backend or implicit browser database.

For longitudinal comparisons, import old and new captures together. Preserve
versions, dates, native preference, context, and backdrop. Compare equivalent
conditions before attributing a difference to a browser update. Repeat anomalous
results; separate platform behavior from measurement/conversion changes.

The 100-capture view limit bounds DOM work on phones. Keep the full archive and
choose comparison subsets rather than flattening historical runs.

For a published comparison, submit reviewed exports under `data/` by pull request.
The build merges all submitted JSON and the root `published.json` seed; the
results homepage loads that generated dataset, while `test.html` keeps local
measurements separate. The combined build input and generated collection must
each stay within 5 MB, with at most 100 unique captures. Exceeding those bounds
fails validation rather than hiding observations.

Review notes and provenance first. Local capture data is not automatically sent
to the host; ordinary static-file requests and the host’s access-log policy are
separate from this tool’s collection behavior. Merging a validated PR triggers
GitHub Pages publication once the repository’s Pages source is GitHub Actions.

## Turning findings into component changes

1. Identify actual supported pairs and alpha-sensitive contexts.
2. Choose tokens by semantic role, not by a favored color seen on one machine.
3. Add compatible fallbacks and stable opaque backing surfaces where needed.
4. Validate font/text and non-text thresholds on the real component surfaces.
5. Preserve user-selected forced palettes and non-color state indicators.
6. Update implementations, duplicated styles, manifests, docs, and demos together.

Don’t introduce OS sniffing or production-time JavaScript contrast fixes merely
to compensate for a weak default. Use this evidence to make a simpler, resilient
default and document where authors must supply paired theme colors.

## References and protocol version

The catalog and method are version 1, assembled on November 5, 2026. See the
[README sources](./README.md#sources). MDN lists keyword definitions; its generic
support badge and BCD entries don’t provide a comprehensive browser/OS/RGBA
matrix. This study gathers observations, not an assertion that every keyword
has a separately documented introduction version.
