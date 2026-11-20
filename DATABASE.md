# Database and repository catalog

This document describes the current data model used by [NoteBooks-Framework](https://github.com/fsr-official/NoteBooks-Framework). The schema and migration files live in that repository's [`supabase/migrations`](https://github.com/fsr-official/NoteBooks-Framework/tree/main/supabase/migrations) directory. This documentation repository does not establish whether migrations have been applied to any particular Supabase environment; verify the target project's migration history before deploying.

## Data ownership

- Supabase Auth owns credentials and authentication.
- `public.accounts` stores application account identity and role metadata.
- `public.repository_entries` stores repository anchors and their tracked files.
- GitHub repositories hold the learning content and each repository's `files.json`.
- Redis contains generated, rebuildable public indexes and short-lived caches.

`GITHUB-REPOSITORIES.md` is a bootstrap/reference snapshot, not the live repository catalog. The Framework's authenticated admin interface manages the live catalog in Supabase. Editing the Markdown file alone does not change production.

## Accounts

Supabase Auth stores credentials in its managed `auth.users` table. The application profile is separate; passwords and password hashes must never be copied into application tables. New accounts default to the `user` role. Administrative access is granted through the server-side admin bootstrap/authorization flow, not by trusting client-provided profile data.

| Column | Type | Purpose |
| --- | --- | --- |
| `account_id` | `text` | Stable, unique application ID selected during account setup. |
| `auth_user_id` | `uuid` | Link to the Supabase Auth user. |
| `created_at` | `timestamptz` | Profile creation time. |
| `github_user_id` | `text`, nullable | Verified provider ID when GitHub is connected. |
| `github_username` | `text`, nullable | Provider username; not an account authorization key. |
| `role` | `text` | Application role, normally `user` or the designated `admin`. |
| `updated_at` | `timestamptz` | Last profile update time. |
| `user_name` | `text` | Editable display name. |

The Framework may maintain private server-side session bindings so a browser session is associated with a verified Auth identity. Client-side display state is not an authorization source.

## Shared repository and file table

`public.repository_entries` uses one row shape for both repository metadata and file metadata:

- A `repository` anchor stores repository identity, owner, name, configured branch, stream, and synchronization state.
- A `file` row stores one repository-relative path, name, and Git blob SHA. Its `repo_id` references the parent repository anchor.

The relevant fields are alphabetically ordered in the schema:

| Column | Type | Purpose |
| --- | --- | --- |
| `account_id` | `text`, nullable | Optional responsible NoteBooks account; set on repository anchors. |
| `archived_at` | `timestamptz`, nullable | Soft-archive time for a repository anchor. |
| `branch` | `text`, nullable | Configured GitHub branch; repository anchors only. |
| `class_or_stream` | `text`, nullable | Group such as `lowersecondary`, `science`, `commerce`, `humanities`, or `developer`. |
| `created_at` | `timestamptz` | Row creation time. |
| `empty` | `boolean`, nullable | Whether a configured repository is intentionally empty. |
| `enabled` | `boolean`, nullable | Whether the repository participates in synchronization. |
| `fallback` | `text`, nullable | Optional manifest fallback configuration. |
| `file_name` | `text`, nullable | File name; file rows only. |
| `file_path` | `text`, nullable | Path relative to the repository root; file rows only. |
| `file_sha` | `text`, nullable | Git blob SHA; file rows only. |
| `id` | `uuid` | Stable row identifier. |
| `last_checked_at` | `timestamptz`, nullable | Most recent successful upstream commit check. |
| `last_commit_sha` | `text`, nullable | Most recently synchronized repository commit. |
| `last_updated_at` | `timestamptz`, nullable | Most recent successful repository synchronization. |
| `lfs` | `boolean`, nullable | Whether the repository uses the media delivery path for LFS. |
| `pages` | `boolean`, nullable | Whether GitHub Pages is enabled as a manifest fallback. |
| `priority` | `integer`, nullable | Repository display/order priority. |
| `record_type` | `text` | Either `repository` or `file`. |
| `registry_name` | `text`, nullable | Human-readable repository label. |
| `repo_id` | `uuid`, nullable | Parent repository anchor ID; file rows only. |
| `repo_name` | `text`, nullable | GitHub repository name; repository anchors only. |
| `repo_owner` | `text`, nullable | GitHub owner or organization; repository anchors only. |
| `root` | `text`, nullable | Optional subdirectory containing the repository manifest. |
| `updated_at` | `timestamptz` | Last row write time. |

Database constraints distinguish the two row shapes, validate supported groups and relative paths, and prevent duplicate repositories and duplicate paths within a repository. File rows link to repository anchors; deleting a repository through the supported workflow removes its child file rows. Archiving retains the anchor and files for possible restoration.

## Synchronization and generated indexes

The shared Actions workflow regenerates `files.json` with Git blob SHAs. A signed notification queues a Framework worker; the worker verifies the repository and configured branch against Supabase, then applies the file changes:

- New paths are inserted.
- Changed paths receive the latest blob SHA.
- Paths absent from the authoritative manifest are removed.
- The repository commit SHA and sync timestamps are advanced only after the data update succeeds.

The Framework derives six logical indexes from the catalog: `lowersecondary-tree`, `science-tree`, `commerce-tree`, `humanities-tree`, `developer-tree`, and `github_repositories`. Each is published in keyed JSON and JSONL formats in Redis and served by the Framework's public JSON route. Class 9 and Class 10 share `lowersecondary-tree`. These generated files are outputs, not the source of truth; rebuild them from Supabase after recovery or cache loss.

See the [architecture reference](architecture/README.md) for the full data flow and the [signed update contract](docs/CONTENT-UPDATE-CONTRACT.md) for the webhook and reconciliation behavior. A `202` response confirms that a job was queued, not that synchronization completed.

## Security boundaries

- Keep the Supabase service-role key, webhook secret, and provider credentials on the server.
- Enable and maintain Row Level Security; public clients must not write repository records.
- Admin routes must authorize the account server-side. Do not trust a browser-supplied role.
- Store provider/API credentials only as hashes or server-side secrets according to their purpose; never store user passwords in application tables.
- Check migration status, backups, and the intended project before applying schema changes. See [maintainer operations](ADMIN-OPERATIONS.md).
