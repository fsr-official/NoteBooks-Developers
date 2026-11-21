# MDX Pilot Phase 1 Report

**Date:** 2026-11-21  
**Result:** Pilot schema and source copies are ready for validation.

## Changed files

- Added `research-and-development/schema/chapter.ts` with JSON-only node, component, glossary, chapter bundle, and manifest types. The component allowlist and permitted prop values are defined centrally.
- Added byte-identical `.mdx` copies of the Physics 06 GLOSSARY, NOTES, and CNOTES files beside the originals.
- Updated Phase 2 and Phase 3 scope in `PLAN-MDX.md` to permit `pnpm-lock.yaml`, required for reproducible pinned dependencies.

No original `.md` files, Framework files, dependencies, migrations, or workflows were changed. The new sources preserve existing section IDs, importance markers, callouts, and worked-example content; the next phases materialize examples and glossary metadata into the explicit bundle structures. No new aliases or answers were invented. Glossary aliases default to an empty list until source-backed aliases are identified; the `common` field is explicit in the bundle type and will default to `false` unless curated.

Planned Phase 2 dev dependencies (not yet added): `@mdx-js/mdx` 3.1.1 for MDX compilation; `remark-gfm` 4.0.1 and `remark-math` 6.0.0 for source syntax; `remark-mdx` 3.1.1 and `remark-parse` 11.0.0 with `unified` 11.0.5 for AST validation; `@types/mdast` 4.0.4, `@types/node` 22.20.5 and TypeScript 5.9.3 for type checking; `tsx` 4.23.15 for TypeScript scripts; and `vitest` 3.2.4 for validator tests. All are pinned exactly and used only by the Developers build.

## Verification

- Strict TypeScript check of `schema/chapter.ts` passed with TypeScript 5.9.3.
- All three new `.mdx` files compiled with MDX 3.1.1, `remark-gfm` 4.0.1, and `remark-math` 6.0.0 without writing generated output.
- SHA-256 values match pairwise for each original `.md` and its `.mdx` copy.
- `git diff --check` passed.

## Review and exclusions

The original content was authored/reviewed by the owner and is unchanged in these copies. The owner requested proceeding with implementation; this is not approval to enable the production flag. Review remains required before any pilot is enabled. The detailed transformation assumptions are recorded in Phase 0; ambiguous content will not be rewritten or supplemented.
