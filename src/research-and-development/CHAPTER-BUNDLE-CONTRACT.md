# Chapter bundle contract

This note records the implemented contract shared by the Developers bundle
builder and the Framework chapter-bundle reader. It describes source and test
evidence; it does not certify a production deployment or real-browser result.

## Version and validation

The chapter bundle and its manifest use `schemaVersion: 3`. The Framework
parser validates the version and the complete object shape; unsupported
versions, malformed bundles, or malformed manifests fail closed instead of
being accepted as version 3. Bundle and manifest source SHA fields are checked,
and each manifest entry must agree with the corresponding bundle metadata.

## Outline identifiers

The outline accepts:

- `chapter-overview`, the exact identifier for the chapter overview;
- `SECTION-N` for a numbered top-level section; and
- subsection identifiers in `N.N` or `N.N.N` form.

The serialized notes tree uses `chapter-overview` or subsection IDs on headings
where an ID is supplied. The Framework reader validates outline navigation
identifiers with its `isChapterOutlineId` guard before using them.

## Facts and visuals

Every fact contains a `visuals` array, including when it has no visuals. The
allowed visual nodes are compiled Diagram and Desmos components:

- Diagram nodes have `id`, `kind` (`mermaid` or `tikz`), and optional `title`.
- Desmos nodes have `id`, `kind` (`2d` or `3d`), and compiled JSON `data`.

The validator rejects other visual node names, malformed props, and additional
unrecognized keys. These are compiled visual references/data, not permission
to place arbitrary component or JSX nodes in a bundle.

## Implementation and evidence

The Developers schema/build, HTML build, and build audit define and validate
the producer side of the contract. The Framework bundle schema and chapter
reader implement strict validation and guarded outline navigation on the
consumer side.

Focused verification passed:

- Developers: `pnpm exec vitest run test/build.test.ts test/build-html.test.ts test/audit-build.test.ts`
  (18 tests) and `pnpm typecheck`.
- Framework: `pnpm exec vitest run test/chapter-bundle.test.ts test/chapter-reader.test.ts test/chapter-reader-outline.test.ts`
  (13 tests) and `pnpm typecheck`.

These are separate repository test runs; they should not be read as a
production integration check. The current work did not verify deployed reader
behavior or publish a bundle.

See the resolved [R-05 rendering audit finding](AUDIT-RENDERING.md#r-05-p1-developer-and-framework-chapter-bundle-schemas-disagree)
and [Stage 3 verification](PLAN.md#stage-3-align-the-chapter-bundle-contract).
