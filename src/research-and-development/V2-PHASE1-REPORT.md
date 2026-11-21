# MDX Build v2 — Phase 1 Report

**Plan:** [`PLAN-MDX.md`](PLAN-MDX.md)  
**Result:** Source checks pass for the current `src/` tree.

## Changes

- Adapted `scripts/validate.ts` to recursively inspect `src/`, parse Markdown/MDX, discover triads, prefer `.mdx` when both extensions exist, and classify chapters as migrated, not migrated, or failing.
- Added diagnostics for incomplete/mixed triads, mismatched folder and chapter IDs, duplicate section IDs, NOTES/CNOTES mismatches, invalid example section references, unsupported MDX components/props, glossary ordering/references, case-insensitive path collisions, and collisions with existing root outputs.
- Kept `src/research-and-development/schema/chapter.ts` build-only; it is not mapped to a published output.
- Added focused source-tree tests covering triad classification, incomplete triads, case collisions, and root-output collisions.
- Merged the unique 2D and 3D reader fixtures into the uppercase DSL references, updated the README and authoring skill links, then removed the lowercase files. The uppercase references remain present. This documentation change was explicitly authorized by the owner after the pairwise comparison found unique content.

## Verification

- `pnpm --dir NoteBooks-Developers exec vitest run test/validate.test.ts` — passed, 8 tests.
- `pnpm --dir NoteBooks-Developers exec tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --types node scripts/validate.ts test/validate.test.ts src/research-and-development/schema/chapter.ts` — passed.
- `pnpm --dir NoteBooks-Developers validate` — passed: Physics 06 is migrated; Physics 05 is not migrated.
- Confirmed no remaining README/skill links point to the deleted lowercase fixture files.
- The package-wide `pnpm typecheck` is not green yet: the legacy build and audit scripts still import the schema from the old path and have downstream type errors. Those scripts are scheduled for adaptation in V2-2 and V2-3; the validator-only typecheck passed.

## Not done / open detail

- No dependencies or workflows changed. Build generation, final HTML auditing, `files.json`, publication, Framework integration, and reader testing remain for later phases.
- The source documents do not define explicit syntax for glossary `aliases` or the `common` flag. No syntax was invented in this phase; the build phase must preserve the current source format and record its handling.
- `files.json` is intentionally unchanged until V2-4.
- The v2 plan still contains the original deletion premise and has not been edited in this phase; this report records the comparison result and owner-approved content merge.
