# Audit Remediation Plan

**Status:** Stage 1 and Stage 2 implementation completed; later stages remain proposed.
**Priority order:** Quick wins first, followed by higher-risk contract and queue
work.  
**Related evidence:** [Audit overview](AUDIT-OVERVIEW.md), [rendering audit](AUDIT-RENDERING.md),
[UI/performance audit](AUDIT-UI-PERFORMANCE.md), [QStash/Supabase audit](AUDIT-QSTASH-SUPABASE.md),
and [production checks](AUDIT-PRODUCTION-CHECKS.md).

This plan is separate from the product roadmap in [`../docs/PLAN.md`](../docs/PLAN.md).
It prioritizes low-risk work that can be validated locally, followed by
cross-repository correctness and reliability fixes. Audit severity and
implementation effort are different: a quick documentation fix is not a
substitute for resolving a P1 schema or queue issue.

## Plan at a glance

| Order | Work | Risk / alarm | Repositories | Why this order |
|---|---|---|---|---|
| 1 | Document QStash operations accurately | Low effort; P3 | Developers | Gives operators a source-backed reference without changing runtime behavior. |
| 2 | Fix mobile ordering and reduced-motion behavior | Moderate; P2 | Framework | User-visible and accessibility improvements with focused UI checks. |
| 3 | Align chapter-bundle producer and consumer contracts | High; P1 | Developers + Framework | Prevents generated bundles from being rejected or falling back. |
| 4 | Design and implement safe queue idempotency | High; P1 | Framework | Reduces duplicate work without suppressing legitimate future updates. |
| 5 | Make worker/index partial failures observable and recoverable | Moderate-high; P1/P2 | Framework | Distinguishes catalog success from derived-index availability. |
| 6 | Perform production-only verification | Operationally important | Vercel, QStash, Redis, Supabase, GitHub Actions | Confirms live state without making production changes. |

## Stage 1 — Correct QStash documentation

**Audit references:** Q-06, Q-01, Q-02  
**Files:** `NoteBooks-Developers/src/research-and-development/QSTASH-OPERATIONS.md`,
`README.md`, and this plan.

### Changes

- Replace the documented four-shard names/count with the five shards defined by
  `src/lib/repository-queue-shards.ts`.
- Correct statements that the entire synchronization and index rebuild pipeline
  is idempotent. Describe the catalog RPC's idempotent behavior separately from
  queue deliveries, sync-run records, and Redis index rebuilding.
- State clearly that the webhook/reconciliation `202` acknowledges queueing,
  not successful worker completion.
- Document that worker failures and retries should be checked in sync-run and
  QStash delivery state.

### Verification

- Compare the documentation with `repository-queue-shards.ts`,
  `qstash.ts`, the webhook and reconciliation routes, the worker, and
  `test/repository-queue-shards.test.ts`.
- Run the focused queue-shard test and `git diff --check`.
- Do not change queue count, queue parallelism, or retry behavior in this stage.

**Status:** Developer-side documentation completed. Source verification
confirms five fixed shards
(`repo-update-shard-0` through `repo-update-shard-4`) and the queue-shard
Vitest test. The documentation now distinguishes replay-safe catalog/index
operations from the missing queue-delivery deduplication key, and describes
webhook/reconciliation `202` responses as queue acknowledgements rather than
worker completion. No queue behavior or endpoint contract was changed. The
Framework-local `qstash/README.md` was intentionally left unchanged per the
user's documentation-location instruction; it still contains the four-shard
description and remains a known inconsistency, not a claim of completed
Framework documentation cleanup.

## Stage 2 — Fix mobile ordering and reduced-motion behavior

**Audit references:** U-01, P-03  
**Files:** `NoteBooks-Framework/src/app/notebooks.css`,
`src/app/reader-redesign.css`, and possibly
`src/components/notebook-workspace.tsx` if CSS-only ordering cannot preserve
semantic reading order.

### Changes

- Make stream/library content appear before the expanded theme controls on
  narrow screens, without changing desktop layout or keyboard/DOM order
  unnecessarily.
- Disable remaining chat typing/caret/dot animations when
  `prefers-reduced-motion: reduce` is active, while keeping readable static
  status feedback.

### Verification

- Test `/science` and another stream route at 390px and 320px widths, plus a
  desktop width. Confirm library title, search, and file browser appear before
  theme controls on mobile, with no document-level horizontal overflow.
- Test the reader's animated chat state under normal and reduced-motion media
  settings.
- Run focused tests, typecheck, and lint for the Framework changes.
- Preserve and integrate existing uncommitted changes in these styles and
  workspace component; do not overwrite or revert them.

**Status:** Completed at the source/CSS and Vitest levels. The mobile CSS places
main stream/library content before the side rail at narrow widths while
preserving desktop grid/DOM behavior. The reduced-motion CSS disables the
reader caret, typing-avatar, and typing-dot animations and retains readable
pending status. Independent verification covered the two focused Stage 2 test
files: all 8 Vitest assertions passed. Framework typecheck, lint, and
`git diff --check` also passed. The 320px/390px and desktop evidence
is from CSS and source assertions in Vitest, not browser-rendered Playwright;
no Playwright setup exists in this repository. No NCERT Markdown/PDF content
or public endpoint contract changed.

## Stage 3 — Align the chapter-bundle contract

**Audit reference:** R-05  
**Repositories/files:** `NoteBooks-Developers/src/research-and-development/schema/chapter.ts`,
`NoteBooks-Developers/utils/build.ts`, `NoteBooks-Developers/utils/build-html.ts`,
and `NoteBooks-Framework/src/lib/chapter-bundle/schema.ts` plus focused tests.

### Changes

- Agree on the allowed overview heading ID (`chapter-overview`) and the exact
  `facts.visuals` shape.
- Update producer types/build behavior and consumer validators together.
- Decide whether visual facts are part of the chapter bundle contract and
  confirm the Framework reader either renders them or intentionally ignores
  them with a compatible schema.
- Add a populated Developers-generated bundle fixture and pass it through the
  Framework parser. Include an overview heading and at least one visual fact.
- Keep the bundle schema version explicit. If the deployed format needs a
  breaking change, version it and define fallback behavior rather than
  silently widening validation.

### Verification

- Run Developer build/schema tests and Framework chapter-bundle validation and
  reader tests.
- Run both repositories' typechecks.
- Confirm generated bundle metadata and source SHAs still validate, and that
  malformed or unsupported bundles continue to fail closed.
- Treat the pre-release Developers build pipeline as sensitive: keep the
  change narrowly scoped and do not publish artifacts as part of this work.

**Status:** Completed in source and focused tests. Developers now emits the
version 3 bundle contract, including the exact `chapter-overview` outline ID
and required `facts[].visuals`; the Framework validator accepts only compiled
Diagram/Desmos visual nodes and its reader guards outline IDs. Source
SHA/manifest consistency checks remain in place, while unsupported or
malformed version 2 bundles fail closed. Developers verification passed:
`pnpm exec vitest run test/build.test.ts test/build-html.test.ts test/audit-build.test.ts`
(18 tests) and `pnpm typecheck`. Framework verification passed:
`pnpm exec vitest run test/chapter-bundle.test.ts test/chapter-reader.test.ts test/chapter-reader-outline.test.ts`
(13 tests) and `pnpm typecheck`. These are source/test results, not evidence
of a production deployment or real-browser rendering. See the
[chapter-bundle contract](CHAPTER-BUNDLE-CONTRACT.md) and resolved
[R-05 rendering finding](AUDIT-RENDERING.md#r-05-p1-developer-and-framework-chapter-bundle-schemas-disagree).

## Stage 4 — Design and implement safe queue idempotency

**Audit references:** Q-01, Q-02  
**Files to inspect/change as needed:** `NoteBooks-Framework/src/lib/qstash.ts`,
`src/lib/repository-update-queue.ts`,
`src/app/api/webhooks/repository-update/route.ts`,
`src/app/api/cron/repository-reconciliation/route.ts`,
`workflow/repository-update.ts`, and focused tests.

**Status:** Implementation completed and documented in
[`QSTASH-OPERATIONS.md`](QSTASH-OPERATIONS.md); Q-01 in
[`AUDIT-QSTASH-SUPABASE.md`](AUDIT-QSTASH-SUPABASE.md) records the resolved
implementation. Production verification is not done.

### Design gate

Before adding an idempotency key:

- Identify whether the incoming GitHub workflow provides a stable delivery/event
  ID and whether reconciliation has a run ID or scheduled occurrence ID.
- Confirm how QStash `enqueueJSON` supports the deduplication option in the
  installed SDK and FIFO queue mode.
- Scope the key to one event, commit, or reconciliation occurrence. Never use a
  static repository/branch key: QStash deduplication may suppress that key for
  90 days, blocking legitimate future messages.
- Define how two distinct commits, repeated deliveries of one event, and later
  daily reconciliation are treated.
- Keep QStash publish deduplication distinct from worker-side idempotency and
  database catalog locking.

### Implementation after design approval

- Add deterministic event/run identity to the enqueue contract and validate it
  at the worker boundary.
- Prevent duplicate work only where identity proves the messages represent the
  same update. Do not silently drop valid later repository updates.
- Preserve bounded concurrency and current queue sharding unless measurements
  and a concurrency review justify changing them.

### Verification

- Test duplicate delivery of the same event, a later event for the same
  repository, different repositories in the same shard, and reconciliation
  after a webhook.
- Verify the original queue acknowledgement response still means “queued”.
- Test QStash retry and failure paths without production credentials.

**Completed verification**

- The Framework implementation supplies push and reconciliation workflow
  run ID plus attempt, validates the queue job at publisher and worker
  boundaries, and publishes a bounded SHA-256 `deduplicationId` scoped to
  repository, branch, source, run ID, and attempt.
- The existing five queue shards, reconciliation batch limit, five QStash
  retries, and queue acknowledgement semantics remain unchanged.
- Tester passed:
  `pnpm exec vitest run test/repository-update-routes.test.ts test/repository-reconciliation-route.test.ts test/repository-update-queue-idempotency.test.ts`
  (3 files, 14 tests).
- `git diff --check` passed.
- Production QStash delivery, deployed signing keys, live retries, DLQ,
  backlog, and Supabase/Redis state were not verified.

## Stage 5 — Make worker/index failures recoverable

**Audit references:** Q-02, S-02  
**Files:** `NoteBooks-Framework/workflow/repository-update.ts`,
`src/lib/public-indexes.ts`, sync-run schema/migrations only if required, and
focused worker tests.

### Changes

- Add focused tests for catalog sync success followed by Redis rebuild failure,
  and for a retry that later rebuilds the indexes.
- Distinguish repository catalog outcome from public-index outcome in logs and
  sync-run data, so a failed rebuild cannot be mistaken for a fully healthy
  public state.
- Preserve a repair path when Redis is empty or indexes are stale even if the
  repository commit SHA has not changed. Do not skip index rebuilding solely
  because the source commit is unchanged.
- Decide whether orphaned `running` sync-run records need a bounded cleanup or
  stale-run recovery after observing realistic worker termination behavior.
- Avoid a database migration unless tests/source inspection demonstrate the
  current schema cannot represent the required outcome.

### Verification

- Exercise failure before catalog sync, after catalog sync, during index
  rebuild, and after successful retry.
- Confirm the public index can be rebuilt after Redis loss without requiring a
  new source commit.
- If a migration is needed, replay it in a disposable local/test database and
  review it before any production deployment.

**Status:** Completed for tested worker behavior; orphaned-run recovery remains
deferred. `workflow/repository-update.ts` distinguishes catalog and index
outcomes with `catalog_sync_failed` and `index_rebuild_failed`. It rebuilds
indexes even when the source commit is unchanged, so a retry can repair an
index failure without a new commit. A failed worker response remains HTTP 500
for QStash retry, and the focused retry test verifies a later successful
rebuild. No migration was needed. Verification passed:
`pnpm exec vitest run test/repository-update-workflow.test.ts test/repository-update-routes.test.ts test/repository-update-queue-idempotency.test.ts test/public-indexes.test.ts --reporter=verbose`
(4 files, 20 tests); focused test ESLint and `git diff --check` also passed.
Cleanup or recovery of orphaned `running` sync-run records was deliberately
not implemented. These results do not verify real Redis, Supabase, or QStash
operations; see [Q-02](AUDIT-QSTASH-SUPABASE.md#q-02-p1-worker-status-can-report-success-while-redis-is-stale-or-rebuilding-failed)
and [S-02](AUDIT-QSTASH-SUPABASE.md#s-02-p2-repository-sync-and-run-updates-need-stronger-partial-failure-semantics).

## Stage 6 — Verify production state read-only

**Checklist:** [AUDIT-PRODUCTION-CHECKS.md](AUDIT-PRODUCTION-CHECKS.md).

**Status:** A limited read-only connected-provider snapshot was recorded at
`2026-11-23T07:41:30Z` in the checklist. The connected Supabase migration
history matched the checked-in migrations, and provider/account-level
observations were captured for GitHub Actions, Vercel, QStash, Supabase, and
Redis. This does not certify the deployed Framework app: no Vercel project or
deployment was linked, and Supabase/QStash/Redis resources could not be bound
to that deployment. Workflow success did not verify worker completion.
Production status remains unverified beyond the scoped observations in the
[snapshot](AUDIT-PRODUCTION-CHECKS.md#read-only-snapshot-2026-11-23t074130z).
No production writes, queue publishes, credential/configuration changes, or
migrations were performed.

**Browser follow-up (reported 2026-11-23):** A later `/science` pass at the
nominal 390px width found document overflow
(`documentClientWidth=375`, `documentScrollWidth=479`). This supersedes the
earlier no-document-overflow observation. The top navigation's horizontal
scrolling is independent; `.library-view::before` is a likely but unconfirmed
source candidate. The issue was not checked at 320px, and no code was changed.
See the [responsive/performance audit](AUDIT-UI-PERFORMANCE.md).

- Check current Vercel deployment and sanitized route logs.
- Inspect QStash delivery, retry, DLQ, backlog, and signing-key health for all
  five shards.
- Compare latest GitHub Actions reconciliation run with completed worker runs
  and public-index freshness.
- Inspect Supabase migration history, live schema/advisors, RLS/grants, worker
  errors, and sync-run trends.
- Inspect Redis index freshness, hit/miss trends, errors, memory, and eviction
  data.
- Record timestamp, route/service, exact status/error, and next diagnostic
  without copying secrets, tokens, private logs, or personal/student data.

No production SQL writes, migrations, queue publishing, credential rotation,
or deployment changes are included in this stage.

## Deferred until evidence or an explicit follow-up

- Runtime MDX trust-gate consolidation (R-02): first decide whether Supabase
  repository settings or `TRUSTED_MDX_REPOSITORIES` is authoritative. Do not
  weaken the current trusted-content boundary by implicitly broadening execution.
- Broad Markdown/MDX/HTML reader unification (R-01): too wide for a quick fix;
  first land bundle contract tests and measure the actual path-selection impact.
- Cache publication redesign (R-03): first reproduce partial-write behavior and
  quantify stale/unavailable responses; then design atomic/versioned publication.
- Bundle optimization (P-01): capture and compare a Next.js analyzer baseline
  for the same routes/output class before accepting a code split.
- Image optimization (P-02): inspect real media sizes and delivery headers
  before changing image behavior.
- AI usage atomicity (Q-04): design an idempotent transactional boundary and
  test the existing partial-failure path before adding a database function.
- Supabase schema/RLS changes: source and live schema must be compared; do not
  infer production drift from migrations alone.

## Completion criteria

- Quick wins have focused regression checks and preserve unrelated dirty work.
- Framework and Developers bundle producers/consumers agree on one tested
  versioned contract.
- Queue retries do not duplicate work for the same event or suppress valid
  future updates.
- Worker/index partial failures are visible and recoverable.
- Production claims are labeled as verified only after the corresponding
  read-only provider evidence is collected.
