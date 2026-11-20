# Desmos 2D and 3D Setup Audit

**Audit date:** 2026-11-18  
**Scope:** Desmos DSL specifications, compiler implementations, Markdown reader integration, API script routes, and automated tests in `NoteBooks-Framework`.  
**Purpose:** Record what is implemented, what has been verified, and what must be checked before relying on these renderers in production.

## Executive verdict

| Area | Assessment |
|---|---|
| Desmos 2D DSL/compiler | Implemented and covered by compiler tests. Runtime integration is present, but live rendering and expression-analysis behavior have not been independently certified in this audit. |
| Desmos 3D DSL/compiler | Initial implementation is present and covered by compiler tests. Treat as experimental until tested with an API key that has 3D access in a real browser. |
| API key handling | The key is read by server-only code and used by the API proxy to fetch the Desmos script. Do not put the key in Markdown, client code, or repository files. |
| Production readiness | 2D is ready for controlled end-to-end verification. 3D is not yet verified for production use. Neither path currently implements the full analysis and round-trip verification designs in its DSL document. |

This is an implementation and readiness audit, not a live Desmos API certification or a security review. No API key was read or used as part of this audit.

## How rendering is wired

1. The Markdown renderer recognizes `desmos` and `desmos3d` fenced blocks and emits browser-rendered placeholders.
2. The active reader extracts each block's source and runs the corresponding compiler:
   - 2D: `compileDesmos2D`
   - 3D: `compileDesmos3D`
3. If compilation succeeds, the reader loads the matching same-origin script route:
   - `/api/desmos.js`
   - `/api/desmos3d.js`
4. The routes call shared server-only API proxy code, which reads `DESMOS_API_KEY` from the server environment and fetches Desmos' v1.11 calculator script.
5. The reader creates the matching calculator, checks required methods, applies the compiled state, and displays an error in the block when initialization or capability checks fail.

The 3D route uses the same upstream calculator script URL as the 2D route. The reader then checks whether the loaded Desmos global exposes `Calculator3D`; the route itself does not establish that the account or API key has 3D access.

## Feature audit

| Capability | 2D | 3D |
|---|---|---|
| Plain LaTeX expressions and `@id` headers | Implemented | Implemented |
| Attribute and directive parsing with diagnostics | Implemented | Implemented |
| Presets, options, settings, notes, and tables | Implemented | Implemented |
| Sliders, labels, colors, expression styling | Implemented | Implemented, with 3D-specific fields still API-unverified |
| View bounds | 2D bounds | x/y/z bounds; runtime support is API-unverified |
| Vectors, point and axis sugar | Not applicable | Implemented by compiler; generated vector syntax is API-unverified |
| Surfaces and parametric domains | Not applicable | Implemented by compiler; resulting 3D API fields are unverified |
| Camera directive | Not applicable | Implemented by compiler; `setCamera` support and shape are unverified |
| Visible compile and initialization errors | Present | Present |
| API method capability checks | Checks required 2D methods | Checks required methods, WebGL, and selected 3D drag capabilities |
| Desmos expression analysis after applying state | Not implemented | Not implemented |
| Expected-value checks or round-trip state verification | Not implemented; `%expect` and `%verify` are rejected | Not implemented; `%expect` and `%verify` are rejected |
| Folder serialization | Rejected as unsupported | Rejected as unsupported |

The detailed language references are [DESMOS-2D.md](./DESMOS-2D.md) and [DESMOS-3D.md](./DESMOS-3D.md). The 3D reference explicitly distinguishes its first implementation from its deferred verification design.

## Findings and follow-up

### A1 — 3D API behavior has not been verified against a live calculator

**Priority:** Release blocker for production 3D content  
**Evidence:** The compiler tests assert generated output, and the reader checks for `Calculator3D`, WebGL, and selected methods. No live 3D graph session has confirmed that the generated vector LaTeX, surface fields, settings, camera values, or drag modes are accepted and rendered as intended.

**Action:** Use a development API key/account with 3D access and run the manual verification checklist below. Record the browser, API access state, tested examples, and any unsupported fields. Keep unverified 3D-specific DSL fields marked as experimental until this is done.

### A2 — Successful `setExpressions` is not proof that expressions rendered correctly

**Priority:** Important for both renderers  
**Evidence:** The reader applies compiled expressions, but it does not inspect Desmos expression analysis or read calculator state back. An invalid or unsupported expression can therefore be accepted by the API without being reported by the current application-level checks.

**Action:** Add and test expression-analysis reporting for both 2D and 3D. At minimum, surface per-expression API errors with the expression ID. Consider round-trip checks for IDs and important fields after confirming the supported state shapes.

### A3 — The 3D API method probes are capability checks, not behavioral validation

**Priority:** Important for 3D  
**Evidence:** The reader checks whether methods such as `updateSettings`, `setMathBounds`, and `setCamera` exist before using them. Method presence does not establish that a method accepts the compiled shape or that it produces the intended result.

**Action:** Confirm each method and payload with the actual 3D API. In particular, verify whether `updateSettings` is the correct settings method for the supported API version, and validate camera and bounds behavior. Update the design reference and tests to reflect confirmed behavior.

### A4 — API upstream failures become a fallback script response

**Priority:** Operational  
**Evidence:** If the key is absent or the upstream fetch fails, the proxy returns a small JavaScript fallback that sets `Desmos.__notebooksUnavailable`. The reader then shows a user-facing unavailable message; server logs retain the upstream failure detail. This avoids an empty graph, but the client-facing message does not distinguish missing configuration from a network or upstream failure.

**Action:** When diagnosing a failed graph, check server logs and confirm `DESMOS_API_KEY` is configured in the server environment. If operators need clearer diagnosis, add a safe, non-sensitive status/error code without returning the key or upstream response body to the browser.

### A5 — Automated coverage does not replace browser and API verification

**Priority:** Important before release  
**Evidence:** Compiler tests validate parsing and output shapes, and renderer tests validate Markdown placeholders. They do not prove that the real Desmos API loaded, rendered a graph, handled invalid LaTeX, resized correctly, or cleaned up calculator instances during navigation.

**Action:** Complete the manual checklist and add browser-level integration tests where practical, especially for API load failure, 2D rendering, 3D unavailable/WebGL failure, and disposal/navigation behavior.

## Manual release checklist

### Common setup

- [ ] Configure `DESMOS_API_KEY` only in the server environment used by the app. Never place it in a Markdown document or client-side source file.
- [ ] Start the app and confirm the server can reach Desmos' calculator script endpoint.
- [ ] Open a note containing one valid block and one intentionally invalid DSL block. Confirm the valid block renders and the invalid block shows a readable, located error instead of remaining blank.
- [ ] Test with the API endpoint unavailable or the key omitted in a non-production environment. Confirm the reader displays an unavailable message and server logs explain the failure without logging the key.
- [ ] Check browser console and server logs for uncaught exceptions or unexplained errors.

### 2D

- [ ] Render a simple expression, an expression with a slider, a preset, a note, a table, and explicit view bounds.
- [ ] Confirm colors, labels, styles, settings, and bounds visually match the source.
- [ ] Try an invalid attribute, duplicate ID, malformed range, and unsupported directive. Confirm each fails compilation with a useful diagnostic.
- [ ] Try invalid LaTeX. Record whether Desmos reports the error and whether the reader surfaces it; the current reader does not perform expression-analysis checks.
- [ ] Resize the reader and navigate away and back. Confirm the calculator fits its container and is destroyed/recreated without stale or duplicate graphs.

### 3D

- [ ] Use an API key/account with 3D access. Confirm the loaded Desmos global exposes `Calculator3D`.
- [ ] Confirm WebGL works in the target browsers/devices.
- [ ] Render a point, a simple vector, a vector group, axes, a bounded surface, a parametric expression, a table, and a note.
- [ ] Verify 3D settings, x/y/z bounds, camera orientation/zoom, and drag modes visually and interactively.
- [ ] Confirm 3D-disabled API access, missing `Calculator3D`, missing WebGL, and missing calculator methods each produce an explicit in-block error.
- [ ] Test malformed vector tuples, duplicate IDs, unsupported 2D-only attributes, `%folder`, `%expect`, and `%verify`. Confirm unsupported features are rejected rather than silently ignored.
- [ ] Record any fields whose API behavior differs from the DSL output, then update the compiler, tests, and [DESMOS-3D.md](./DESMOS-3D.md).

## Automated validation

Run from `NoteBooks-Framework`:

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

The latest recorded validation for this implementation passed all **143 tests**, typecheck, and production build. Lint completed with five warnings in unrelated files under `public/client/` and no lint errors. These checks cover repository behavior; they do not establish live Desmos API compatibility.

## Audit conclusion

The 2D and 3D paths share a sound high-level architecture: compile a constrained DSL, load the API through a server route, validate runtime capabilities, and show block-level errors. The 2D compiler has broader API documentation support and a passing test suite, but still needs live rendering and expression-analysis checks before it can be called fully verified. The 3D compiler is a useful first implementation, not a production-certified renderer: live API access and visual/interactive validation are the main release gates.
