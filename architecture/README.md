# NoteBooks architecture

This is the architecture reference for [NoteBooks-Framework](https://github.com/fsr-official/NoteBooks-Framework). The Framework is a Next.js App Router application that serves GitHub-hosted learning content from a Supabase-managed catalog.

## System boundaries

| Concern | Owner |
| --- | --- |
| Website, reader, API routes, and admin interface | NoteBooks-Framework |
| Accounts and authentication | Supabase Auth and the Framework's account tables |
| Enabled repository catalog and per-file metadata | Supabase |
| Learning material and each repository's `files.json` | GitHub content repositories |
| Generated public indexes and short-lived cache | Redis, accessed through Framework routes |
| Asynchronous repository synchronization | Signed GitHub Actions requests, QStash, and a Framework worker |

Supabase is the live source of truth for enabled repositories, configured branches, stream assignments, and file SHAs. Generated JSON indexes are derived output and can be rebuilt from the catalog. `GITHUB-REPOSITORIES.md` is a bootstrap/reference snapshot; editing it does not change the live catalog.

## Content update path

1. A content repository push runs the shared GitHub Actions workflow. It regenerates and validates `files.json`, including Git blob SHAs, and commits the manifest if it changed.
2. The workflow signs the exact JSON request body and sends `POST /api/webhooks/repository-update` with the repository and branch.
3. The Framework verifies the HMAC signature and queues work. HTTP `202` means queued, not synchronized.
4. The worker checks the repository and configured branch against Supabase, compares file paths and SHAs, and updates the catalog.
5. After a successful database sync, the Framework rebuilds the affected stream index in Redis. A daily reconciliation workflow is the recovery path for missed notifications.

The [update contract](../docs/CONTENT-UPDATE-CONTRACT.md) documents the request, signature, queue, and recovery behavior. Repository content updates do not deploy or restart the website.

## Public library and indexes

The website has five library destinations: lower secondary, science, commerce, humanities, and developers. Class 9 and Class 10 content share the `lowersecondary` group.

The Framework derives six logical indexes from Supabase: `lowersecondary-tree`, `science-tree`, `commerce-tree`, `humanities-tree`, `developer-tree`, and `github_repositories`. Each is published as keyed JSON and JSONL in Redis and served through the public JSON route. The reader and raw/media routes validate repository membership and file paths against the catalog; source material remains in GitHub.

## Accounts and privileged operations

Supabase Auth owns passwords and identity verification. Application tables store account metadata and roles, not passwords. Browser requests do not receive the Supabase service-role key or repository-update secret. Admin APIs authorize requests server-side; repository catalog data is not writable by anonymous clients.

For schema details, see [DATABASE.md](../DATABASE.md). For operational procedures, see [ADMIN-OPERATIONS.md](../ADMIN-OPERATIONS.md).

## Developers destination

`/developers` is a native Framework destination backed by the `developer` stream in Supabase. This repository is a GitHub content source for that stream, not a local filesystem mount. Its generated `files.json` is produced by `fmtree.py` and is synchronized using the same workflow as other configured content repositories.

## Production and research status

Markdown/KaTeX is used by the production reader. Desmos 2D and 3D compiler and reader integrations exist, but the latest audit records live API rendering and expression-analysis behavior as not independently certified; treat both as requiring end-to-end verification. The [renderer test subjects](../test-subjects/README.md) are fixtures, not proof that a live provider/API path was verified. MDX remains a proposal, and a document in [research and development](../research-and-development/README.md) is not evidence that a feature ships in production. See the [Desmos audit](../AUDIT.md) for the recorded limitations.
