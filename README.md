# System color study

A standalone, client-side study of CSS system colors across browsers, operating
systems, requested light/dark color schemes, and user settings. It records
keyword acceptance, resolved values, and alpha-aware contrast for defined pairs.

This is a research page, not a web component or an npm package for publication.
Move the whole directory wherever you want. The measurement page has no runtime
dependencies, external scripts, uploads, telemetry, or automatic local storage.

## Run the page

Install development tools, then start the included static server:

```sh
npm ci
npm start
```

Open <http://127.0.0.1:4189> for published results, or
<http://127.0.0.1:4189/test.html> to gather and compare local captures.
`npm start` builds the site before serving it; restart after source/data changes.
Don’t open the HTML through `file://`: browsers restrict module loading there.
Use HTTPS for public hosting and installed-web-app experiments.

For a phone on the same trusted network:

```sh
HOST=0.0.0.0 npm start
```

Open `http://<your computer's LAN IP>:4189/test.html` on the phone. Allow the port through
your firewall if needed. This exposes only the server’s explicit public-file
allowlist, not your workspace or capture files. Stop the server afterward.
`PORT` can override the default; the automated browser tests use port 4189.

## What is automatic?

The test page resolves colors automatically for its live preview on load. You
don’t need to configure a measurement first. **Capture light and dark** reruns
every keyword in both requested schemes and saves a dated snapshot with your
reviewed metadata. It doesn’t upload or automatically save files.

The default contrast backdrop is each mode’s opaque `Canvas`. Only choose
white or black in **Optional: change the contrast backdrop** when testing other
surfaces. Translucent colors need a known background for compositing; opaque
pairs have the same ratio on any known opaque backdrop. This changes contrast
calculations, not the raw resolved colors. Existing captures never change when
you adjust live settings.

## Gather a capture

1. Read [the protocol](./PLAN.md), including the environment and privacy checks.
   Open [the test page](./test.html); it starts with an empty local collection.
2. Verify the prefilled browser and OS names **against their About screens**.
   Prefills come from the user agent and may be reduced, frozen, or spoofed.
   Where supported, **Fill available full versions** explicitly requests
   additional browser-provided version details. These are still reports, not
   proof of the installed versions; Windows platform versions aren’t Windows
   release names. All fields remain editable.
   Record relevant device, accent, and experimental settings in Notes.
   When forced colors are active, enter the actual name in **Forced-color theme
   name**. Don’t include personal information.
3. Keep the default Canvas backdrop unless you’re testing another surface.
   The displayed mode affects only the live grid, not the comparison tables or
   which modes are captured.
4. Select **Capture light and dark**. One capture contains both requested CSS
   modes and all 42 keywords, even when deprecated keywords aren’t displayed.
   The **Latest capture: both modes** section shows both saved grids side by
   side on wide screens and stacked on narrow ones. Each comes from a fresh,
   independent scheme probe—not a copied grid or a change to your OS preference.
   Switching live settings never changes these saved measurements.
5. Select **Export JSON**. Save the download; a text area also exposes the JSON
   for manual copying.
   Filenames include browser/OS labels, versions, and the export timestamp.
   Mixed collections identify the first environment and the number of others;
   that count uses full browser/OS pairs before shortening filename labels.
   The complete metadata remains in the JSON.
6. Change OS settings, browser, device, context, or backdrop and repeat.
7. Import capture files into any copy of the page to build comparison columns.
   Every run remains in the collection. Identical repeated measurements may
   share display columns, with all run metadata retained. Identical duplicate
   IDs are reported and skipped; conflicting IDs are rejected.

Captures stay in the current tab’s memory. Closing or reloading loses unexported
data. Removing a capture only changes this tab, not previously exported files.
Archive your exports independently. There’s no automatic persistence to leak
measurements or obscure when data was collected.

## Read the tables

**Individual system colors** lists each keyword’s resolved sRGB hex. This
includes keywords that also appear in pairs. N/A means `CSS.supports("color",
keyword)` returned false; inherited colors are never substituted for a rejected
keyword. Acceptance does not prove native OS integration or a distinct value:
aliases and privacy-preserving fixed colors are legitimate findings.

Table headers group **OS → theme → browser**, putting browsers beside each other
within **Light** and **Dark**. OS headings use the major release; browser headings
omit minor releases and architecture. Full labels remain in the Details dialog,
and observations with different full versions or contexts stay distinct.
Chrome headers on iOS and iPadOS omit the “webview” context label; the recorded
context remains in Details and exports. Other non-default contexts stay visible.
Ordinary observations always retain both themes, even when their values match.
Separate forced-color tables group OS, named theme, browser, then requested mode.
A forced-color observation shares one mode column,
marked **Light & Dark**, only when all 42 keyword records, backdrop settings, and
scheme-support flags match. Otherwise, the theme has separate light and dark
columns. The test page’s Display mode control affects only its live grid.

**Color pairs** has two rows per pair—background and foreground—with a value
column and a contrast result spanning both rows for each displayed mode.
Each **Details** button opens a shared modal for its browser/OS/context group
from any table. Its title shows the simplified browser and OS on separate lines.
Metadata appears on separate labeled lines, including full versions, time,
context, preferences, Notes when supplied, and user agent. Empty or whitespace-only
Notes fields are omitted. Capture identifiers, scheme diagnostics,
and data-format versions remain in the JSON rather than the dialog.
Buttons use `commandfor`, with a JavaScript fallback. The Close button follows
the metadata in the markup, but sits beside the title at the top inline end.
Flex layout reserves its space so it can’t overlap the title. When space is tight,
the title wraps below the button rather than squeezing alongside it.
Close the modal with that button or Escape; focus returns to the opener.
Opening details doesn’t expand or reshape the table.

Repeated runs with identical measurements and matching theme/media settings
share columns, with every observation retained in the modal. Different measurements stay
separate, even when the browser and theme labels match. No records are removed
from exports or the published dataset, and different version/OS labels aren’t
silently treated as the same environment.

Each color cell uses the recorded color as its background and displays the raw
hex value in whichever of black or white provides higher contrast. Translucent
colors are composited over the capture’s recorded opaque backdrop for the preview;
the exported color and alpha remain unchanged. Without that backdrop, the cell
keeps its hex value and says “Preview unavailable.” Unsupported keywords remain
N/A. These reference cells retain their colors in forced-color mode.

The native keyword/role headers stay pinned at the inline start while the other
columns scroll. Tables use separate borders with zero spacing so borders stay
with their cells during scrolling. The entire header hierarchy stays pinned during vertical scrolling
within each table’s bounded scroll region. Where `ResizeObserver` is available,
pinning is enabled only when at least 128 CSS pixels remain for the body; otherwise,
headers scroll normally so they don’t cover the data. Printing removes that height
limit and pinning.

These are the original table cells, not duplicated headers. Native `th`, `scope`,
and explicit `headers` associations remain in place. Focus a scroll region and
use the arrow keys to scroll; focused Details buttons stay clear of the pinned
column, including in right-to-left layouts. Browser tests check these associations,
geometry, and keyboard behavior; they don’t replace testing with a screen reader.
Rows and columns no longer change appearance on hover or focus.

Contrast cells show a bold ratio followed by five separate, labeled pass/fail
lines. Green means all five thresholds pass; amber means some pass; red means
none pass; neutral means unavailable. Amber can include normal-AA passes that
don’t meet AAA. The same layout appears in live and captured pair cards.
These fills are UI indicators, not recorded system colors. Text conveys every
verdict without color, light/dark palettes keep the labels readable, and forced
colors use the visitor’s own palette instead.

The current catalog has 19 modern keywords, 23 deprecated keywords, 10 modern
pairs, and five historical pairs. Deprecated results are research data, not a
recommendation to use those keywords. `GrayText` and `ButtonBorder` remain
individual colors because they have no universal two-color text pair.

## Windows Contrast themes

Yes: run the page in the actual Windows browser you want to measure.

1. In Windows 11, open **Settings > Accessibility > Contrast themes**, choose
   a theme, and apply it. Windows 10 calls this High contrast under Ease of Access.
2. Return to the page and select **Resample current mode**, or reload.
   Confirm the environment line reports **forced colors: active**.
3. Enter the theme’s name in **Forced-color theme name** and any customized
   palette settings in Notes.
4. Capture both modes and export. Repeat for each theme, then capture with
   Contrast themes off for a baseline.

The capture’s `media.forcedColors` records what the browser actually reports.
Both requested CSS schemes may resolve to the same forced palette; keep that
result rather than trying to force them apart. The page cannot turn Windows
Contrast themes on or off for you.

The name field is required for new captures when `forced-colors` is active.
Leave it blank when no OS theme is selected. With an inactive browser report,
that displays **No forced colors**. A missing name
in a legacy active capture displays **Forced colors (unnamed)**; an unknown
browser state stays **Forced colors unknown**. A missing label never overrides
the recorded media state. If an OS theme is selected but the browser reports
inactive/unknown forced colors, keep the name: the header shows both facts.
Names are author-reported; there’s no browser API for discovering the actual
Windows theme name.

Reference swatches bypass automatic paint adjustment so they can show the
recorded system tokens over the specified backdrop. System keywords still
resolve through the browser’s palette. This tests those exposed tokens and
their defined pairings—not the complete repaint behavior of an arbitrary
component. Check actual controls, borders, focus, images, and backplates
separately. Chromium’s automated forced-colors test is emulation, not an
observation of a named Windows theme.

## Publish a comparison dataset

The [results homepage](./index.html) loads the committed dataset, without sampling
the visitor’s browser. The [test page](./test.html) measures and imports data in
tab memory only. Neither page uploads captures.

1. Export JSON from the test page.
2. Review versions, environment labels, Notes, and provenance. Remove personal
   information before publishing.
3. Add the export under [`data/`](./data/README.md), optionally in a dated
   subdirectory, and open a pull request.
4. Merge after validation passes. The Pages workflow builds and publishes the
   updated results automatically.

The build merges every JSON collection under `data/` and the root
[`published.json`](./published.json) seed into `dist/published.json`. Identical
duplicates are skipped; conflicting IDs or invalid/incompatible data fail the
build. Captures appear in date/ID order. The existing limit is 100 unique captures
per comparison, with a combined input and generated dataset limit of 5 MB each.
Nothing is silently truncated; curate a comparison subset if the archive outgrows
those bounds. Keep private archival exports in the ignored `captures/` directory.
There are no invented results. The first committed observations are headed
bundled Chromium 158.0.8127.18, Firefox 159.0, and WebKit 27.2 runs on
macOS 27.0.1 arm64, collected November 5, 2026. Their Notes identify automation
and source provenance; they aren’t claims about installed Chrome or Safari.
The WebKit observation is labeled Safari 27.2 in the data; its bundled-engine
provenance remains in Notes.
The supplied Windows observations were confirmed as Windows 11. Their Chrome
identifier is consistently `Chrome 157.0.8103.39`; file names and metadata
reflect those corrections without changing measurements.

The results page reads the generated same-origin JSON asset. A loading or
validation failure produces a visible error, not substitute browser results.
Local imports and measurements never modify the published collection.

## Open a results PR automatically

A static Pages site can’t create authenticated pull requests on its own. Don’t
put an access token in the page, its URL, or exported data. The test page links
to GitHub’s upload screen for a browser-only submission; GitHub handles sign-in,
forks, branches, and proposing the change.

For a one-command submission from a local checkout, install
[GitHub CLI](https://cli.github.com/) and authenticate with `gh auth login`.
The helper currently requires write access to this repository:

```sh
npm run submit -- /path/to/capture.json --dry-run
npm run submit -- /path/to/capture.json
```

The dry run validates the file and reports its destination without contacting
GitHub. The real command uses your existing `gh` credentials to create a fresh
data branch, commit the reviewed JSON under `data/submissions/`, and open a PR
against `main`. It doesn’t change your checkout, merge the PR, or write directly
to `main`. Submission filenames include a SHA-256 hash of the supplied file so
distinct collections don’t target an existing submission just because their
environment labels and newest capture timestamp match. A dry run and real
submission use the same destination for the same unchanged file.
Review Notes and version labels **before** running the real command:
it sends the supplied file, including its metadata, to the public repository.
Invalid/empty data and files over 5 MB are rejected before network requests.

If upload or PR creation fails after branch creation, the command reports the
remaining branch for inspection. It doesn’t claim success or delete remote work.
Without write access, use the test page’s GitHub upload link and propose a change
from your fork.

## Repeat a local Playwright baseline

```sh
npm exec -- playwright install
npm run capture:local
```

This opens bundled Chromium, Firefox, and WebKit on the current host, captures
both requested CSS modes through the test page, and exports one JSON file per
engine into the ignored `captures/playwright-local/` directory. It uses an
ephemeral loopback-only server and closes each browser and server when finished.
No media preference is emulated: the capture records what each engine reports
from that host. It doesn’t change OS settings, accent colors, or contrast themes.

On macOS, OS version comes from `sw_vers`; other hosts use their kernel version.
Architecture, Playwright/browser versions, headed/headless mode, source commit,
and modified-worktree status are recorded in Notes. OS accent and contrast-theme
names still need manual verification. Use a clean committed source tree for
repeatable provenance.

Optional arguments:

```sh
npm run capture:local -- --output /path/to/review-directory
npm run capture:local -- --headless
npm run capture:local -- --forced-color-theme "Aquatic"
```

Supply the actual theme name when recording with forced colors active. The
recorder fails explicitly if an engine reports active forced colors without a
name, rather than hanging on the required field. An author-supplied OS theme name
never overrides an engine’s inactive or unknown media report.

Headed is the default. Headless results are labeled separately; don’t present
them as normal interactive-browser observations. Likewise, bundled WebKit is
**not Safari**, bundled Chromium is **not installed Chrome**, and a local
Playwright Firefox build isn’t evidence for a different shipping Firefox build.
These are real measurements on the host, with explicit automation provenance.
Review them before copying/submitting them into `data/`.

## Enable GitHub Pages

The repository is
[`aarongustafson/system-color-study`](https://github.com/aarongustafson/system-color-study).

1. Open **Settings > Pages > Build and deployment**.
2. Set **Source** to **GitHub Actions**.
3. Merge the publication PR. If it was already merged before enabling Pages,
   open **Actions > Validate and publish study > Run workflow** on `main`.

The workflow validates pull requests but doesn’t deploy them. Each successful
push to `main`, including a merged PR, publishes the validated `dist/` artifact.
Manual runs on `main` can republish without changing captures. Deployment uses
the `github-pages` environment; only the deployment job gets Pages/OIDC write
permissions.

After the first successful deployment:

- Results: <https://aarongustafson.github.io/system-color-study/>
- Test: <https://aarongustafson.github.io/system-color-study/test.html>

The build copies an explicit public-file allowlist, not the repository:
dependencies, tests, scripts, private captures, and raw submission directories
aren’t uploaded. For another static host, run `npm run build` and upload the
contents of `dist/`. Relative asset/data URLs support project subdirectories.
The browser suite tests this layout at `/system-color-study/`.

The test page requires current browser APIs: ES modules, `CSS.supports`,
file/blob text reads, and a 2D canvas. It isn’t a legacy-browser harness.
Without JavaScript, the results page still links to the raw dataset and protocol;
measurement controls on the test page remain disabled.

## Color and contrast method

- Save the browser’s original computed CSS serialization.
- Convert resolved `rgb()`/`rgba()` channels directly to sRGB bytes. Preserve
  alpha as the fourth byte; opaque values use `#rrggbb`, others `#rrggbbaa`.
- If serialization isn’t RGB, use a 1-pixel sRGB 2D canvas and record that
  conversion method. That path can clip out-of-gamut values and introduce
  premultiplication/8-bit rounding. The original CSS value remains authoritative.
- Composite the pair’s background over the chosen opaque backdrop, then its
  foreground over that painted background. Use encoded-sRGB source-over
  compositing before calculating WCAG relative luminance.
- Apply thresholds to the **unrounded ratio calculated from the stored bytes**:
  normal AA 4.5, normal AAA 7, large AA 3, large AAA 4.5, and the non-text
  contrast threshold 3.
- If a keyword is unsupported or a requested Canvas backdrop is unavailable or
  translucent, don’t fabricate a ratio or grade. Choose white/black to repeat
  with a defined backdrop.

Displayed ratios are rounded to two decimal places. A value displayed as 4.50
can still fail if its underlying ratio is below 4.5. Results near a boundary
deserve inspection of the original CSS channels and conversion precision.
Imported verdicts aren’t trusted: tables recalculate from the raw samples.

These are threshold comparisons, **not WCAG conformance certifications**.
Font size, control semantics, adjacent colors, imagery, focus geometry,
user preferences, and the real authored surface still matter. Disabled content
has exceptions; don’t apply normal-text grades indiscriminately to `GrayText`.

## Export format and repeatability

Exports contain `schemaVersion`, `protocolVersion`, `catalogVersion`,
`exportedAt`, and `captures`.

Each capture has:

- A unique `id`, UTC `capturedAt`, and editable browser/system `environment`.
- Optional `environment.forcedColorTheme`, a string of at most 160 characters.
  New captures include it; an empty value represents no named theme. Legacy
  files can omit it. Names never override `media.forcedColors`; inactive and
  unknown states remain explicit even when a name is supplied. This field is compatible
  with existing version-1 collections and doesn’t change the measurement method.
- The user agent as supporting evidence. Additional client-hint version details
  are requested only after selecting **Fill available full versions**, never
  automatically. No details are uploaded by detection or capture.
- `media`: preferred scheme, forced-colors state, contrast preference, and
  detected display mode. Unsupported/unmatched media features are `unknown`
  (or `null` for forced colors), not guessed preferences.
- `schemes.light` and `schemes.dark`: requested-scheme support, computed
  color-scheme serialization, backdrop selection, 42 keyword measurements,
  and derived pair results.
- Per keyword: `supported`, `computed`, `rgba`, `hex`, and, for supported
  colors, `conversion`.

Archive the source revision with the exports. Version 1 fixes the catalog and
measurement method. Change protocol versions when changing measurement,
compositing, or grading; change schema/catalog versions when their contracts
change. The current importer rejects incompatible versions rather than
quietly mixing studies. Future changes should include explicit migrations.

Imports are atomic and bounded: at most 5 MB per operation and 100 captures in
the comparison view. Archive arbitrarily many runs in separate files and import
the subset you want to compare. Invalid inputs leave existing captures intact.

## Validate development changes

```sh
npm test
npm exec -- playwright install
npm run test:browser
npm run format:check
```

Unit tests cover the catalog, alpha, compositing, exact thresholds, and import
contracts. Browser tests cover live sampling, both-mode capture, JSON downloads
and imports, multi-column row spans, unsupported keywords, safe text rendering,
and narrow-screen keyboard use.

Browser tests validate the tool. Their bundled browser engines are **not**
measurements of shipping Android, iOS, or desktop Safari. Real-device study
results come from running the page in the browser/system under investigation.

## Sources

- [CSS Color 4: system colors and prescribed pairings](https://drafts.csswg.org/css-color/#css-system-colors)
- [MDN keyword catalog, including deprecated colors](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/system-color)
- [MDN browser compatibility data](https://github.com/mdn/browser-compat-data/blob/main/css/types/color.json)
- [WCAG contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [WCAG non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- [Forced-colors behavior](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/forced-colors)
