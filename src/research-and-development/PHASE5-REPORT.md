# MDX Pilot Phase 5 Report

**Date:** 2026-11-21  
**Result:** Added the Framework-side pinned bundle loader and Redis cache adapter.

## Changed files

- Added `NoteBooks-Framework/src/lib/chapter-bundle/schema.ts` with strict runtime validation for manifest and bundle schema version 2, including serialized nodes, glossary references, component props, glossary entries, diagrams, Desmos data, and source SHA formats.
- Added `NoteBooks-Framework/src/lib/chapter-bundle/index.ts` to fetch the manifest and bundle from the Developers repository at a full commit SHA, validate manifest membership and metadata/source-SHA equality, and cache validated data by commit SHA and renderer version.
- Added `NoteBooks-Framework/src/lib/chapter-bundle/server.ts`, a server-only Upstash Redis adapter using the existing Redis client configuration.
- Added `NoteBooks-Framework/test/chapter-bundle.test.ts` for pinned fetches, cache hits, metadata mismatch, unavailable upstream, missing manifest membership, fallback behavior, and invalid inputs.

On fetch or validation failure, the loader logs the chapter and reason and serves a schema-valid last-known-good bundle when available. It does not use stale data when the pinned manifest validly omits the chapter. The module has no reader route integration yet.

## Verification

- Framework `pnpm typecheck` passed.
- All 7 focused chapter-bundle tests passed.
- ESLint passed on the new module and tests.
- The regenerated Physics 06 pilot bundle (schema 2, renderer 0.1.3) passed the Framework runtime schema validator.

## Limits

No existing Framework renderer, route, workflow, database object, or feature flag was changed. The repository's pre-existing unrelated modifications were preserved. The production flag remains off; route integration and rendering are subsequent phases.
