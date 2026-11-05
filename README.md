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

## Gather a capture

1. Read [the protocol](./PLAN.md), including the environment and privacy checks.
   Open [the test page](./test.html); it starts with an empty local collection.
2. Enter browser and OS names **with versions from their About screens**.
   Record relevant device, accent, contrast-theme, and experimental settings
   in Notes. Don’t include personal information.
3. Choose a backdrop: the mode’s resolved opaque `Canvas`, white, or black.
   The displayed mode affects the live grid and comparison tables.
4. Select **Capture light and dark**. One capture contains both requested CSS
   modes and all 42 keywords, even when deprecated keywords aren’t displayed.
5. Select **Export JSON**. Save the download; a text area also exposes the JSON
   for manual copying.
6. Change OS settings, browser, device, context, or backdrop and repeat.
7. Import capture files into any copy of the page to build comparison columns.
   Repeated runs remain separate. Identical duplicate IDs are reported and
   skipped; conflicting IDs are rejected.

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

**Color pairs** has two rows per pair—background and foreground—with two columns
per capture: values and a contrast result spanning both rows. Switch the display
mode to compare the other requested scheme. Column labels preserve time,
browser/system, context, and backdrop; captures are never collapsed merely
because those browser/system labels match.

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
3. Enter the theme’s name and any customized palette settings in Notes.
4. Capture both modes and export. Repeat for each theme, then capture with
   Contrast themes off for a baseline.

The capture’s `media.forcedColors` records what the browser actually reports.
Both requested CSS schemes may resolve to the same forced palette; keep that
result rather than trying to force them apart. The page cannot turn Windows
Contrast themes on or off for you.

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
There are no invented results: the initial published collection is empty.

The results page reads the generated same-origin JSON asset. A loading or
validation failure produces a visible error, not substitute browser results.
Local imports and measurements never modify the published collection.

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

- A unique `id`, UTC `capturedAt`, and manually identified `environment`.
- The user agent as supporting evidence; no high-entropy client-hint requests.
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
