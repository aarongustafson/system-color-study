# Published captures

Add reviewed JSON exports from the test page here, including in subdirectories
if useful. The build validates and combines every `.json` file with the legacy
root `published.json` collection.

Contributors can use the snapshot issue form linked from the capture page.
The issue workflow validates one snapshot and the combined build before opening
a data-only review PR under `data/submissions/issue-<number>.json`. Issue edits
update the same submission; maintainers still review before merging.

The first observations are under `automated-local/2026-11-05/`: three headed
Playwright bundled engines on macOS 27.0.1 arm64, with media emulation disabled.
Each file records both requested schemes and all 42 keywords. These are actual
local observations, not synthetic fixtures or installed-browser measurements.
Source revision and unverified accent/theme-name limitations are in Notes.
Chromium and WebKit reported a dark native preference; Firefox reported light.
Keep those reports rather than normalizing them to agree.

Use descriptive filenames, such as `2026-11-05/android-chrome-canvas.json`.
Keep capture IDs and original measurements unchanged. Verify browser/OS versions,
context, backdrop, and notes before submitting a pull request. Don’t include
names or other personal information.

Identical duplicates are deduplicated. Incompatible versions, malformed data,
conflicting IDs, symlinks, more than 100 unique captures, or more than 5 MB of
combined input stop the build instead of silently excluding observations.

After the PR merges, GitHub Actions rebuilds and publishes the Pages site.
Never edit `dist/published.json`: it is generated.
