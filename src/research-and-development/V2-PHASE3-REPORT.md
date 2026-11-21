# MDX Build v2 — Phase 3 Report

**Plan:** [`PLAN-MDX.md`](PLAN-MDX.md)  
**Result:** Local HTML, renderer-parity, and live Desmos checks pass. The Desmos audit has one non-fatal API-state warning.

## Parity

- Added `test/fixtures/markdown-parity.md` and a test that checks normalized output against a baseline captured from the Framework's `renderNote` renderer.
- The fixture includes the Physics 06 note's definition callout and motion table, plus representative wiki-link, embed, footnote, task-list, math, code, and standard-link cases. The current pilot sources do not contain all of those syntax forms.
- A direct comparison against `NoteBooks-Framework/src/lib/markdown/renderer.ts` passed for the fixture. The comparison ignores the decorative callout icon and KaTeX's hidden MathML accessibility tree; normalized text otherwise matches.

## Audits

- `pnpm audit:html` — passed for two fragments: 65 headings, 19 examples, 38 SVG diagrams, and 23 Desmos blocks. The audit checks HTML parsing, required reader hooks, unique section IDs, local fragment links, glossary references, non-empty SVGs, and inert JSON-only script elements.
- `pnpm audit:desmos` — passed for all 23 blocks and 191 expressions against calculator read-back. One warning remains: Desmos does not expose the `radius` slider's `sliderBounds.max` in `getState()`. The expression and request contents passed validation.
- `pnpm test` — passed, 31 tests; `pnpm typecheck` — passed.
- Final Playwright smoke — passed for chapter and plain-page rendering, SVGs, mobile tabs, reader controls, and both document types.

## Remaining scope

- No workflow was modified. The existing compile workflow runs `pnpm test`, including the parity test, but does not invoke `audit:html` or `audit:desmos`; the existing validation workflow still uses `audit-build.ts`. Wiring the new dedicated audits into CI remains for a later workflow phase.
- The single slider-bound warning is documented above; it is not treated as an audit failure because the API state omits that field.
- `files.json`, publication, and Framework integration remain later phases.
