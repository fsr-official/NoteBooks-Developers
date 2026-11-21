# MDX Plan Plausibility Report

**Reviewed:** 2026-11-21  
**Plan:** [`PLAN-MDX.md`](PLAN-MDX.md)  
**Verdict:** **Plausible, but substantial and not implementation-ready as written.** The dual-renderer, prebuilt-bundle direction is sound. The source conventions, chapter-level flag model, safe compilation boundary, and artifact delivery need resolution before the pilot.

## What is feasible

- Keeping the current reader as a fallback while enabling the new renderer selectively is a sensible rollout strategy.
- A build-time chapter bundle can reduce request-time parsing and make the reader’s outline, facts, examples, glossary, and diagrams available as structured data.
- The Framework already has MDX, React, KaTeX, and GFM dependencies, and has working 2D/3D Desmos DSL compilers in `NoteBooks-Framework/src/lib/desmos-2d.ts` and `desmos-3d.ts`. These are useful building blocks, but the current MDX route is a server-side renderer, not the planned static JSON bundle pipeline.
- The proposed separate reader and mobile tabs are implementable without replacing the existing Markdown renderer.

## Findings from the current source

The research source currently contains **two complete chapter triads** (six files), all `.md`, totaling about **6,009 lines / 308 KB**. The proposed Work, Energy and Power pilot alone is about **3,565 lines / 170 KB**. Converting and restructuring it is meaningful editorial work, not just changing file extensions.

The pilot’s conventions do not match several strict assumptions in the plan:

- NOTES has 86 decimal-numbered subsection headings, while CNOTES has 53. Every CNOTES heading ID appears in NOTES, but 33 NOTES IDs are intentionally absent from the condensed notes. Requiring exact NOTES/CNOTES ID-set equality would reject the current chapter. Validate that CNOTES references valid NOTES sections instead.
- Importance stars appear on 13 top-level `SECTION` headings, not on the decimal subsection headings. Define whether importance belongs to the top-level section or how it maps to subsections before extracting it.
- The NOTES currently embeds solved examples and practice inline; it has 30 matching example/practice headings, while CNOTES has only four. The proposed explicit `from`, `concepts`, question, and hidden-answer records will require deliberate restructuring and author review.
- The glossary is alphabetized and uses bold term headings plus `§` references. It does not currently have structured `aliases` or `common` metadata.
- Existing source includes Mermaid, TikZ, and Desmos fences, tables, math, and callouts. Phase 0’s syntax inventory and escaping checks are necessary before adopting MDX; the `.md` files are not guaranteed to parse as MDX unchanged.

## Architecture and safety gaps

1. **The chapter flag needs a chapter-level data model.** The current Supabase `repository_entries` table stores repository and file rows, not chapters. A `mdx_styled_rendering` column there would enable or disable a whole repository, not one chapter. Use a chapter configuration table keyed to repository and chapter (and define branch/version semantics), or change the catalog model explicitly. A global `mdx-rendering` feature-flag row already exists and is seeded off; use that exact key rather than introducing a second global flag name.
2. **The planned safe-MDX boundary conflicts with the current compiler.** `NoteBooks-Framework/src/lib/markdown/mdx-compiler.ts` compiles and evaluates MDX expressions for trusted repositories, then server-renders React to static HTML. Rejecting only imports/exports is not equivalent to the plan’s “no executable code generated from note content.” The new build path must reject expressions and unapproved JSX/components, and serialize a restricted AST/data representation; do not execute the existing `renderMdxNote` path in CI or treat repository trust as a safety sanitizer.
3. **Bundle delivery is unspecified.** The plan writes `NoteBooks-Developers/build/`, while the reader lives in the separate `NoteBooks-Framework` repository. Specify how the app retrieves and caches those bundles, validates their schema and source SHAs, and serves the previous bundle if a new build is invalid or unavailable.
4. **The current content workflow is not the proposed builder.** `NoteBooks-Developers/.github/workflows/reusable-content-update.yml` regenerates and commits the repository `files.json`, then notifies the Framework. It does not validate or build chapter bundles. Add a content-change caller/workflow and keep bundle generation, validation, and publication as distinct steps. Publish atomically so a failed run cannot replace a known-good bundle.
5. **Status documentation disagrees.** `research-and-development/README.md` says there is no production MDX compiler, while the Framework has an MDX implementation and feature gate. Clarify that the chapter-bundle renderer in this plan is proposed and distinct from the existing server-side MDX path.

The on-demand Mermaid CDN and visible, domain-restricted Desmos API key are technically workable, as the plan notes, but add network and availability dependencies. Keep note content as data, and load those runtimes only from application-owned code after the user opens a diagram.

## Recommended changes before implementation

1. Complete Phase 0 against both triads. Record the actual heading, star, example, glossary, callout, math, and diagram conventions; change the CNOTES rule to valid-subset/reference validation.
2. Specify a chapter configuration schema and a typed, versioned bundle schema, including the exact section-ID relationships and how compiled Desmos DSL data is represented.
3. Write down the MDX AST allowlist and rejection rules before building. Treat the build output as inert JSON/data, not generated executable modules.
4. Define bundle ownership, cache keys, atomic publication, rollback, and the reader’s failure/fallback logging behavior across the two repositories.
5. Pilot the complete workflow on Work, Energy and Power—including human review, mobile layout, and old/new renderer comparison—before updating generators or migrating further chapters.

**Overall assessment:** A carefully scoped pilot is achievable. The main risks are content normalization and the security/data boundary, not the three-column UI or compiler availability. Resolve the five items above first; then proceed phase-by-phase as the plan prescribes.
