# MDX Pilot Phase 9 Report

**Date:** 2026-11-21  
**Result:** Connected eligible pilot NOTES requests to the precompiled reader behind the existing `mdx-rendering` feature flag.

## Changed files

- Added `NoteBooks-Framework/src/lib/chapter-bundle/selection.ts` to map only matching NOTES `.mdx` paths from `fsr-official/NoteBooks-Developers` to a normalized chapter ID.
- Updated `NoteBooks-Framework/src/app/read/page.tsx` to select the precompiled reader only when the feature flag is enabled, the requested path maps to a chapter, a pinned Developers SHA is configured, and the loader returns a validated bundle listed in that pinned manifest.
- Updated the `/precompiled/[chapterId]` route to require the same global flag before loading a manifest-listed bundle.
- Added an optional back-to-library link to the new `ChapterReader` toolbar.
- Added `NoteBooks-Framework/test/chapter-bundle-selection.test.ts` for eligible and ineligible source paths.

## Fallback behavior

- The feature flag being off, unreadable, or invalid keeps the request on the existing reader and logs flag-read failures.
- Missing pinned SHA, nonmatching source paths, missing manifest membership, fetch failures, or invalid bundle data do not select the new reader; eligible failures are logged and fall back to the existing renderer.
- Bundle membership, schema, source SHA, and renderer-version checks remain in the pinned loader. The existing renderer's implementation was not changed.
- No feature flag value, database schema, or migration was changed.

## Verification

- Framework `pnpm typecheck` passed.
- All 10 focused selection, delivery, and reader tests passed.
- ESLint passed on the changed selection and route files.
- Framework `pnpm build` passed, including the `/read` and `/precompiled/[chapterId]` routes.
- The source-path selector tests confirm that only the matching builder-repository NOTES file maps to the pilot ID.

## Limits

The global `mdx-rendering` flag remains off. Phase 10 still requires browser comparison and interaction QA, and owner review before enabling the pilot.
