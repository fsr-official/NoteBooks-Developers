# NoteBooks Repository Audit — 2026-11-22

**Scope:** Read-only source and test audit of `NoteBooks-Framework`,
`NoteBooks-Developers`, and the three NCERT content repositories.

**Status:** Source-confirmed and test-confirmed findings are complete for the
available evidence. Browser verification was limited to the local production
home page at desktop and phone widths. Supabase, QStash, Vercel, Redis, GitHub
Actions, and live browser behavior remain production-verification items.

## Executive verdict

The repository is structurally mature and has substantial focused test coverage:

- Framework: 60 test files passed, 236 tests passed, 2 skipped.
- Framework typecheck passed.
- Framework production build passed.
- Developers: 37 focused build/parity tests passed.
- Developers typecheck passed.
- Local browser check found no JavaScript console errors at desktop or mobile
  width on the home page.

The highest-risk source-level issue is operational: repository reconciliation
can enqueue repeated jobs and lacks an idempotency/deduplication contract.
The strongest user-facing inconsistency is architectural: Markdown, runtime
MDX, static HTML, and React chapter-bundle readers maintain separate contracts
and can drift. The most concrete mobile/accessibility issue is missing modal
focus management in both AI drawer implementations.

## Alarm levels

| Level | Meaning |
|---|---|
| P0 — Blocker | A known path can block core reading, corrupt data, or make the service unsafe or unusable. |
| P1 — High | Likely production impact; should be investigated or fixed before further rollout. |
| P2 — Medium | Real inconsistency, reliability cost, or maintainability risk with bounded impact. |
| P3 — Low | Documentation, cleanup, or lower-risk optimization. |

## Highest-priority findings

| ID | Level | Area | Finding |
|---|---|---|---|
| R-02 | P1 | Rendering | Runtime MDX is enabled in two independent gates; Supabase enablement alone does not guarantee runtime trust allowlist enablement. |
| R-01 | P1 | Rendering | The Markdown, runtime MDX, static HTML, and React chapter-bundle readers use overlapping but non-identical contracts. |
| R-05 | P1 | Rendering | Developers and Framework currently disagree on the generated chapter-bundle schema. |
| Q-01 | P1 | QStash | Reconciliation and webhook deliveries do not carry an idempotency/deduplication key. |
| Q-02 | P1 | QStash/Supabase | A worker can succeed in Supabase but fail Redis rebuild and leave misleading run/status data. |
| S-01 | P1 | Supabase | The migration chain needs clean-database replay and live migration-history comparison. |
| U-02 | P2 | UI/accessibility | AI drawers declare modal semantics without focus movement, trapping, or focus restoration. |
| U-01 | P2 | Mobile | Stream pages place the theme/sidebar rail ahead of the library content on mobile. |
| P-01 | P2 | Performance | Several reader and Math dependencies/styles are statically connected to general workspace routes. |
| P-02 | P2 | Performance | Image preview bypasses Next.js responsive image optimization. |

## Detailed audits

- [Rendering and precompiled HTML audit](AUDIT-RENDERING.md)
- [Responsive design and web-performance audit](AUDIT-UI-PERFORMANCE.md)
- [QStash and Supabase audit](AUDIT-QSTASH-SUPABASE.md)
- [Live-production verification checklist](AUDIT-PRODUCTION-CHECKS.md)

