# NoteBooks Framework roadmap

This roadmap separates capabilities implemented in the codebase from work that still needs implementation or production verification. A feature marked implemented is not proof that its production migration, credentials, or third-party configuration are active.

## Current platform

NoteBooks-Framework is a Next.js study library with Supabase-managed accounts and repository catalog, GitHub-hosted learning content, Redis-backed public indexes, and QStash-queued repository synchronization. The GitHub content filesystem and raw/media delivery paths remain in use. The [architecture reference](../architecture/ARCHITECTURE.md) documents the current boundaries.

Implemented capabilities include:

- Five library destinations: lower secondary, science, commerce, humanities, and developers.
- A shared Supabase repository/file catalog, with generated indexes derived from database state.
- Signed repository update notifications and scheduled reconciliation workflows.
- Account and admin interfaces, repository management, and AI provider key controls.
- A Markdown/KaTeX reader, Desmos 2D and 3D compiler/reader integrations (runtime verification pending), and AI chat with server-enforced effort tiers.
- API-key management and catalog-validated file downloads.
- A native Developers destination backed by this repository's content.

The last recorded Framework validation passed 182 tests, type checking, a production build, and focused ESLint. This was a local code validation, not a production migration, secrets, or provider-quota check. Re-run the Framework's current checks after code changes.

## Priorities

### Production readiness

- Verify pending Supabase migrations against the intended project before deploying.
- Verify GitHub Actions secrets and successful runs for every enabled content repository.
- Confirm QStash delivery, scheduled reconciliation, and completed worker syncs; a webhook `202` only means the job was queued.
- Verify managed database backups and rehearse a restore into a non-production project.
- Rebuild and verify all generated indexes after a restore or cache loss.

### Accounts, policies, and data lifecycle

- Exercise signup, OAuth, account setup, role assignment, session expiry, and authorization end to end.
- Review account deletion and data export behavior.
- Keep public usage, privacy, and AI policies aligned with actual site behavior.
- Keep passwords in Supabase Auth and keep privileged credentials server-side.

### AI operations

- Observe real provider availability, token usage, rate limits, and cost before setting additional quotas.
- Decide whether to add tier-specific daily quotas; they are not currently implemented.
- Keep the chat isolated behind rate limits and do not assume multiple keys create independent provider capacity.
- See [AI implementation](../architecture/AI-PROJECT.md) and the [AI Usage Policy](https://notebooks-framework.vercel.app/ai-usage-policy).

### Renderer verification and research

- Maintain reader fixtures for Markdown/KaTeX and Desmos 2D/3D in [desmos-dsl](../desmos-dsl/README.md); keep Desmos runtime status marked verification-pending until live browser checks pass.
- Add representative TikZ fixtures before claiming TikZ parity.
- Keep MDX experimental until a trusted-content-only design, component allowlist, fallback behavior, and regression suite are proven.
- Compare experimental parser results against unchanged real notes; do not treat a proposal as a shipped feature.

See [research and development](../research-and-development/README.md).

### API and CLI

- Keep the existing account-owned API-key and file-download contract documented and tested.
- A CLI login/browse client and bulk Markdown/PDF delivery remain future work.
- Add broader rate-limit and abuse tests before expanding API access.

See the [Content API guide](../api/API.md).

## Out of scope for now

Issues and Community repositories are not included in the current repository synchronization catalog or public indexes. Revisit this only after a separate storage, access, and moderation design.

## Progress terminology

- **Implemented** — code exists in the Framework or documentation repository.
- **Production verification required** — live provider, database, deployment, or GitHub Actions state still needs checking.
- **Planned** — not implemented; do not describe it as an available feature.
