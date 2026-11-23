# Rendering and Precompiled HTML Audit

**Date:** 2026-11-22  
**Scope:** Production Markdown, runtime MDX, static HTML build, chapter bundles,
cache fallback, and reader contracts.

## R-01 — P1 — Reader implementations can drift

**Evidence**

- `/read` selects Markdown, runtime MDX, compiled HTML, or a precompiled React
  chapter bundle: `NoteBooks-Framework/src/app/read/page.tsx:49-189`.
- Runtime MDX uses `@mdx-js/mdx`:
  `NoteBooks-Framework/src/lib/markdown/mdx-compiler.ts:290-330`.
- Static HTML and chapter bundles are built by
  `NoteBooks-Developers/utils/build-html.ts` and `utils/build.ts`.
- Plain compiled HTML initializes a separate runtime:
  `NoteBooks-Framework/src/components/precompiled-html-reader/runtime/chapter-reader.js`.
- React chapter bundles use a separate reader:
  `NoteBooks-Framework/src/components/chapter-bundle/chapter-reader.tsx`.
- Chapter reader tests still expect examples and a four-tab mobile interface:
  `NoteBooks-Framework/test/chapter-reader.test.ts:76-102`.
- Static build tests still render and verify worked examples:
  `NoteBooks-Developers/test/build-html.test.ts:73-117`.

**Impact**

The same note can have different outline IDs, mobile panes, diagram behavior,
facts, chat context, worked-example navigation, and error behavior according
to which renderer is selected.

**Reproduction**

Open the same Developer chapter through its `.md`, runtime MDX, plain compiled
HTML, and React bundle paths while comparing heading IDs, navigation, mobile
tabs, diagrams, and chat context.

**Fix**

Create one versioned reader DOM/metadata contract. Keep one shared identifier,
outline, search-index, diagram, and active-section model for all renderers.
Where behavior is intentionally renderer-specific, encode that behavior in the
bundle schema and test both static and runtime renderers.

**Confidence:** Source-confirmed and test-confirmed; live path selection is
production-verification-required.

## R-02 — P1 — Runtime MDX has independent enablement gates

**Evidence**

- Supabase global and repository feature flags are read in
  `NoteBooks-Framework/src/lib/mdx-feature-flag.ts:12-69`.
- Runtime compilation additionally requires `TRUSTED_MDX_REPOSITORIES`:
  `NoteBooks-Framework/src/lib/markdown/mdx-compiler.ts:304-308`.
- `/read` enables Supabase-backed MDX, but does not verify the runtime trust
  allowlist before selecting runtime MDX:
  `NoteBooks-Framework/src/app/read/page.tsx:76-84, 153-178`.

**Impact**

A repository can appear enabled by Supabase and still fail rendering because
the environment allowlist is absent or incomplete. This creates an inconsistency
between configuration status and actual runtime behavior.

**Reproduction**

Set `mdx-rendering` and `repository.mdx_styled_rendering` to true while omitting
the repository from `TRUSTED_MDX_REPOSITORIES`, then open an `.mdx` file.

**Fix**

Use one authoritative repository enablement decision or fail closed with a
clear configuration-specific error. Include the trusted-repository decision in
preflight/admin diagnostics.

**Confidence:** Source-confirmed.

## R-03 — P1 — Compiled HTML caching depends on a multi-stage publication sequence

**Evidence**

- Public indexes, HTML content, renderer-version keys, and path pointers are
  updated in separate Redis operations:
  `NoteBooks-Framework/src/lib/precompiled-html-cache.ts:15-118`.
- HTML fetch, cache, stale fallback, and HTTP status are handled in
  `NoteBooks-Framework/src/lib/public-content-route.ts:65-153`.
- Cache fallback tests exist:
  `NoteBooks-Framework/test/public-content-route.test.ts`,
  `test/precompiled-html-cache.test.ts`.

**Impact**

A partial cache/index/build mismatch can serve stale HTML, return an unavailable
page, or leave a pointer to a content key that cannot be read. Strict validation
prevents corruption but makes publication consistency critical.

**Reproduction**

Update public-index metadata before writing HTML content, or write HTML content
without updating the path pointer, then request a compiled chapter.

**Fix**

Publish manifest/pointer/content as an atomic versioned bundle or add a repair
path keyed by commit SHA. Define which stale state is acceptable and which
state should fail closed.

**Confidence:** Source-confirmed; atomic-failure behavior requires integration
or production verification.

## R-04 — P2 — NCERT syntax coverage is strong but HTML/MDX parity is not

**Evidence**

Local repository inventory found heavy real usage:

- Science: 84 Desmos/Desmos3D fences, 731 Mermaid occurrences, 194 TikZ fences,
  4,909 bracket/begin/end math occurrences.
- Commerce: 1 Desmos fence, 348 Mermaid occurrences, 33 TikZ fences,
  3,898 bracket/begin/end math occurrences.
- Humanities: 171 Mermaid occurrences and no Desmos/TikZ or MDX JSX occurrences.

**Impact**

Fixture-heavy unit tests do not establish that every real NCERT combination
renders identically on mobile and in static HTML.

**Fix**

Add a generated corpus parity test across the three real repositories, limited
to representative files and every parser feature. Fail on unresolved KaTeX,
unsupported components, missing heading IDs, or mismatched section/search metadata.

**Confidence:** Test/source inventory confirmed; no full real-content browser
render pass completed.

## R-05 — P1 — Developer and Framework chapter-bundle schemas disagree

**Current status (2026-11-23):** Resolved in the version 3 producer/consumer
contract and focused source tests. Production deployment and browser-level
rendering remain unverified. The evidence below records the original
2026-11-22 audit snapshot.

**Historical evidence**

- Developers allows `heading.id: "chapter-overview"` and emits it from its build
  pipeline:
  `NoteBooks-Developers/src/research-and-development/schema/chapter.ts:24-27`,
  `utils/build.ts:310-322`.
- Framework's strict bundle validator permits only numeric section IDs:
  `NoteBooks-Framework/src/lib/chapter-bundle/schema.ts:134-135, 195-202`.
- Developers emits `facts.visuals`, but Framework's strict fact validator rejects
  keys outside its narrower shape:
  `NoteBooks-Developers/src/research-and-development/schema/chapter.ts:118-124`,
  `utils/build.ts:610-671`,
  `NoteBooks-Framework/src/lib/chapter-bundle/schema.ts:112-120, 357-365`.
- The Developers build test confirms generated facts contain visuals, while the
  Framework bundle fixture has `facts: []`:
  `NoteBooks-Developers/test/build-html.test.ts:149-170`,
  `NoteBooks-Framework/test/chapter-bundle.test.ts:19-35`.

**Impact**

A Developers-generated bundle can be rejected by Framework validation. `/read`
falls back to another reader, while `/precompiled/[chapterId]` reports the
bundle unavailable.

**Reproduction**

Build a populated chapter bundle in Developers and pass it to Framework's
`parseChapterBundle`; include the overview heading and visual facts.

**Fix**

Align both schema definitions and strict validators. Add a cross-repository
fixture/test using a populated generated bundle. Define whether visual facts are
part of the bundle contract or an HTML-only feature.

**Confidence:** High source-confirmed at the 2026-11-22 audit snapshot.

**Follow-up (2026-11-23):** This finding is resolved in the version 3
producer/consumer contract and focused source tests. Developers' schema,
build, HTML build, and build audit use version 3; `chapter-overview` is the
exact overview outline ID and `facts[].visuals` is required. Framework validates
the same version and field, allows only compiled Diagram/Desmos visuals, and
guards outline IDs through `isChapterOutlineId`. Source SHA and manifest checks
remain in place; unsupported or malformed version 2 bundles fail closed.

Developers build, HTML-build, and build-audit tests passed (18 total), with
typecheck passing. Framework chapter-bundle and reader tests passed (13 total),
with typecheck passing. This is source/test evidence, not production deployment
or browser-rendering verification. See the [chapter-bundle contract](CHAPTER-BUNDLE-CONTRACT.md)
and [Stage 3 verification](PLAN.md#stage-3-align-the-chapter-bundle-contract).

## R-06 — P2 — Incremental static rebuild does not invalidate HTML by renderer version

**Evidence**

- Static renderer version is `0.2.5`:
  `NoteBooks-Developers/utils/build-html.ts:12`.
- Incremental builds skip files when source/manifest state matches:
  `utils/build-html.ts:612-627`.
- Existing incremental tests do not change the renderer implementation between
  builds:
  `NoteBooks-Developers/test/build-html.test.ts:201-242`.

**Impact**

Changing HTML renderer code without bumping or fingerprinting the renderer
version can reuse stale generated HTML when source files are unchanged.

**Reproduction**

Build once into an output directory, change Markdown/HTML rendering code without
changing source files or `STATIC_RENDERER_VERSION`, then rebuild incrementally.

**Fix**

Bump the renderer version for every output-affecting change or add a build
fingerprint to the manifest/skip condition. Add a renderer-change regression test.

**Confidence:** High.

