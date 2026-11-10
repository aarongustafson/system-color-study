# Published captures

Add reviewed JSON exports from the test page here, including in subdirectories
if useful. The build validates and combines every `.json` file with the legacy
root `published.json` collection.

Contributors can use the snapshot issue form linked from the capture page.
The issue workflow validates one snapshot and the combined build. After the owner
posts `/approve-snapshot`, it revalidates the data before opening
a data-only review PR under `data/submissions/issue-<number>.json`. Issue edits
need a new owner approval to update the same submission; maintainers still
review before merging.

New exports and submission PRs contain observations, not contrast scores or
grades. Intake accepts older exports but omits their stored pair reports;
historical source files remain unchanged. The build recalculates contrast using
the separately versioned analysis method and publishes its metadata in
`analysis.json`. Low contrast is a finding, not invalid input.

RGB-serialization captures preserve optional unrounded `rgbaFloat` channels,
including alpha, on a 0–255 scale alongside compatibility bytes and hex.
The original computed CSS string and conversion method remain essential:
canvas-fallback captures are still explicitly 8-bit sRGB and may lose gamut.

The first observations are under `automated-local/2026-11-05/`: three headed
Playwright bundled engines on macOS 27.0.1 arm64, with media emulation disabled.
Each file records both requested schemes and all 42 keywords. These are actual
local observations, not synthetic fixtures or installed-browser measurements.
Source revision and unverified accent/theme-name limitations are in Notes.
Chromium and WebKit reported a dark native preference; Firefox reported light.
Keep those reports rather than normalizing them to agree.
Browser labels use Chrome for the Chromium observations; Notes retain the
bundled-engine provenance. This doesn’t turn them into installed-browser
measurements.

Use descriptive filenames, such as `2026-11-05/android-chrome-canvas.json`.
Keep capture IDs and original measurements unchanged. Verify browser/OS versions,
context, backdrop, and notes before submitting a pull request. Don’t include
names or other personal information.

Identical duplicates are deduplicated. Incompatible versions, malformed data,
conflicting IDs, symlinks, more than 100 unique captures, or more than 5 MB of
combined input stop the build instead of silently excluding observations.

After the PR merges, GitHub Actions rebuilds and publishes the Pages site.
Never edit `dist/published.json`: it is generated.
