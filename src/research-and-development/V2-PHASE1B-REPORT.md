# MDX Build v2 — Phase 1B Report

**Date:** 2026-11-21  
**Plan:** [`PLAN-MDX.md`](PLAN-MDX.md)  
**Result:** Pilot structure checks pass. Only the Physics 06 pilot `NOTES.mdx` was reworked.

## Structure before

| Requirement | Existing structure |
|---|---|
| Chapter brief | Present as `## Chapter Brief` at the start of NOTES. |
| At-a-glance | No explicit region. Prerequisites, key outcomes, and the scope note were grouped under `## Front Matter`. |
| Concept roadmap | Present as `## 🗺️ CONCEPT ROADMAP`, including its Mermaid source. |
| Importance stars | All 11 top-level `SECTION` headings already had one to three stars. No star edits were needed. |
| Examples | NOTES contained 19 worked examples: 14 example callouts, three bold-title examples, and two solved-example headings. They had existing question/solution content, but no explicit `from` or `concepts` metadata. The previous build parser inferred both IDs from the containing subsection. |

The GLOSSARY and CNOTES had no example blocks requiring these annotations. The existing NOTES/CNOTES section IDs were already one-to-one.

## Changes and structure after

- Renamed `## Front Matter` to `## At a Glance`; its existing prerequisites, key outcomes, and scope note were retained without adding content.
- Added explicit `[from=…; concepts=…]` annotations to all 19 existing NOTES examples. The `from` value identifies the subsection containing the example; `concepts` identifies existing section IDs used by the solution. No question or solution text was rewritten.
- Kept the chapter brief, roadmap, section stars, and all section IDs unchanged.
- Added no glossary `aliases` or `common` syntax.
- The metadata uses a plain-text suffix because HTML comments are rejected by the MDX compiler and MDX expression comments are rejected by the source validator. V2-2 must parse and remove these suffixes from the rendered fragment.

## Verification

- `pnpm --dir NoteBooks-Developers validate` — passed; Physics 06 is migrated and Physics 05 remains not migrated.
- `pnpm --dir NoteBooks-Developers exec vitest run test/validate.test.ts` — passed, 8 tests, including the pilot section-ID check and MDX syntax compilation.
- A focused metadata check verified all 19 annotations are adjacent to example blocks and every `from`/`concepts` ID exists among the 65 numbered NOTES headings.

## Not done / owner review

- The existing example text still relies on the build parser to split question from answer. V2-2 must verify the split against each pilot example and keep answers hidden in the output.
- No `.md` original, other chapter, workflow, `files.json`, or Framework file was changed. The new reader build and output audit remain for later phases.
- The selected `concepts` links are reversible editorial mappings based on the concepts used in each existing worked example; review them with the pilot content before enablement.
