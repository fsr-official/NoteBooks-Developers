# MDX Build and HTML Validation Workflows

**Date:** 2026-11-21  
**Result:** Split MDX compilation and compiled-HTML validation into two GitHub Actions. Generated `build/` output is ignored by Git.

## Changed files

- Added `.github/workflows/mdx-compile.yml`. It installs pinned dependencies, typechecks and tests the compiler, validates MDX sources, compiles into `build/`, checks the manifest/bundle metadata, and uploads the build artifact.
- Added `.github/workflows/mdx-validate-html.yml`. After a successful compile workflow, it checks out the same source revision, downloads that run's build artifact, renders HTML from the compiled bundle, parses it with parse5, validates structure/content, and uploads the HTML for inspection.
- Removed the previous combined publish workflow. These workflows do not commit generated bundles, regenerate `files.json`, or call a webhook.
- Added `.gitignore` with `/build/` so compiled JSON output stays local/untracked.
- Added `scripts/audit-build.ts` and `test/audit-build.test.ts`. Desmos execution is explicitly skipped; glossary, headings, examples, diagrams, safe links, bundle/manifest metadata, and HTML syntax are checked.
- Added exact dev dependency `parse5@7.3.0` to parse the rendered HTML.

## Local verification

- `pnpm typecheck`, `pnpm test` (16 tests), `pnpm validate`, and `pnpm build` passed.
- The HTML audit passed on the compiled pilot and produced a temporary HTML document with 65 headings, 19 examples, 187 glossary references, and 17 rendered diagrams. All 15 Desmos blocks were counted but not executed.
- The isolated compile-and-audit steps used by Actions passed locally.
- Both workflow YAML files parsed, the validation workflow is triggered only after successful compilation, and `build/manifest.json` is ignored by Git.
- `git diff --check` passed.

## Limits

The GitHub-hosted workflows have not run: workflow files only become visible to GitHub after they are committed and pushed to the default branch. The local runs verify the workflow commands, not GitHub's hosted runner. Browser execution of Mermaid/TikZJax and Desmos is not part of this HTML syntax audit.
