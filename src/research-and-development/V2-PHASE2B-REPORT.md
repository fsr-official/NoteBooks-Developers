# MDX Build v2 — Phase 2B Report

**Plan:** [`PLAN-MDX.md`](PLAN-MDX.md)  
**Result:** The shared reader runtime and temporary localhost showcase render the Physics 06 chapter and a standalone page.

## Runtime and showcase

- Added the framework-agnostic ES module and stylesheet under `runtime/`; the showcase and eventual Framework wrapper use the same runtime files.
- The chapter reader provides three synchronized desktop columns, mobile section tabs, examples navigation, glossary popups, and SVG diagram modals. Desktop order is Facts, Notes, Outline; the Outline occupies the right column.
- The Physics 06 CNOTES now provides a conceptual Summary and factual Important Notes for all 54 numbered sections. Its chapter brief appears in Facts while the Concept Roadmap is active. The separate At a Glance content is removed, and the navigation heading is Outline.
- The plain-page reader supports its static content and outline.
- Added one temporary showcase command and a built-file selector, light/dark toggle, narrow-viewport control, HTML/embedded-JSON inspector, and automatic reload after a rebuild.
- Desmos requests are hydrated on demand. The local showcase reads its key from the local environment configuration; the value is neither committed nor included in output or reports.
- No new UI framework or bundler was added. The native browser module and stylesheet are the runtime.

## Verification

- `pnpm test` passed all 31 tests; `pnpm typecheck` passed.
- The local Playwright showcase verified the initial Concept Roadmap brief, rightmost Outline placement, rendered KaTeX in Facts, and Outline navigation to section 1.1. Both Summary and Important Notes rendered for the active section.
- Browser `transitionrun` and `transitionend` events confirmed both incoming and outgoing fact panels fade over 180 ms; the previous fact is hidden after the transition. No browser errors occurred.
- A direct centered scroll probe did not activate a section because it placed the heading outside the observer's active band. The actual Outline navigation path was then exercised and successfully updated Facts, so no runtime change was needed.
- Earlier Playwright checks verified both generated document types, chapter regions, SVG output, mobile tabs, theme/narrow/inspect controls, and the standalone page. The build, source validation, HTML and Desmos audits also passed.
- Final smoke ran against `http://127.0.0.1:4173`; the server returned HTTP 200 and browser page errors were absent.

## Remaining scope

- The showcase is a temporary validation tool, not a deployed product.
- The `files.json` generator does not yet exist, so exclusion of runtime/showcase paths from that future manifest is not yet testable.
- Framework integration remains a later phase; the Framework worktree was not modified.
