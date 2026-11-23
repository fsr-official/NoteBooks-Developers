---
name: notebooks-codebase-context
description: Orient to the NoteBooks repositories, trace current behavior to source and tests, select relevant project skills, and keep architecture or production claims evidence-based.
---

# NoteBooks codebase context

Use this skill when a developer asks where a feature lives, how the NoteBooks system works, what skills or docs to load, or how to investigate a Framework behavior change.

## Start with context

1. Read the root `CLAUDE.md` and `.claude/CONTEXT.md`.
2. Pick the closest note in `.claude/context/` and the public documentation linked there.
3. Determine whether the task belongs to NoteBooks-Developers or NoteBooks-Framework. Do not assume both repositories are checked out.
4. Treat the current source, migration state, tests, and user's latest instructions as authoritative over this static guide.

## Trace the actual code

- Confirm repository and branch before editing.
- Search the current repository for the route, component, service, and direct callers. In Framework work, inspect `src/app/api/`, `src/lib/`, `src/components/`, `supabase/migrations/`, and focused tests as appropriate.
- Follow behavior from UI/request to route, service/data source, and response. For repository sync, trace the signed webhook, QStash enqueue, worker, Supabase sync, and index rebuild; do not confuse HTTP `202` with completed work.
- Read relevant tests to understand expected behavior, then run focused checks after edits.
- In this documentation repository, verify links and regenerate `files.json` with `python3 fmtree.py --out files.json` when indexed public Markdown changes.

## Choose a skill

- For note content or general repository Markdown: `notebooks-content-author`.
- For `desmos` or `desmos3d` blocks: `desmos-dsl-author`.
- For Turnstile flows: `turnstile-spin`.
- To discover an external skill: `find-skills`, then review the exact skill contents and source before recommending or installing.
- For React/Next.js or Supabase-specific implementation advice, optionally discover a focused upstream skill using `npx skills find`. Prefer maintained official sources, review its instructions, and install only when the developer requests it or it directly improves the task. Avoid large/unreviewed bundles.

## Claim discipline

Label statements as implemented, tested, or production-verified only when evidence supports that exact level. Code and unit tests do not establish that production secrets, migrations, queues, provider quotas, deployed versions, or browser integrations work. For a live issue, record timestamp, exact status/error, and the next diagnostic without including secrets.

Never copy environment values, API credentials, private runtime logs, or personal student data into a context file or response.
