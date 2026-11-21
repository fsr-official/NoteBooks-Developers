# MDX Build v2 — Phase 0 Report

**Date:** 2026-11-21  
**Plan:** [`PLAN-MDX.md`](PLAN-MDX.md)  
**Result:** Discovery complete. Only this report was added; source, build, workflow, and Framework files were not changed.

## Existing implementation: reuse, adapt, replace

| Artifact | Decision | Findings |
|---|---|---|
| `scripts/validate.ts` and validator tests | **Adapt** | The parser already checks MDX syntax, one-to-one NOTES/CNOTES section IDs, examples, glossary terms, and component props. Its entry point is fixed to the former `research-and-development/src/<chapter>` layout and a single pilot; v2 needs recursive `src/` discovery and the migrated/not-migrated/failing classification. |
| `scripts/build.ts` and schema types | **Adapt** | Reuse the section, example, facts, glossary, and Desmos transformations as an intermediate representation. The current writer emits one lowercase chapter JSON bundle plus `build/manifest.json`; it reads only the old path and does not mirror plain documents or assets. Replace the writer with the v2 mirrored HTML output and root `manifest.json`. |
| `scripts/audit-build.ts` and audit tests | **Replace/adapt** | `parse5` and malformed-HTML checks are reusable. The current audit creates temporary full-page HTML rather than the shipped fragment, keeps Mermaid/TikZ source instead of SVG, forbids all scripts, and deliberately substitutes a skipped placeholder for Desmos. V2 must audit the actual fragment, permit only the specified JSON data script blocks, and validate SVG and embedded Desmos requests. |
| Desmos build snapshots and tests | **Reuse/adapt** | The 2D and 3D compiler files match the current Framework versions except for the import path; the source helper differs only by the pinned Framework commit constant. Keep Framework as the compiler source of truth and retain the commit pin. Add tests for the emitted request embedded in the final HTML. |
| `build/` and the split MDX workflows | **Replace for v2 output** | The current `build/` is ignored and contains no generated files. The compile workflow uploads a chapter bundle; the separate validation workflow audits a temporary HTML rendition and skips Desmos. Neither publishes the mirrored tree, root manifest, or final `files.json`. Preserve these existing files unless a later phase explicitly authorizes changing them. |
| `fmtree.py` | **Reuse without editing** | It already excludes `src/` and emits the required folder/file tree shape. It filters out `.html`, `.json`, and static image formats, so the new `files.json` generator must augment its tree with built HTML records and metadata (and any needed copied assets). Its file records use Git blob SHAs. |
| Framework bundle schema/loader and `ChapterReader` | **Adapt/replace delivery** | The existing reader interactions and theme styling are useful references. The current loader fetches uncompressed JSON bundles from `build/manifest.json`; v2 needs pinned HTML plus `files.json`, Git blob SHA and renderer-version validation, compression, and last-known-good HTML. The current selection helper matches the former source path and cannot select the v2 mirrored `.html` paths. |
| Framework `mdx-rendering` flag and Markdown paths | **Reuse, with new dispatch** | The flag is read server-side from Supabase, seeded `false`, cached for 15 seconds, and currently gates trusted `.mdx` execution and the precompiled chapter route. `/read` accepts only `.md`, `.markdown`, and `.mdx`; it cannot serve built `.html`. Add v2 file-type dispatch while preserving the existing Markdown renderer and MDX route. No flag or database change is needed. |
| Framework Desmos and Markdown runtimes | **Reuse as runtime references** | The existing Desmos API routes keep `DESMOS_API_KEY` server-side; the chapter viewer already applies compiled 2D/3D data on demand. TikZJax build assets are in Developer `utils/tikzjax`; Framework retains its browser assets in `public/bin/tikzjax`. V2’s fragment must carry data/hooks, not executable scripts; the shared Framework runtime will attach behavior. |

## Source tree and naming checks

- `src/` currently contains 43 files: 39 `.md`, 3 `.mdx`, and one TypeScript schema file at `research-and-development/schema/chapter.ts`.
- Physics 06 is the only migrated triad: all three `.mdx` files are byte-identical to their `.md` originals, and the existing reports record 54 matching NOTES/CNOTES section IDs. Physics 05 has only its three `.md` files and is therefore **not migrated** under v2’s rules.
- The only case-insensitive source-name collisions found are the owner-approved pairs `src/desmos-dsl/desmos-2d.md` / `DESMOS-2D.md` and the corresponding 3D pair. V2-1 must diff each pair before the approved deletions.
- No source file’s computed mirrored output path collides case-insensitively with an existing root file. Some mirrored destination parent folders already exist; those contained no conflicting files in the checked tree.
- The TypeScript schema is not a static asset. A blanket “copy other files under `src/`” rule would publish it at the root; the source/build rules should explicitly keep it build-only.
- Existing source files and uppercase chapter IDs support the v2 naming rule. The `.mdx`-wins rule is deterministic for the duplicate Physics 06 sources.

## Content workflow, index, and notification contract

- The current Developer `fmupdate.yaml` calls the shared `reusable-content-update.yml`. That reusable workflow regenerates and validates `files.json`, commits it when changed, and sends a signed update request. It does not build HTML.
- The shared workflow is not Developer-only: `fsr-science/SUPPLEMENTARY-PDF/.github/workflows/fmupdate.yaml` is a confirmed external caller; Framework also distributes a caller template. Public code search found that caller, but cannot prove there are no additional private or unindexed callers. **Do not remove or break the reusable workflow.** Replace only the Developer-specific caller/pipeline as needed, retaining the shared contract.
- `CONTENT-UPDATE-CONTRACT.md` requires an HMAC-SHA256 signature over the exact UTF-8 body, `X-NoteBooks-Signature: sha256=<hex>`, and a direct HTTP 202 response with `status: "queued"`. The payload is exactly `{ "repository": "<owner/repo>", "branch": "<branch>" }`; it contains no file contents or credentials. The workflow secrets are `NOTEBOOKS_UPDATE_URL` and `NOTEBOOKS_UPDATE_SECRET`.
- In the build manifest, triad source hashes use the existing `glossary`, `notes`, `cnotes` keys; plain pages use `source`. They are SHA-256 content hashes (64 lowercase hex characters). Manifest `FilePaths` map to `files.json` `SourceFiles.SourcePath`, and `FileSHAs` map to `SourceSHAs`. The final built HTML’s `files.json` `sha` remains the 40-character Git blob SHA. `RendererVersion` is also copied to each built file record.
- `fmtree.py` includes ordinary document files at the root but excludes `src/` and HTML/assets. A trigger limited only to `src/**` would miss root documents that still affect the library index; the v2 workflow must preserve those updates too.

## Desmos, diagrams, and CI estimate

- **Compiler source of truth:** `NoteBooks-Framework/src/lib/desmos-source.ts`, `desmos-2d.ts`, and `desmos-3d.ts` at commit `4c06f97228c3aab5f9dcd16d916c285f38924c42`. The Developers snapshots match the Framework 2D/3D implementations except for their relative import path. The separate `../desmos` playground copies are older: for example, its 2D compiler lacks the current legacy-JSON rejection. Its `state-audit` implementation and examples are useful references for checking calculator state and expression analysis, not the compiler source of truth.
- **Harness and key:** the playground has a localhost-only server and state-audit logic but no Playwright dependency or CI harness. Build a local Playwright harness that audits the JSON exactly as embedded in the fragment. Use a separate GitHub secret named `DESMOS_LOCALHOST_API_KEY`, restricted to localhost, and never print it; do not reuse or expose the production key. No key or `.env.local` contents were read.
- **Headless diagrams:** the repository has 14 MB of local TikZJax assets, including JS/WASM and fonts; Playwright Chromium can load them locally and capture the resulting SVG. Current Mermaid rendering is browser/CDN based (`mermaid@11` without an exact version), so the build should use an exactly pinned Mermaid dependency rather than depend on that unpinned CDN. Neither Playwright nor a Mermaid package is currently a direct Developers dependency.
- **Estimate (not benchmarked):** the Physics 06 pilot has 16 TikZ, 12 Mermaid, and 15 Desmos blocks. Allow roughly 3–8 minutes for a complete Ubuntu CI run after browser setup; measure during V2-2/V2-3, especially for sequential Desmos API checks.
- **HTML/Redis sizing:** Phase 6 previously measured about 958 KB of server-rendered pilot markup before v2’s baked SVGs. There is no final v2 fragment to measure yet. The current Framework bundle cache stores JSON without compression and has no per-value application cap; no deployed Upstash plan limit is recorded in the repository. Measure raw and compressed v2 output, compress before Redis as planned, and confirm the actual deployment limit before rollout.

## Questions and next phase

1. **Decision:** `src/research-and-development/schema/chapter.ts` is build-only, not a static asset, and is excluded from published mirror outputs. This is the smallest reversible interpretation of the source/asset rules.
2. No unresolved v2-0 decision blocks source checks. V2-1 should first diff the two approved lowercase Desmos duplicates, then implement recursive source checks and triad status reporting.

No source checks, build, or workflow were run or modified in this read-only phase. The global flag remains off. Existing uncommitted changes in both repositories were preserved.
