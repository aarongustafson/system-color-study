# Published captures

Add reviewed JSON exports from the test page here, including in subdirectories
if useful. The build validates and combines every `.json` file with the legacy
root `published.json` collection. No real captures have been submitted yet.

Use descriptive filenames, such as `2026-11-05/android-chrome-canvas.json`.
Keep capture IDs and original measurements unchanged. Verify browser/OS versions,
context, backdrop, and notes before submitting a pull request. Don’t include
names or other personal information.

Identical duplicates are deduplicated. Incompatible versions, malformed data,
conflicting IDs, symlinks, more than 100 unique captures, or more than 5 MB of
combined input stop the build instead of silently excluding observations.

After the PR merges, GitHub Actions rebuilds and publishes the Pages site.
Never edit `dist/published.json`: it is generated.
