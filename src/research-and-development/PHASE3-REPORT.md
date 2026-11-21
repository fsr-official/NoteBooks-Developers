# MDX Pilot Phase 3 Report

**Date:** 2026-11-21; follow-up audit completed after initial implementation  
**Result:** The Physics 06 pilot builds into a versioned, rebuildable JSON bundle with build-time glossary references.

## Changed files

- Updated `scripts/build.ts` to compile the chapter sources into a JSON-only tree, outline, facts, examples, glossary index, diagram index, and compiled Desmos data; write a manifest; and skip unchanged bundles by source SHA and renderer version.
- Added the pinned Desmos compiler source snapshot in `scripts/build-desmos-source.ts`, `scripts/build-desmos-2d.ts`, and `scripts/build-desmos-3d.ts`, attributed to Framework commit `4c06f97228c3aab5f9dcd16d916c285f38924c42`.
- Updated `research-and-development/schema/chapter.ts` for serialized pilot AST nodes, glossary references in notes and facts, and bundle schema version 2. Diagram nodes refer to the diagram index by ID, avoiding duplicate diagram source in the notes tree.
- Added `test/build.test.ts` to cover bundle serialization, incrementality, examples, glossary matching, manifest migration, and compilation of the pilot's diagram and Desmos blocks.
- Updated `scripts/validate.ts` and `test/validate.test.ts` so top-level `SECTION n` and `§n` IDs normalize consistently and NOTES/CNOTES must contain exactly the same unique IDs. This supersedes Phase 0's earlier informational treatment of NOTES-only IDs.
- Removed serialized example anchor links from the notes tree. The Framework renderer already generates the subsection's interactive Go To Example buttons; keeping both paths duplicated controls and produced links whose anchors did not match the rendered example IDs.
- Generated `build/manifest.json` and the Physics 06 chapter bundle.

## Build result

The bundle contains 12 outline entries, 54 facts, 34 glossary terms, 19 examples, 28 diagrams, and 15 compiled Desmos blocks. The build-time matcher emits 119 note glossary references and 62 fact references. Schema version is `2`, renderer version is `0.1.3`, and the notes tree contains no redundant example anchor links. The builder migrates a schema-1 manifest by rebuilding the bundle rather than treating the old output as current.

## Verification

- Developers `pnpm typecheck` passed.
- Developers `pnpm test` passed: 11 tests across 2 files, including every pilot diagram and Desmos DSL block.
- Developers `pnpm validate` passed; NOTES and CNOTES have exact one-to-one section-ID coverage.
- Developers `pnpm build` regenerated the pilot; generated output was inspected for schema/renderer versions, nonzero glossary references in notes and facts, and absence of redundant example anchor links.
- Framework `pnpm typecheck` passed, 8 focused delivery/reader tests passed, and ESLint passed on the relevant reader and delivery files.
- The regenerated manifest and chapter bundle passed the Framework runtime schema parsers.
- `git diff --check` passed.

## Limits and remaining work

No original `.md` note, existing Framework renderer, existing workflow, database object, or feature-flag value was changed. The `mdx-rendering` flag remains off. The content workflow was not run on GitHub, and the live webhook was not called. Glossary popup behavior and diagram/Desmos viewers remain for Phase 8.
