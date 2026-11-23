# QStash and Supabase Audit

**Date:** 2026-11-22  
**Scope:** Signed repository updates, reconciliation, queue sharding, worker
processing, Supabase migrations, RLS, RPCs, triggers, and focused tests.

## Q-01 — P1 — Queue deliveries lacked idempotency/deduplication

**Status:** Resolved in implementation and focused tests.

**Evidence**

- Push webhook payloads and reconciliation queue jobs carry an identity:
  push supplies source, workflow run ID, and workflow run attempt; reconciliation
  supplies source, reconciliation run ID, and run attempt.
- `repository-update-identity.ts` validates push/reconciliation identity fields
  and the complete queue job.
- `qstash.ts` passes `deduplicationId` to the installed QStash
  `enqueueJSON` queue call. The ID is a fixed-size SHA-256 digest scoped to
  repository, branch, source, run ID, and run attempt.
- The reconciliation route queues each enabled, non-archived repository with
  the shared reconciliation identity.
- The existing retry count remains five and the queue layout/202 semantics
  remain unchanged.

**Impact**

A repeated publisher delivery for the same scoped occurrence can be deduplicated
by QStash instead of adding a separate delivery solely because the event body
is replayed. Distinct repositories, branches, sources, workflow runs, and
attempts receive distinct IDs. The publisher dedupe key is separate from
worker-side processing and database run history.

**Fix**

Implemented:

- deterministic push/reconciliation and bounded admin identity validation;
- repository, branch, source, run ID, and attempt in the SHA-256 dedupe digest;
- validation of the full queue job in `isRepositoryUpdateJob` before enqueue;
- validation of the job again at the signed QStash worker boundary;
- preservation of five queues, queue retries, reconciliation batch limit, and
  existing `202` acknowledgement behavior.

**Confidence:** Source-confirmed and covered by 14 focused Vitest assertions
listed under test coverage.

## Q-02 — P1 — Worker status can report success while Redis is stale or rebuilding failed

**Current status (2026-11-23):** The tested worker path distinguishes catalog
and index outcomes, supports retry after index rebuild failure, and still
rebuilds indexes for unchanged commits. Live service state remains unverified.

**Historical evidence**

- The worker records `updated`/`unchanged` based on Git/Supabase commit state:
  `NoteBooks-Framework/workflow/repository-update.ts:61-130`.
- Redis public-index rebuilding follows the Supabase update:
  `workflow/repository-update.ts:98-123`.
- A later unchanged retry may be recorded as `unchanged` after a previous partial
  failure.

**Impact**

Admin history can hide database-vs-index partial state and make a stale public
index look recovered.

**Fix**

Separate status for repository catalog sync and Redis index rebuild. Record
error stage, commit SHA, rebuilt index names, and a retry-safe reconciliation
result.

**Confidence:** Source-confirmed in the 2026-11-22 audit snapshot; subsequently
updated below.

**Follow-up (2026-11-23):** The tested worker now distinguishes catalog and
index outcomes, including `catalog_sync_failed` and `index_rebuild_failed`.
Index rebuilding still runs when the commit is unchanged, so a retry can repair
a previous index failure. Failed processing remains HTTP 500 for QStash retry.
Four focused files passed (20 tests); focused test ESLint and `git diff --check`
passed. The failure/retry behavior is test-confirmed with mocks, not a live
Redis check. No migration was needed. See [Stage 5](PLAN.md#stage-5-make-workerindex-failures-recoverable).

## Q-03 — P2 — Dashboard reports QStash configuration, not health

**Evidence**

- Admin overview sets `qstash: "configured"` only if environment variables exist:
  `NoteBooks-Framework/src/app/api/admin/overview/route.ts:35-43`.
- Redis is actively pinged; Supabase is actively queried in the snapshot.

**Impact**

Invalid signing keys, publisher tokens, workers, or queue service state remain
hidden until a real webhook fails.

**Fix**

Add signing-publisher verification, worker/DLQ snapshot, queue backlog/age,
and last successful worker timestamp.

**Confidence:** Source-confirmed.

## Q-04 — P2 — AI provider/account usage writes are non-atomic

**Evidence**

- Provider usage metrics and account usage events are written in separate calls:
  `NoteBooks-Framework/src/app/api/ai/chat/route.ts:182-205`.

**Impact**

An answer can be generated and provider usage recorded while account usage
insertion fails, or retry after a partial failure can skew provider history.

**Fix**

Use one transaction/RPC keyed by `request_id`, or implement an outbox and
idempotent replay.

**Confidence:** Source-confirmed.

## Q-05 — P2 — Webhook secret strength is not enforced

**Evidence**

- The repository webhook accepts a configured `WEBHOOK_SECRET` with no minimum
  entropy/length:
  `NoteBooks-Framework/src/app/api/webhooks/repository-update/route.ts:24-28`.
- Reconciliation enforces at least 32 bytes:
  `src/app/api/cron/repository-reconciliation/route.ts:15-25`.

**Impact**

Weak secrets permit forged HMAC requests and queue-flooding attempts.

**Fix**

Reject startup/configuration unless both secrets meet a documented 32-byte
minimum and document separate secret purposes.

**Confidence:** High.

## Q-06 — P3 — Operational documentation disagrees with the shard implementation

**Evidence**

- Code and tests use five queue shards:
  `NoteBooks-Framework/src/lib/repository-queue-shards.ts:3-10`,
  `test/repository-queue-shards.test.ts:5-8`.
- The Framework-local `qstash/README.md` describes four fixed queues, while the
  implementation uses five. The Developer-side operator reference now records
  the source-confirmed five-shard behavior:
  [QStash operations](QSTASH-OPERATIONS.md).

**Impact**

Operators can choose the wrong queue/model for quota or recovery work.

**Fix**

Keep the Developer-side operator reference and dashboards aligned with the
five-shard implementation. The Framework-local README remains unchanged at
the user's direction and is still a known stale document.

**Confidence:** High.

## S-01 — P1 — Supabase migration replay and live drift are unverified

**Evidence**

- `repository_entries_record_shape` is dropped and re-added across migrations:
  `20261113220000_repository_registry_import.sql`,
  `20261114120000_merge_class_libraries.sql`.
- Later migrations add feature flags, AI usage, provider metrics, and sync-run
  tables.

**Impact**

A clean replay may differ from the live database if a migration was edited,
skipped, or applied out of order. Constraint or index drift may affect sync
and authorization behavior.

**Fix**

Replay migrations against an empty development database, apply any migration
drift fix in a new migration, and compare live migration history/schema.

**Confidence:** Source-confirmed; live verification blocked.

## S-02 — P2 — Repository sync and run updates need stronger partial-failure semantics

**Current status (2026-11-23):** Catalog/index partial-failure handling is
improved and tested; orphaned `running` record cleanup/recovery remains open.
Production behavior remains unverified.

**Historical evidence**

- Sync-run recording and worker final status are in
  `NoteBooks-Framework/workflow/repository-update.ts:134-172`.
- The sync run is inserted at worker start and finalized from a single processor
  result.

**Impact**

Partial database/Redis failure cannot be represented accurately, and orphaned
`running` records can remain after process termination.

**Fix**

Add a timeout/stale-run sweeper or finalization guard, stage status fields,
and explicit error stage.

**Confidence:** Source-confirmed in the 2026-11-22 audit snapshot; subsequently
updated below.

**Follow-up (2026-11-23):** The tested worker path distinguishes catalog and
index failure outcomes without a schema migration. Orphaned `running` sync-run
cleanup/recovery was deliberately not implemented and remains open. The
focused Stage 5 suite passed 20 tests across four files. No real Redis,
Supabase, or QStash operation was verified. See
[Stage 5](PLAN.md#stage-5-make-workerindex-failures-recoverable).

## S-03 — P2 — Security-definer and service-role exposure needs live RLS/advisor confirmation

**Evidence**

- RLS is enabled and public/anonymous roles are revoked for admin/AI tables.
- Repository sync RPC is service-role-only:
  `20261114120000_merge_class_libraries.sql`.
- Feature flags are service-role-only:
  `20261120210000_mdx_rendering_flag.sql`.

**Impact**

Source structure appears least-privileged, but live grants, policies, migration
order, and advisor findings cannot be certified without dashboard/log access.

**Fix**

Run read-only Supabase advisor, migration, policy, and Postgres log checks.

**Confidence:** Source structure confirmed; live state unknown.

## Test coverage

The framework’s full Vitest run passed 60 test files / 236 tests, with 2 skipped.
Covered areas include webhook validation, reconciliation, queue shard mapping,
AI chat/usage, Supabase admin client construction, and API routes.

Stage 4 focused coverage passed three test files / 14 tests:

- `test/repository-update-routes.test.ts`
- `test/repository-reconciliation-route.test.ts`
- `test/repository-update-queue-idempotency.test.ts`

This coverage verifies route and identity handling and confirms that the same
repository/branch/source/run/attempt produces the same bounded deduplication
ID while differing repository, branch, source, run, or attempt values receive
distinct IDs. The local test command and `git diff --check` passed. These
tests are code evidence, not live QStash or production verification.

Stage 5 focused coverage passed four files / 20 tests:

- `test/repository-update-workflow.test.ts`
- `test/repository-update-routes.test.ts`
- `test/repository-update-queue-idempotency.test.ts`
- `test/public-indexes.test.ts`

The tests cover distinct catalog/index failure codes, retryable worker failure
followed by success, and index rebuilding for an unchanged commit. Focused test
ESLint and `git diff --check` passed. These tests do not connect to real Redis,
Supabase, or QStash services.

Not covered:

- Real QStash signature verification against deployed signing keys.
- RPC integration or clean migration replay.
- Live Redis rebuild and index freshness.
- Split-write AI usage failures.
- Cleanup/recovery of orphaned `running` sync-run records.
- Live DLQ/retry/backlog state.

