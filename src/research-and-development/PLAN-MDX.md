# PLAN-MDX (v2)

Source files under `src/` are built by one GitHub Actions workflow into a mirrored tree of static HTML at the repository root. The NoteBooks reader serves that HTML with client hydration when the `mdx-rendering` flag is on, and keeps using the current server-side Markdown path for everything else.

Status: v2, re-architected around the mirrored `src/` tree (2026-11-21). Phases 0-9 of the previous design already exist in the repo; v2 reuses what fits.
Updated: 2026-11-21

---

## 0. Strict limits (apply to every phase)

These are hard limits. If a task seems to need breaking one, **stop and ask**. Do not work around it.

1. **One phase at a time.** Finish the phase and its acceptance checks before starting the next. Continue automatically when checks pass; stop only for an unresolved content decision or a failed acceptance check.
2. **Stay inside the phase's scope.** Each phase in section 9 has a "May touch" and a "Must not touch" list. Any change outside "May touch" is rejected.
3. **Never modify** the current server-side Markdown renderer, the existing server-side MDX route (`mdx-compiler.ts`, `renderMdxNote`), or any original `.md` note. They are preserved on purpose. The only existing workflows that may be replaced are this repository's own caller of the content-update workflow (`fmupdate.yaml`) and, with owner approval, the v1 MDX compile and validation workflows, and only in Phase V2-5. The shared reusable workflow `reusable-content-update.yml` is used by other repositories (confirmed: `fsr-science/SUPPLEMENTARY-PDF`) and must never be removed or have its contract changed.
4. **No refactors, renames, reformatting or cleanup** of existing code, even if it looks wrong. List it in the report instead.
5. **No new dependency without listing it** in the report (name, version, why). Pin exact versions.
6. **No database changes** except the owner-approved repository-level `mdx_styled_rendering` field needed to opt NoteBooks-Developers into the static HTML reader. If any other database change seems necessary, stop and ask.
7. **No deleting files.** Propose removals in the report; the owner approves them. The only exception is the owner-approved deletions listed in section 12.
8. **One job per script** (source checks, build, HTML audit, Desmos audit, files.json). No all-in-one script.
9. **Resolve implementation details within the locked decisions.** For unclear editorial conventions, make the smallest reversible choice, record it for review, and do not invent content.
10. **If a check fails twice, stop** and report the failure instead of trying a third approach.
11. **Every phase ends with a report:** what changed (file list), what was tested and how, what is unclear, what was not done.
12. **Every phase must leave the site working.** With the flag off, behaviour is identical to before.
13. **Work on a feature branch.** The owner has authorized enabling the static HTML reader for NoteBooks-Developers only; do not enable it for other repositories. Never merge to the default branch or deploy without owner approval.
14. **Secrets never appear in logs, reports, or committed files.**
15. **The owner-provided conversion machinery is used as provided.** The `public/` folder (interim LaTeX rules and related files) may be relocated with `git mv` into one folder of Copilot's choice (for example `utils/`), recorded in the report. Its behaviour is not rewritten. Any needed fix is proposed in the report, not applied.

## 1. Goal

Turn each chapter into an interactive, note-like reading experience: concepts, facts and examples in separate columns, linked to each other, with glossary hover and on-demand diagrams. Do the heavy work at build time so reading is fast.

## 2. The architecture in one page

```
repo root
  README.md, CLAUDE.md, LICENSE.md ...        .md outside src/  -> read by the current Markdown parser, as today
  src/                                        SOURCES (never shown to the reader)
     AI-NOTES/<CHAPTER>/                      a triad folder: GLOSSARY + NOTES + CNOTES
     research-and-development/PLAN-MDX.md     a plain document
  AI-NOTES/<CHAPTER>.html                     BUILT: one HTML file per triad folder
  research-and-development/PLAN-MDX.html      BUILT: plain document converted to HTML
  manifest.json                               build record: source paths + SHAs per built file
  files.json                                  reader index (repo tree WITHOUT src/)
```

Mapping rules:
- `src/X/Y.md` (or `.mdx`) becomes `X/Y.html` at the repo root: same folders and names, `src/` removed.
- A folder under `src/` holding GLOSSARY, NOTES and CNOTES files is a **triad folder**. It folds into **one** HTML file named after the folder, placed next to the folder's position in the mirrored tree (`src/AI-NOTES/<CHAPTER>/` becomes `AI-NOTES/<CHAPTER>.html`).
- Every other `.md` / `.mdx` under `src/` becomes its own HTML file.
- Static images and other static assets under `src/` are copied as-is to the mirrored path. Build-only files (such as `src/research-and-development/schema/chapter.ts`) are never published.
- If a folder has both `.mdx` and `.md` versions of a file, the `.mdx` is the source.

### Workflow (replaces this repository's content-update caller)

1. **Source checks** on `src/`: syntax, triad detection and completeness, one-to-one section IDs between NOTES and CNOTES, example links, glossary, duplicate paths, case-insensitive name collisions, mirrored paths that would collide with existing non-generated root paths.
2. **Build (compile):** plain documents go from Markdown to HTML; triads are folded into one chapter HTML; Mermaid and TikZ blocks are rendered to SVG at build time (TikZJax from `bin/`); Desmos DSL is compiled to request data. Output goes to a temporary directory. `manifest.json` is written with `SourceFiles` (`FilePaths` plus `FileSHAs`) for each built file.
3. **Compile checks:**
   - validate every built HTML file;
   - validate every compiled Desmos request with Playwright (section 7).
4. **Generate `files.json`:** list the repository **excluding `src/` and `utils/`**, including built `.html`, using `manifest.json` to add the source information to each built file's record. The HTML is not modified after validation, so the validated file is the shipped file.
5. **Publish and notify:** copy the validated mirrored tree to the repository root (`AI-NOTES/<CHAPTER>.html` for the pilot), then publish the built tree, `manifest.json` and `files.json` in one atomic commit. Send the update request only after that commit.

Any failure in steps 1-4 means nothing is published and the previous output stays live.

### How the reader chooses a path

- The reader dispatches on file type and the `mdx-rendering` flag.
- **`.md` outside `src/`:** the current server-side path, always.
- **Built `.html` files:** the new path (static HTML plus client hydration) **only when the flag is on**. With the flag off they are not served and not listed.
- `src/` is never listed or served, because `files.json` excludes it.
- Turning the flag off restores the old behaviour with no deploy.

## 3. Locked decisions

- **Repository:** NoteBooks-Developers. The reader lives in the separate NoteBooks-Framework repo.
- **One HTML file per triad folder.** Triad files may be `.mdx` (the source when present) or `.md`.
- **Parsers match production.** Plain `.md` documents are parsed with **Markdown-it**, using the same version, options and plugins as the production renderer (`renderNote`): Obsidian-style links, embeds, callouts, footnotes, task lists, KaTeX math, and raw HTML disabled. `.mdx` files (triads and interactive pages) go through the MDX/remark pipeline, which must support the same custom syntax. Both produce the same HTML fragment contract (section 5). For all syntax the two renderers share, the built output must match what production renders, and parity tests prove it.
- **Runtime and showcase.** The chapter runtime (JavaScript plus CSS) is built once, framework-agnostic, in this repository under `runtime/`. A temporary `showcase/` page loads the built HTML with that runtime for local testing: a single-document view for plain pages and a three-column view for chapters, with a light/dark toggle and an inspect pane. The Framework later reuses the same runtime unchanged through a thin wrapper, so it is not built twice. `runtime/` stays; `showcase/` is a dev tool and is removed after the Framework integration is accepted.
- **Interim conversion machinery (owner-provided).** The owner supplies a `public/` folder holding interim LaTeX rules and related files for converting the current Markdown. The build **must use it**, as an isolated first stage that runs before parsing, with its own tests, so it can be removed later when the notes no longer need it.
- **Supporting libraries** are the ones production uses (KaTeX for math, the same code highlighter if one is used) plus `parse5` for HTML validation, and Playwright for diagram rendering and the Desmos audit.
- **Source information lives in `files.json` records** (from `manifest.json`), not inside the HTML.
- **`manifest.json` is the build record** and the input for incremental builds; **`files.json`** is generated last from the repository tree plus the manifest, in the existing NoteBooks-Documents tree format.
- **Fragment plus shared runtime.** A built HTML file is a fragment: pre-rendered content with `data-*` hooks, SVG diagrams, and embedded data blocks. It contains no executable script. One chapter runtime in the Framework, versioned with `rendererVersion`, attaches the behaviour.
- **Diagrams are pre-rendered at build.** Mermaid and TikZ become SVG inside an svg container in the HTML. No diagram engine runs in the browser.
- **Desmos:** the existing 2D/3D DSL compilers produce request data at build. The data is embedded as JSON in the desmos container. The runtime loads Desmos on demand and applies it.
- **Desmos validation runs in CI** with Playwright against a localhost harness, using the localhost Desmos API key from a GitHub secret.
- **Pilot:** `PHYSICS06-SYSTEM_OF_PARTICLES_AND_ROTATIONAL_MOTION` first; Work, Energy and Power after the pilot is accepted.
- **No randomized numbers** in examples.
- **Notes content is reworked** to the new structure; the generators are updated after the pilot.
- **Safety hardening is not a requirement.** Notes are author-written. The build still fails on unsupported syntax, to catch mistakes early.
- **Repository-scoped MDX rollout.** The existing global `mdx-rendering` flag remains the kill switch. A new repository-level `mdx_styled_rendering` field enables the static HTML reader only for opted-in repositories; NoteBooks-Developers is the initial enabled repository. Other repositories remain off, and there is no chapter-level configuration.
- **GitHub Copilot decides implementation details** inside these limits and reports them.

## 4. Source conventions (confirm and refine in V2-0)

- **Triad folder** holds `<ID>-GLOSSARY`, `<ID>-NOTES`, `<ID>-CNOTES`. A folder with only some of the three fails the source checks.
- **Triad status:**
  - **migrated** (reworked `.mdx` that passes all checks) is built;
  - **not migrated** (only `.md` files that do not meet the structure, such as Work, Energy and Power today) is reported, not built, and does not fail the run;
  - any other problem fails the run.
- **Section IDs:** NOTES and CNOTES must match one-to-one for every section ID. Normalize the top-level `SECTION 1` / `§1` forms to the same ID, and match every decimal subsection ID (for example `3.7`) exactly. Neither file may omit or duplicate an ID.
- **Importance stars** sit on the top-level `SECTION` headings. Subsections inherit it. The build strips the stars from the text and records `importance`.
- The chapter brief lives in CNOTES and appears in the CNOTES panel with the chapter heading while the Concept Roadmap is active. The separate At a Glance section is removed; the reusable Outline navigation occupies the left column, NOTES stays in the middle, and CNOTES occupies the right column.
- **Examples** become explicit blocks with `from` (section IDs, can be several), `concepts` (section IDs used), question, and hidden answer. The build moves them to the end of the chapter.
- **Glossary:** alphabetized bold term headings with `§` references. `aliases` and a `common` flag are deferred (section 12): the sources have no syntax for them yet.
- **Diagram and Desmos blocks:** `mermaid` and `tikz` fences are rendered to SVG; a `desmos` fence holds DSL.

## 5. Built HTML (fragment contract; Copilot may refine and records changes)

- Root `<article data-chapter-id data-kind="chapter|page" data-renderer-version>`.
- Chapters have `data-outline`, `data-notes`, `data-facts`, `data-examples` regions; plain pages have a single content region.
- Sections carry `data-section-id` and `data-importance`.
- Glossary terms are `<span data-term="...">`.
- Each diagram is a `<figure data-diagram>` with its rendered SVG in an svg container. SVG colours are converted to theme variables or `currentColor` so every light/dark theme works.
- Each Desmos block is a `<div data-desmos data-id data-kind="2d|3d">` holding its compiled request as `<script type="application/json">` data.
- One `<script type="application/json" data-chapter-data>` block holds glossary and any other runtime data.
- No other script tags.

## 6. `manifest.json` and `files.json`

`manifest.json` (written by the build, one entry per built file):

```json
{
  "rendererVersion": "0.1.0",
  "files": {
    "AI-NOTES/PHYSICS06-SYSTEM_OF_PARTICLES_AND_ROTATIONAL_MOTION.html": {
      "kind": "chapter",
      "FilePaths": [
        "src/AI-NOTES/PHYSICS06-SYSTEM_OF_PARTICLES_AND_ROTATIONAL_MOTION/PHYSICS06-SYSTEM_OF_PARTICLES_AND_ROTATIONAL_MOTION-GLOSSARY.mdx",
        "src/AI-NOTES/PHYSICS06-SYSTEM_OF_PARTICLES_AND_ROTATIONAL_MOTION/PHYSICS06-SYSTEM_OF_PARTICLES_AND_ROTATIONAL_MOTION-NOTES.mdx",
        "src/AI-NOTES/PHYSICS06-SYSTEM_OF_PARTICLES_AND_ROTATIONAL_MOTION/PHYSICS06-SYSTEM_OF_PARTICLES_AND_ROTATIONAL_MOTION-CNOTES.mdx"
      ],
      "FileSHAs": { "glossary": "", "notes": "", "cnotes": "" }
    },
    "research-and-development/PLAN-MDX.html": {
      "kind": "page",
      "FilePaths": ["src/research-and-development/PLAN-MDX.md"],
      "FileSHAs": { "source": "" }
    }
  }
}
```

`files.json` keeps the existing NoteBooks-Documents tree format. For each built file, its record gains `SourceFiles` (taken from the manifest: `SourcePath` and `SourceSHAs`, using the existing key shape) and `RendererVersion`. Its `sha` is the git blob SHA of the final HTML. `src/` and `utils/` are excluded. Built `.html` files under the mirrored output paths are included; `manifest.json` itself must not appear as a library note.

A file is rebuilt only when a source SHA or `rendererVersion` changes.

## 7. Desmos validation (Playwright, in CI)

- A local harness (a page plus a small server, modelled on the existing `../desmos` project with its `state-audit` logic) is served on localhost.
- The Desmos localhost API key comes from a GitHub secret (Copilot picks the name and reports it).
- For each desmos block, the audit takes the **request exactly as embedded in the built HTML**, sends it through the harness, reads back the rendered response, and checks that every expression derived from the DSL is present. 2D and 3D both.
- A failure names the file, the block, and the missing expressions.
- The harness must live somewhere the workflow can reach: vendored into this repo, or fetched at a pinned commit. Copilot decides and reports.

## 8. Reader behaviour

**Desktop: three columns, synced by section.**
1. **Outline.** The navigation occupies the left column; importance is shown as highlighting.
2. **Main notes.** Concept roadmap first, then the notes. Each section ends with a **Go To Example** button.
3. **CNOTES.** The matching NOTES heading is repeated, followed by its conceptual Summary and then factual Important Notes. This right column follows the active section and renders LaTeX.

The chapter heading is paired with the Chapter Brief in CNOTES. The AI panel is collapsible. **Mobile:** a single column with tabs: Outline, Notes, CNOTES, Examples.

**Examples view (end of chapter):** three columns per example: the section(s) it links from; the question with the answer hidden until revealed; the concept used, pulled by ID, not copied. Inside each example, **Return To Section** is its own button, stacked on its own row.

**Glossary:** matched at build time, dotted underline. Desktop: hover. Touch: tap. The popup hides on scroll. First match per section only; skip headings, math, code and links; longest match first; respect `aliases` and `common`.

**Diagrams:** the inline SVG is shown as a thumbnail in the text; clicking opens it in a modal. **Desmos:** loads on demand from the embedded request. The Desmos key is visible in the page and restricted to your domain.

## 9. Phases

Each phase lists **May touch** and **Must not touch** (in addition to section 0). Work already done under the previous design is reused where it fits.

**Delivery order inside the phases:** get a plain page working through the whole path first (build, checks, showcase, then the Framework), then diagrams and Desmos, then triad folding and the three-column layout. Do not start triad layout work before a plain page works end to end.

### V2-0: Gap analysis and decisions (read-only)
**May touch:** `V2-PHASE0-REPORT.md` under `src/research-and-development/` only.
**Must not touch:** everything else.

- [ ] Read the existing reports (`PHASE0`-`PHASE9`), `utils/`, `schema/chapter.ts`, tests, and the Framework code written so far. For each artifact, classify: **reuse**, **adapt**, **replace**, or **propose removal**.
- [ ] Read the current content-update workflow, `CONTENT-UPDATE-CONTRACT.md` and `fmtree.py`. State exactly what the new workflow must keep (files.json format, notification), and whether any other repository calls the reusable workflow and would break if it is replaced.
- [ ] Inventory the production renderer (`renderNote` in the Framework): Markdown-it version, options and every plugin; KaTeX options and macros; code highlighting; the heading slug, outline and search-index algorithms; how Obsidian links, embeds and callouts are resolved. Decide how the Developers build gets identical behaviour (pinned copy or shared package) and pin identical versions.
- [ ] Read the owner-provided `public/` machinery completely. For each rule or file, report what it does and at which stage it applies (before parsing, KaTeX macros, after rendering). State whether production already applies the same rules, whether the rules can be re-applied safely to already-clean content (idempotent), and whether they should apply to `.md` only or to `.mdx` too. Decide whether source checks run on the raw or the normalized source; both must agree on what counts as an error. Propose the folder it moves to, and confirm the folder is excluded from `files.json` and from the Library.
- [ ] Confirm what the existing `mdx-rendering` flag currently gates, and whether reusing it for the new path interacts with the existing MDX route.
- [ ] Find every file under `src/` that violates the mirrored-tree rules: case-insensitive name collisions (the known pair `desmos-2d.md` / `DESMOS-2D.md` and its 3D twin are handled in V2-1), and mirrored paths that collide with existing root paths (`bin`, `scripts`, `test`, `src`, `node_modules`). The current tree shows no root-folder collisions; re-verify.
- [ ] Compare the three copies of the Desmos compilers (Framework, this repo's snapshot, `../desmos`) and recommend one source of truth.
- [ ] Decide where the Desmos harness lives for CI and the GitHub secret name.
- [ ] Check how TikZJax (`utils/tikzjax`) and Mermaid can be rendered headlessly in CI, and estimate CI time and generated HTML size (math markup is large) against Redis value limits.
- [ ] Confirm the `SourceSHAs` key shape and the notification payload.

Done when: the report answers every item, lists decisions and assumptions, and lists unclear points as questions.

### V2-1: Source checks
**May touch:** `utils/validate.ts` (adapt), its tests, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and the two owner-approved deletions below.
**Must not touch:** note files (other than the two deletions).

- [ ] Carry out the owner-approved deletion of `src/desmos-dsl/desmos-2d.md` and `src/desmos-dsl/desmos-3d.md` as described in section 12.
- [ ] Implement the section 2 step 1 checks and the triad status rules from section 4.
- [ ] Report every problem with file, line and reason; classify chapters as migrated, not migrated, or failing. Non-zero exit on failure.

### V2-1B: Pilot structure check and rework
**May touch:** the `.mdx` copies of the pilot triad under `src/AI-NOTES/PHYSICS06-SYSTEM_OF_PARTICLES_AND_ROTATIONAL_MOTION/` only.
**Must not touch:** the `.md` originals, other chapters.

- [ ] V2-0 found the pilot `.mdx` files byte-identical to the `.md` originals. Check whether they already carry the structure v2 needs: stars on top-level `SECTION` headings, explicit example blocks with `from` and `concepts`, and the chapter brief, at-a-glance and concept roadmap regions. Report exactly what exists and what is missing.
- [ ] Rework only what is missing, under rule 9: smallest change, no invented content, every assumption recorded for owner review. Do not add glossary `aliases` or `common` syntax.
- [ ] Keep every NOTES/CNOTES section ID one-to-one and rerun the source checks.

Done when: the report lists the structure present before and after, and the source checks pass. The owner reviews the content before the pilot is enabled (V2-8).

### V2-2: Build
**May touch:** `utils/build.ts` (adapt), new diagram and Desmos build scripts, their tests, `schema/chapter.ts` (types only), the owner-provided `public/` machinery (relocate only, see rule 15), dependencies as listed.
**Must not touch:** note files, workflows, repository output paths (build into a temporary directory only).

- [ ] Apply the interim conversion rules as the first stage, before parsing, as an isolated module with tests. Default: always for `.md`; for `.mdx` only if V2-0 shows the rules are idempotent. Record the decision.
- [ ] Mirror `src/` into a temporary tree: `.md` documents through Markdown-it (production-matching configuration), `.mdx` files and triads through the MDX/remark pipeline, triads folded into one chapter, assets copied.
- [ ] For MDX content, support the same custom syntax as production (Obsidian-style links, embeds, callouts, footnotes, task lists, math). Copilot chooses the mechanism (port the plugins to remark, or render Markdown bodies through Markdown-it) and records it.
- [ ] Math is rendered with KaTeX at build time using the production options. Heading IDs use the production slug algorithm so existing anchors keep working.
- [ ] Produce the heading outline and search index in the existing format and embed them in the page's data block.
- [ ] Render Mermaid and TikZ to SVG (convert colours for theming) and embed under svg containers.
- [ ] Compile Desmos DSL with the chosen compilers and embed the JSON request under desmos containers.
- [ ] Extract stars, build outline, facts and examples, match glossary terms, as in section 4 and section 8.
- [ ] Write `manifest.json` and skip unchanged files incrementally.

Done when: the pilot triad and a plain document both build, and the fragment contains no executable script.

### V2-2B: Runtime v0 and showcase
**May touch:** new `runtime/` and `showcase/` folders, `package.json` scripts, their tests.
**Must not touch:** the Framework repo, note files, the build output rules.

- [x] **Runtime:** a framework-agnostic ES module plus one stylesheet that attaches behaviour to the `data-*` hooks. All colours, spacing and fonts come from documented CSS variables so the Framework can map its existing theme tokens to them. Light and dark supported.
- [x] Build the runtime in the delivery order: plain page first (outline, headings, callouts, code, math), then chapter features (three synced columns, mobile tabs, examples view, glossary popups, SVG modals, Desmos on demand).
- [x] **Showcase:** one command (for example `pnpm showcase`) serves the temporary build output. An index lists every built file; each opens in the single-document view (plain pages) or the three-column view (chapters). Includes a light/dark toggle, a narrow-viewport check, and an **inspect pane** showing the prettified HTML and the embedded JSON data. Reloads after a rebuild.
- [x] Desmos in the showcase uses the localhost key from a local environment variable; the key is never committed or printed.
- [x] Limits: no new UI framework, one template per kind (page, chapter), no feature beyond section 8. List any bundler or dependency used.
- [x] Confirm `runtime/` and `showcase/` are excluded from `files.json` and the Library.

Done when: the pilot chapter and a plain document render in the showcase in light and dark, on a narrow viewport, with interactions working, using the same runtime files the Framework will import. **Accepted locally; the temporary showcase was removed after Framework integration.**

### V2-3: Compile checks (HTML audit and Desmos audit)
**May touch:** `utils/audit-build.ts` (adapt), a new Desmos audit script, the harness folder (if vendored), tests.
**Must not touch:** note files, workflows.

- [x] Parity tests (run in the test suite and in CI before the build): a fixture corpus of real notes covering callouts, embeds, footnotes, task lists, math, tables, code and links is rendered by the production renderer and by the new build; after normalization the content must match. Any difference must be fixed or explicitly listed as an accepted difference in the report.
- [x] HTML audit: valid HTML, required hooks, unique section IDs, resolving internal links and anchors, every glossary span has a definition, non-empty SVG, no stray script tags.
- [x] Desmos audit per section 7. Run locally with the key supplied through the environment.

### V2-4: files.json generator
**May touch:** a new `utils/files-json.*`, its tests, and `fmtree.py`.
**Must not touch:** workflows.

- [x] List the repository excluding `src/` and `utils/`, in the existing format; include generated `.html` files.
- [x] Add `SourceFiles` and `RendererVersion` to each built file's record from `manifest.json`; compute `sha` from the final HTML.
- [x] Update `fmtree.py` to enforce those exclusions and read the generated HTML metadata from the manifest.
- [x] Verify the output matches the existing format for all non-built files.

### V2-5: Workflow (replaces the current content-update workflow)
**May touch:** this repository's `fmupdate.yaml` caller, the workflow files under `.github/workflows/`, `utils/`, and (with owner approval) the v1 MDX compile and validation workflows.
**Must not touch:** other workflows.

- [x] Steps stay separate: source checks, build, compile checks, files.json, publish, notify.
- [x] Atomic publish: one commit, only after every check passes; a failed run leaves the previous output live.
- [x] Trigger on every change that affects the library or the built output: `src/**`, root documents (the index covers them), scripts, `bin/**`, the workflow, package files. Exclude the generated outputs (built `.html`, `manifest.json`, `files.json`), and have the bot push with the default `GITHUB_TOKEN`, which does not re-trigger workflows, so the bot cannot loop.
- [x] Keep `reusable-content-update.yml` and its contract unchanged: HMAC-SHA256 signature over the exact body, `X-NoteBooks-Signature: sha256=<hex>`, payload exactly `{ "repository", "branch" }`, secrets `NOTEBOOKS_UPDATE_URL` and `NOTEBOOKS_UPDATE_SECRET`, expected HTTP 202 `queued`.
- [x] Support a manual dry run (build and check, publish nothing). Use the feature branch first.
- [x] The compile workflow builds into a temporary directory; the post-validation publish step copies the mirrored output into the repository root, preserving paths such as `AI-NOTES/`.
- [x] Playwright and the Desmos secret are used in CI; the secret is never printed.

The first remote compile run exposed that `build-diagrams.ts` launches Playwright Chromium before any browser was installed. The compile workflow now installs Chromium and its system dependencies before diagram rendering; rerun the workflow after this fix is pushed.

### V2-6: Reader dispatch and delivery (Framework)
**May touch:** new modules in the Framework (dispatch and chapter-HTML delivery), their tests, the repository-scoped rendering field/migration, and the smallest possible edit to the `/read` route's file-type check so built `.html` is accepted and dispatched (today it accepts only `.md`, `.markdown` and `.mdx`).
**Must not touch:** the current Markdown renderer and the existing MDX route.

- [x] Dispatch by file type and both flags as in section 2; serve built `.html` only when `mdx-rendering` and the repository's `mdx_styled_rendering` field are enabled.
- [x] Fetch `files.json` and the HTML at a pinned commit SHA; verify the HTML blob SHA and `RendererVersion`; cache in Redis (compressed) keyed by (SHA, `RendererVersion`).
- [x] Serve the last known-good HTML on failure; log file and reason.

Implementation is complete locally. Apply the migration and rebuild the public indexes in the intended Supabase environment before enabling production traffic.

### V2-7: Runtime and layout (Framework)
**May touch:** a thin wrapper component, the token mapping, and the synced copy of the V2-2B runtime only.
**Must not touch:** existing reader components.

- [ ] Reuse the runtime and styles from V2-2B unchanged (a copy at a pinned version, or an imported package). The Framework adds only a wrapper (inject the fragment, call attach, clean up on unmount) and a mapping from its theme tokens to the runtime's CSS variables. Problems found here are fixed in the runtime and re-synced, never patched in the Framework copy.
- [x] Inject the fragment and attach behaviour to the `data-*` hooks. The runtime supports `0.2.x` and reports unsupported versions.
- [x] Three synced columns, mobile tabs, collapsible AI panel; theme tokens and section-bracket styling reused by importing.
- [x] Examples view, Go To Example and Return To Section, glossary popups, diagram modals over the inline SVG, Desmos on demand.
- [ ] Error boundary around each interactive feature.

Implementation report: the Framework runtime JavaScript matches the Developers copy. Theme mapping and reader CSS are integrated in Framework; its runtime selectors are scoped under the renderer-version attribute to prevent collisions with existing reader CSS. The AI panel is protected by an error boundary; individual DOM runtime features do not yet each have one.

### V2-8: QA and rollout
**May touch:** fixes for issues found, each listed in the report.
**Must not touch:** new features.

- [x] Compare built output with the source on the pilot: content, math, callouts, links.
- [ ] Interaction checks; light and dark mode for every theme; mobile layout.
- [ ] Complete local QA and record the result. The owner has authorized the repository-scoped setting for NoteBooks-Developers, but merging or deploying remains an owner action. Further chapters follow one at a time. Update the generators only after the pilot is accepted.

Latest local verification: Framework tests (222 passed, 2 skipped), typecheck, lint, and production build passed. Developers tests (31 passed), typecheck, source validation, HTML/Desmos audits, and `files.json` checks passed. Browser smoke verified the three-column reader, outline/facts, SVG and TikZ rendering, AI drawer, and mobile tab switching. The first remote compile run failed because Chromium was missing; the workflow now installs it before diagram rendering. Remaining: rerun Actions after pushing the fix, exhaustive theme and interaction QA, per-feature error boundaries, and applying the Supabase migration/rebuilding production indexes. Local Supabase is unavailable because its database container is not running.

## 10. Out of scope

- Progress and resume, highlights, personal margin notes.
- Randomized numbers, predict-then-reveal components.
- Changing the current Markdown renderer or the existing MDX route.
- AI panel changes.
- Updating the generation skills (after the pilot).

## 11. Risks

| Risk | Mitigation |
|---|---|
| Case-colliding source names produce one output name on macOS and Windows | The lowercase `desmos-2d.md` / `desmos-3d.md` duplicates are deleted in V2-1; the source check fails on any future collision |
| Mirrored folders collide with real root folders (`bin`, `scripts`, `test`) | Source check fails on collisions |
| Replacing the shared content-update workflow breaks other repositories | V2-0 finds all callers; keep the contract; feature branch and dry run first |
| `mdx-rendering` flag already gates the existing MDX route | V2-0 confirms; decide before V2-6 whether it can be reused as is |
| Content restructuring is large editorial work | Smaller triad first; "not migrated" triads are skipped, not forced |
| Interim conversion rules are temporary but hard-wired | Isolated first stage with its own tests, so it can be removed when notes no longer need it; no rule behaviour rewritten without the owner |
| Machinery folder (`public/` or its new home) shows up in the Library | V2-0 confirms it is excluded from `files.json` |
| Two parsers (Markdown-it for `.md`, MDX/remark for `.mdx`) drift from production behaviour | Pinned production-matching configuration, a shared fixture corpus, parity tests in CI |
| The runtime is built twice (showcase and Framework) and drifts | One runtime in `runtime/`; the Framework imports it unchanged through a thin wrapper |
| The showcase grows into a product of its own | Temporary by definition; strict limits in V2-2B; removed once the Framework integration is accepted |
| Three copies of the Desmos compilers drift apart | V2-0 picks one source of truth |
| TikZJax and Mermaid rendering is slow or flaky in CI | Incremental builds; fail with a clear message; measure in V2-0 |
| Baked SVG colours break in other themes | Convert colours to theme variables or `currentColor` at build |
| Pre-rendered math and SVG make HTML large | Measure in V2-0; compress in Redis |
| Desmos key is visible in pages | Domain-restricted key; separate localhost key in CI as a secret |
| Fragment and runtime versions drift apart | `RendererVersion` in files.json and the cache key; runtime declares its range and falls back |
| Bad build overwrites good output | Atomic publish; previous output stays live |
| Copilot drifts beyond scope | Section 0 limits, per-phase lists, a report after every phase |

## 12. Defaults chosen where the answers left room (owner may change)

1. Triads that are not migrated are reported and skipped; they do not fail the run.
2. Source information is in `files.json` records only, not inside the HTML.
3. The Desmos request is embedded as JSON data, not as executable JavaScript.
4. The reader's existing route dispatches by file type and flag; there is no separate route.
5. Static images under `src/` are copied as-is.
6. `.mdx` is the source when both `.mdx` and `.md` exist for a file.
7. Glossary `aliases` and `common` are deferred. The first build matches exact term text only (first match per section); no syntax is invented. The owner decides later whether to add them.
8. The v1 chapter-bundle pieces (the split MDX workflows, the `build/` bundle output, the Framework chapter route) stay in place until v2 is accepted. Retiring them is a later owner decision.
9. `runtime/` is permanent; `showcase/` is temporary. Both are excluded from `files.json`.

**Owner-approved deletions** (the only exception to rule 7 in section 0):
- `src/desmos-dsl/desmos-2d.md` and `src/desmos-dsl/desmos-3d.md`. The owner states these are duplicates of `DESMOS-2D.md` and `DESMOS-3D.md`. Before deleting, diff each pair and report the result. If a lowercase file contains anything its uppercase twin lacks, stop and ask; merging that content into another file, or editing other documents, also needs explicit owner approval. Delete with exact paths, then confirm the uppercase files still exist (this matters on case-insensitive checkouts), and list any documents that link to the lowercase names.

## 13. Kickoff prompt for Copilot

> Read PLAN-MDX.md fully. Work on a feature branch. Start with Phase V2-0 and write its report. Then execute phases in order under the strict limits in section 0, continuing automatically after each phase passes its acceptance checks. Stop only for an unresolved content decision or a failed acceptance check. Never enable the production flag, merge to the default branch, or publish generated output without owner approval.