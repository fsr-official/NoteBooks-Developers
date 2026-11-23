# Project overview

## What NoteBooks is

NoteBooks is a study library and reader. Students browse curriculum and other learning materials organized into library streams, then read the source documents in a web reader. Developers use a dedicated destination for public architecture, API, renderer, and policy documentation.

The site is not the source repository for most learning material. Content lives in separate GitHub repositories and is catalogued by NoteBooks-Framework. The Framework reads files through validated repository/path routes and generates public indexes from database state.

## Current system boundaries

- **NoteBooks-Framework:** Next.js App Router application, reader, API routes, account/admin interfaces, and integration logic.
- **Supabase:** Auth credentials and identity; application account records; repository anchors and file metadata.
- **GitHub:** source learning content and `files.json` manifests with Git blob SHAs.
- **Redis:** generated, rebuildable stream indexes and short-lived caches.
- **QStash:** asynchronous, retried repository synchronization work.
- **NoteBooks-Developers:** this repository; public developer documentation and renderer examples.

The currently documented library has lower-secondary, science, commerce, humanities, and developer streams. Issues and Community repositories are out of current public synchronization scope.

## What the webhook does

A content repository workflow regenerates its manifest and sends a signed `{repository, branch}` request to `POST /api/webhooks/repository-update`. The Framework verifies the signature and enqueues work. A `202 queued` response confirms acceptance into the queue, not completion of synchronization. The worker reconciles file paths and SHAs in Supabase, then rebuilds derived indexes. Daily reconciliation is the recovery route for missed notifications.

## Current state snapshot

As of the last verified check on 2026-11-20, the Developer workflow ran but the deployed webhook returned `503 {"error":"Repository update could not be queued"}`. This left the public Developer index behind the pushed documentation. The known next diagnostic is the sanitized Vercel function error and corresponding QStash enqueue status. Do not retry destructive operations or declare the issue fixed from a workflow status alone; verify the new run and index.

This snapshot ages quickly. Before using it, inspect the latest `main` commit, recent Actions, current public index, and current relevant source.

## Decisions and constraints to preserve

- Keep GitHub file paths and Framework raw/media delivery behavior.
- Supabase is authoritative for enabled repository configuration and file metadata; `GITHUB-REPOSITORIES.md` is a bootstrap/reference snapshot only.
- Generated JSON indexes must be rebuildable from Supabase.
- Never put passwords or privileged credentials in application tables, client code, documentation, or logs.
- Do not add Issues or Community content to public indexing without a new approved design.
- This repository's original material is `GPL-3.0-only`; third-party learning content and code retain their own terms.
