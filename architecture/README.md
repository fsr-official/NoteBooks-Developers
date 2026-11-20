# Architecture

NoteBooks-Framework is a Next.js App Router application. Supabase owns account metadata and the repository/file catalog; GitHub repositories hold the source learning materials; public stream trees are generated from catalog state and served through the Framework.

## Content path

1. A stream route loads its generated public index.
2. The reader requests an allow-listed repository path through the Framework's content routes.
3. GitHub Actions refreshes the repository's `files.json` after content changes and sends a signed repository/branch notification.
4. The Framework validates that repository against the Supabase catalog and queues the existing sync worker.
5. The worker compares file SHAs, updates the catalog, and rebuilds the affected stream index.

The [system overview](../docs/SYSTEM-OVERVIEW.md) and [stream architecture](../docs/STREAM-ARCHITECTURE.md) describe the public design in more detail.

## Developer stream

The `/developers` route is a native top-level navigation item. Its content is this repository, indexed in the `developer` stream alongside any retained legacy developer documentation source.

## Production and experiments

The deployed reader currently supports Markdown/KaTeX and the production Desmos 2D and 3D DSLs. Renderer fixtures live in [test-subjects](../test-subjects/README.md). Experimental parser proposals are kept separate in [research and development](../research-and-development/README.md); an R&D document does not imply a feature is shipped.
