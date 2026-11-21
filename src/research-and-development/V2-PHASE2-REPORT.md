# MDX Build v2 — Phase 2 Report

**Plan:** [`PLAN-MDX.md`](PLAN-MDX.md)  
**Result:** The Physics 06 pilot chapter and a standalone Markdown page compile to temporary static HTML fragments. The fragment audit confirms there are no executable scripts.

## Implementation

- Added the isolated Markdown preprocessing stage and tests. It reuses `obsidianParseFrontmatter` from `public/js/obsidian-markdown-it.js` before Markdown or MDX parsing. The transform is idempotent and removes only leading YAML frontmatter.
- Built `.md` content with Markdown-it and the production-matching parser versions/options, and compiled the pilot `.mdx` triad through the MDX/remark pipeline.
- Compiled chapter data, headings, search blocks, glossary references, examples, diagrams, and Desmos request JSON into static fragments. Desmos requests are inert JSON, not executable scripts.
- Rendered the pilot's Mermaid and TikZ diagrams to SVG: 12 Mermaid and 26 TikZ occurrences (38 total), representing 28 distinct diagram sources.
- Preserved 11 CNOTES visuals in the Facts column. CNOTES visuals occurring before the first numbered subsection are attached to the first numbered subsection that follows; this placement is reversible and remains an explicit assumption.
- Kept output under `/tmp/notebooks-mdx-v2`; the pilot and standalone page are the only HTML outputs in this iteration. No note source files, publishing paths, or workflows were changed.

## Dependencies

Pinned build and audit dependencies include `@mdx-js/mdx` 3.1.1 and the unified/remark parser plugins; Markdown-it 15.0.3 and its footnote, subscript, superscript, task-list, and texmath plugins; KaTeX 0.19.1; Mermaid 11.17.2; Playwright 1.65.1; and parse5 7.3.0. They provide MDX/Markdown parsing, build-time math and diagram rendering, browser rendering, and HTML parsing/auditing. The runtime uses a native ES module; no UI framework or bundler was introduced.

## Verification

- `pnpm build` — passed; pilot chapter and standalone page generated.
- `pnpm validate` — passed; Physics 06 is migrated and Physics 05 remains not migrated.
- `pnpm audit:html` — passed for both generated fragments.

## Remaining scope

- This iteration builds the pilot and one plain page, not a complete mirror of every file and asset under `src/`. The general mirror, `files.json`, and incremental manifest workflow remain for later phases.
- No standalone LaTeX conversion-rule file was found in the provided public machinery. No additional math rewrite was invented; KaTeX runs with the production options.
- Existing actions and repository output paths were not changed; Framework integration remains out of scope.
