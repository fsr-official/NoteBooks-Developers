# Developer navigation

## Goal

The `/developers` destination in NoteBooks-Framework is a public, Supabase-backed content stream. Contributors can browse architecture notes, usage policies, renderer fixtures, and parser research in the same shell used by the subject libraries.

## Scope

The catalog entry points to `fsr-official/NoteBooks-Developers` on `main`. Content is read through the regular GitHub content pipeline and is published into the `developer` stream index after the signed repository update workflow runs. The stream includes:

- `architecture/` — public system boundaries and data flow
- `policies/` — usage guidance, privacy links, and license status
- `test-subjects/` — real reader fixtures for supported production renderers
- `research-and-development/` — parser status and proposals

This is intentionally curated documentation, not a source-code browser for private implementation details. Never publish secrets, private endpoints, or operational credentials.

## Updates

Pushes to the configured branch regenerate `files.json` and send a signed notification to NoteBooks-Framework. The app validates the repository against its Supabase catalog, queues a sync, and rebuilds the developer index from database state.
