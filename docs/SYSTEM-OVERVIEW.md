# System overview

## Purpose

NoteBooks-Framework is a Next.js study library with Supabase-managed accounts and repository catalog, GitHub-hosted learning content, and generated public stream indexes.

## Architectural boundaries

- Browser shell and server-rendered routes: Next.js App Router and React
- Catalog and account metadata: Supabase
- Learning content: enabled GitHub repositories with `files.json` manifests and Git blob SHAs
- Public tree indexes and short-lived caches: Redis-backed data served by NoteBooks-Framework
- Repository updates: signed GitHub Actions notifications, queued processing, and targeted index rebuilds

## Runtime composition

1. A visitor opens a stream route such as `/science` or `/developers`.
2. The client loads the stream tree and repository registry from the public JSON API.
3. Files are opened through server routes that validate the selected repository and path against the catalog.
4. An enabled content repository regenerates `files.json` on push and sends a signed POST with its repository and branch.
5. The webhook validates the signature and queues the repository update.
6. The worker checks the repository against Supabase, syncs file paths and SHAs, then rebuilds the affected stream index.
7. Admin, account, AI, and download capabilities use separate routes and authorization or rate-limit controls.

## Invariants

- Supabase is authoritative for the repository catalog and file metadata; generated indexes are derived artifacts.
- Workflow notifications enqueue sync work; they do not trigger an app deployment or process restart.
- The signed update contract is documented in `CONTENT-UPDATE-CONTRACT.md`.
- Developer documentation is content in the `fsr-official/NoteBooks-Developers` repository, indexed like the other streams.
