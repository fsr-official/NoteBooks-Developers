# MDX Pilot Phase 0 Report

**Date:** 2026-11-21  
**Plan:** [`PLAN-MDX.md`](PLAN-MDX.md)  
**Result:** Discovery complete; no source files, dependencies, workflows, or database state changed.

## Pilot and source conventions

The two complete triads contain 6,015 lines and 307,748 bytes. `PHYSICS06-SYSTEM_OF_PARTICLES_AND_ROTATIONAL_MOTION` is the smaller pilot (2,447 lines / 137,963 bytes), versus 3,568 lines / 169,785 bytes for Work, Energy and Power. Physics 06 is smaller while exercising all four planned diagram types, including both Desmos variants.

Both triads currently contain only `.md` files. Preserve them unchanged; create `.mdx` copies for the pilot. Decimal subsection IDs in CNOTES must resolve to NOTES. Physics 06 currently has matching sets (54 each); Work, Energy and Power has 53 CNOTES IDs, all present among 86 NOTES IDs, with 33 NOTES IDs omitted from CNOTES. Omitted NOTES IDs are informational, not validation failures. Importance stars are on top-level `SECTION` headings; propagate each section's importance to its subsections.

Syntax observed across the triads:

- Standard Markdown headings, lists, links and GFM pipe tables (`| header |` with `|---|` separator rows); no HTML-table syntax.
- Math delimiters: inline `$...$` and display `$$...$$`; no `\(...\)` or `\[...\]`.
- Obsidian callouts in NOTES only: `> [!example]`, `> [!important]`, `> [!note]`, `> [!tip]`, and `> [!warning]`.
- Fenced diagrams: `mermaid`, `tikz`, `desmos`, and `desmos3d`. Physics 06 NOTES has 1 Mermaid, 16 TikZ, 9 Desmos and 6 Desmos 3D blocks; its CNOTES has 11 Mermaid blocks. Work, Energy and Power NOTES has 9 Mermaid, 11 TikZ and 14 Desmos blocks; its CNOTES has 8 Mermaid blocks.
- No Obsidian `[[wikilinks]]` or transclusion embeds were found. No JSX component syntax is currently used.

After excluding fenced/inline code and math, Physics 06 has no raw `<` or `{` characters. Work, Energy and Power has six prose/table lines containing `<` inequalities (CNOTES lines 185, 366, 555, 573; GLOSSARY lines 70, 204), and no raw `{` characters. They are mathematical comparisons, not HTML; in the MDX copies, represent them as math or escape `<` as `&lt;`.

The pilot's NOTES already owns the worked solutions and examples. CNOTES repeats abbreviated outcomes for the same section/example IDs. Keep NOTES as the sole source of interactive question/answer example records; keep CNOTES as facts and link its matching example references to the NOTES record rather than duplicating examples. Do not invent missing examples or answers.

## Existing implementation and asset reuse

- `public.repository_entries` stores `record_type = 'repository' | 'file'`; it has no chapter-level model. The existing `public.feature_flags` table has the global `mdx-rendering` key, seeded `false` by `supabase/migrations/20261120210000_mdx_rendering_flag.sql`. No schema change is needed or authorized for this pilot; the manifest remains the chapter allowlist.
- The Framework has existing 2D and 3D Desmos DSL compilers. To keep the Developers build reproducible without changing Framework files or requiring a cross-repository checkout at build time, vendor the three pure source modules (`desmos-source.ts`, `desmos-2d.ts`, `desmos-3d.ts`) from Framework commit `4c06f97228c3aab5f9dcd16d916c285f38924c42`. Record that source revision and add parity tests against checked-in DSL fixtures. Do not run these compilers in the reader.
- TikZJax assets are present in both `NoteBooks-Developers/bin/tikzjax/` and `NoteBooks-Framework/public/bin/tikzjax/`, including the JS/WASM runtime, fonts and TeX assets. The planned reader can reuse the existing Framework assets; no asset copy or edit is required in discovery.
- The R&D README says “No production MDX compiler is installed.” This is stale: the Framework has a production server-side MDX compiler/route. Recommend revising that line to distinguish the existing server-side compiler from the proposed, not-yet-built precompiled chapter-bundle pipeline. Do not edit the README in this phase.

## Dependencies, questions, and exclusions

No dependency was added. For the builder, pin (do not use ranges) the existing Framework versions: `@mdx-js/mdx` 3.1.1, `remark-gfm` 4.0.1, `remark-math` 6.0.0, `tsx` 4.23.15, and TypeScript 5.9.3. These are for compile-checking and building the data tree; no React runtime or new database dependency is needed in the builder. List exact versions in the phase report before changing `package.json`.

No chapter configuration table, migration, production flag change, bundle publication, original `.md` edit, Framework edit, or existing workflow edit was made. No unresolved content decision blocks Phase 1. Owner review remains required before enabling the pilot in production.
