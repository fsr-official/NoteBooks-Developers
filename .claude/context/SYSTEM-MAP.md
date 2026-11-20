# Source-of-truth and codebase map

Use this page to find the canonical source before editing. The NoteBooks-Framework checkout may not be present beside this repository; if it is absent, use its GitHub repository and do not invent local paths.

## Documentation in this repository

| Question | Start here |
| --- | --- |
| What does the deployed system do? | [`architecture/ARCHITECTURE.md`](../../architecture/ARCHITECTURE.md) |
| How are accounts, repository anchors, files, and indexes modeled? | [`architecture/DATABASE.md`](../../architecture/DATABASE.md), then Framework migrations |
| How are signed repository updates sent and queued? | [`architecture/CONTENT-UPDATE-CONTRACT.md`](../../architecture/CONTENT-UPDATE-CONTRACT.md) |
| What does AI chat currently implement? | [`architecture/AI-PROJECT.md`](../../architecture/AI-PROJECT.md), then Framework `src/lib/ai-tiers.ts` and `src/lib/groq-chat.ts` |
| How should an operator recover a failed production service? | [`architecture/ADMIN-OPERATIONS.md`](../../architecture/ADMIN-OPERATIONS.md); verify live provider state separately |
| What are the public API endpoints? | [`api/API.md`](../../api/API.md) and [`api/APIv1.md`](../../api/APIv1.md) |
| What is the current plan? | [`docs/PLAN.md`](../../docs/PLAN.md) |
| How should a Desmos example be written? | [`desmos-dsl/README.md`](../../desmos-dsl/README.md), language reference, audit, and fixtures |
| What policy/license applies? | [`policies/README.md`](../../policies/README.md), [`policies/LICENSE-STATUS.md`](../../policies/LICENSE-STATUS.md), and [`LICENSE.md`](../../LICENSE.md) |

## Framework implementation map

In the `fsr-official/NoteBooks-Framework` repository:

- Next.js route handlers are under `src/app/api/`.
- Reader and Markdown integration is in `src/components/next-markdown-reader.tsx` and `src/lib/markdown/`.
- Desmos compilers are `src/lib/desmos-2d.ts` and `src/lib/desmos-3d.ts`; focused tests are `test/desmos-2d.test.ts` and `test/desmos-3d.test.ts`.
- AI tier definitions and key slots are `src/lib/ai-tiers.ts` and `src/lib/ai-provider-keys.ts`; the provider adapter is `src/lib/groq-chat.ts`; endpoint is `src/app/api/ai/chat/route.ts`.
- Signed repository webhook is `src/app/api/webhooks/repository-update/route.ts`; queue client and worker details are in `src/lib/qstash.ts` and `src/app/api/workflows/repository-update/route.ts`.
- API-key management and file delivery are under `src/app/api/v1/`; focused route tests are under `test/`.
- Database migrations are in `supabase/migrations/`; scripts, tests, and package commands are authoritative for validation.

Paths and names can change. Confirm with the current tree and search before relying on this map.

## Investigation workflow

1. Establish which repository and branch contain the requested behavior.
2. Read the corresponding public architecture/context note, then inspect current implementation and focused tests.
3. Search for direct call sites, route aliases, migrations, and existing patterns before editing.
4. Distinguish implemented code from production verification. A code test does not prove a deployed secret, migration, provider quota, webhook, or browser rendering path is healthy.
5. Prefer the narrowest relevant test, then typecheck/build/lint as the code change requires.
6. For operational problems, report the exact HTTP response and sanitized provider error. Never print tokens, environment values, student content, or request credentials.

## Skill selection

- Load `notebooks-codebase-context` for repository orientation and tracing behavior.
- Load `notebooks-content-author` for learning-note writing and content changes.
- Load `desmos-dsl-author` before editing a Desmos fenced block or its authoring guide.
- Load `turnstile-spin` for Cloudflare Turnstile work; it contains local auth/verification constraints.
- Load `find-skills` only when seeking another reusable skill. Search results are not proof of quality: inspect source, provenance, scope, and permissions before installing or following it.
- Consider vetted framework skills from Vercel/Supabase for focused tasks only after reviewing their exact contents. Do not install broad skill bundles automatically.
