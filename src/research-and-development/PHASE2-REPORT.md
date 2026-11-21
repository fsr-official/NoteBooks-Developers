# MDX Pilot Phase 2 Report

**Date:** 2026-11-21; section-ID acceptance later tightened by owner decision  
**Result:** Validator and focused regression tests are complete.

## Changed files

- Added `scripts/validate.ts`. It compile-checks all three MDX sources, rejects ESM and JavaScript expressions, unknown components/callouts, invalid or dynamic component props, missing Example section references, section-ID mismatches/duplicates in either direction, and duplicate glossary terms. It reports source file and line.
- Added `test/validate.test.ts` covering a valid pilot, CNOTES mismatch, missing Example links, invalid props, unknown callout/component, duplicate glossary terms, imports and expressions.
- Added a pinned `package.json` and `pnpm-lock.yaml`.
- Added `pnpm-workspace.yaml` permitting only esbuild's required install script. This is necessary for pnpm 12 to install the test runner; no other package build scripts were approved.
- Updated Phase 2/3 scope in `PLAN-MDX.md` to permit the lockfile and the single required build-script approval file.

Exact dev dependency pins: `@mdx-js/mdx` 3.1.1, `@types/mdast` 4.0.4, `@types/node` 22.20.5, `remark-gfm` 4.0.1, `remark-math` 6.0.0, `remark-mdx` 3.1.1, `remark-parse` 11.0.0, `tsx` 4.23.15, TypeScript 5.9.3, `unified` 11.0.5, and `vitest` 3.2.4. They are build/test-only dependencies.

## Verification

- `pnpm install --frozen-lockfile` passed.
- `pnpm typecheck` passed.
- `pnpm test` passed: 5 tests.
- `pnpm validate` passed for all three Physics 06 pilot files.
- After the owner required one-to-one section-ID coverage, validation was tightened to reject NOTES-only IDs as well as CNOTES-only IDs; the current pilot passes with exact coverage.
- `git diff --check` passed.

## Limits

The global feature flag remains off; no database, production, workflow, original Markdown, or Framework file was changed. The validator checks explicit `<Example>` references and is ready for the build phase's extracted example records. It does not infer editorial `concepts` from prose; the builder must preserve the reversible same-section default and report cross-section assumptions.
