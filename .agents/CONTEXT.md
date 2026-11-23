# NoteBooks AI context index

This folder contains durable, repository-specific context for Claude Code and other coding agents. It is not a substitute for checking current source code, migrations, tests, deployment state, or the user's latest instructions.

## Context notes

- [Project purpose and current state](context/PROJECT-OVERVIEW.md) — product use case, services, system boundaries, and a dated open-issue snapshot.
- [Source-of-truth map](context/SYSTEM-MAP.md) — where to find canonical documentation and implementation in this repository and NoteBooks-Framework.
- [Content and policy guide](context/CONTENT-AND-POLICY.md) — writing expectations, repository content rights, privacy boundaries, and license scope.

## Public developer documentation

- [Architecture](../architecture/ARCHITECTURE.md)
- [Database and repository catalog](../architecture/DATABASE.md)
- [AI chat implementation](../architecture/AI-PROJECT.md)
- [Admin operations](../architecture/ADMIN-OPERATIONS.md)
- [Signed content update contract](../architecture/CONTENT-UPDATE-CONTRACT.md)
- [Content API overview](../api/API.md) and [v1 reference](../api/APIv1.md)
- [Repository reference snapshot](../docs/GITHUB-REPOSITORIES.md) and [project roadmap](../docs/PLAN.md)
- [Desmos DSL references, audit, and fixtures](../desmos-dsl/README.md)
- [Research and development](../research-and-development/README.md)
- [Policies](../policies/README.md) and [GPL-3.0-only license](../LICENSE.md)

## Skills

Skills are available to Claude Code when installed under `.claude/skills/<skill-name>/SKILL.md`.

- `notebooks-codebase-context` — orient to the actual code and choose the right technical sources.
- `notebooks-content-author` — write NoteBooks learning content and documentation responsibly.
- `desmos-dsl-author` — author only well-supported Desmos DSL syntax.
- `find-skills` — discover and review skills from the skills.sh ecosystem.
- `turnstile-spin` — project-specific Turnstile setup and verification.

Load a skill by its name in Claude Code (for example, ask to use `desmos-dsl-author`). Skill files provide instructions; they do not prove the live service is configured or a renderer feature is production-verified.

The `find-skills` skill was installed from `vercel-labs/skills` using the Skills CLI. `skills-lock.json` pins the source commit. Its upstream MIT license is reproduced in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## Current issue snapshot

**Last checked: 2026-11-20.** The Developer docs were published in the updated structure, but the verified content notification workflow returned `503 {"error":"Repository update could not be queued"}` after the signed webhook request. That points to QStash enqueueing or deployed runtime configuration, not the webhook signature. The public Developer index was still stale at the last check. Canonical webhook URL secrets and the local Framework `APP_BASE_URL` had been aligned; do not assume production queue health is fixed without checking the latest workflow and deployed logs.

Always recheck this issue against recent GitHub Actions runs, the public index, and sanitized Vercel/QStash logs before reporting it as current or resolved. Never copy secrets or private logs into context files.
