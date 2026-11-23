# QStash repository update operations

This note documents the repository-update queue as implemented in
`NoteBooks-Framework`. It is an operator reference, not a guarantee about live
QStash, Redis, or Supabase health.

## Queue layout

Repository updates use five fixed QStash FIFO queues:
`repo-update-shard-0` through `repo-update-shard-4`. The repository identifier
is mapped to a shard; the application does not create one queue per
repository. Each queue is configured for serial processing, so repositories
sharing a shard also share its queue throughput.

Keep the shard count and names in operational dashboards and quota planning
consistent with `NoteBooks-Framework/src/lib/repository-queue-shards.ts`.
Changing the shard count or queue parallelism is a runtime change, not a
documentation-only adjustment.

## Request and worker flow

1. The repository-update webhook validates the incoming request and enqueues
   work.
2. The worker at `POST /api/workflows/repository-update` verifies the QStash
   signature, re-reads current repository settings and branch head, synchronizes
   the Supabase catalog, then refreshes affected public indexes in Redis.
3. QStash delivery state records delivery attempts and retries; repository sync
   outcomes are recorded separately in `repository_sync_runs`.

The webhook's `202 Accepted` response acknowledges successful queueing. It
does not mean that the worker completed the catalog sync or Redis index rebuild.
The reconciliation route can also return `202` when it queued work; its other
statuses indicate that the request did not simply queue a successful batch.
Check worker/run results and QStash delivery state to determine completion.

## Replay and duplicate work

Queue publishing now supplies an explicit event identity:

- Push publishers send `source: "push"`, GitHub `github.run_id` as
  `runId`, and `github.run_attempt` as `runAttempt`.
- Reconciliation sends `source: "reconciliation"` plus the reconciliation
  workflow run ID and run attempt.
- The queue publisher and reconciliation routes validate the supported
  identity shapes. The installed QStash queue API receives a bounded
  `deduplicationId` generated from a SHA-256 digest.

The digest input is scoped to lowercase repository name, branch, source, run
ID, and run attempt. For push and reconciliation identities, the resulting
key is a fixed `repo-update-` prefix followed by a 64-character hexadecimal
digest. This keeps deduplication identities separate across repositories,
branches, event sources, workflow runs, and retry attempts. It avoids a static
repository-only key that could suppress legitimate later updates.

The worker verifies the QStash signature, parses the JSON body, and validates
the complete repository-update job at the worker boundary before processing:
repository and branch shape, source, run ID and attempt for push/reconciliation
deliveries, and the optional requester format. Invalid identities are rejected
before repository processing begins.

Do not treat every layer of the pipeline as independently idempotent:

- QStash publish deduplication reduces repeated delivery of the same
  publisher identity. It is distinct from worker-side processing and database
  run-history behavior.
- The Supabase catalog update uses repository-level serialization and
  upsert-style synchronization, making that catalog operation replay-safe for
  the same repository snapshot.
- Redis index publication is designed to be rerunnable, but a failed rebuild
  can leave the public index stale until a successful rebuild.
- The implementation inspected for this note does not add a worker-side
  identity ledger or suppress a later repository update solely by commit SHA;
  it validates identity and leaves catalog/rebuild state handling unchanged.

## Operational checks

- Confirm the five configured queue names and inspect delivery retries or
  exhausted failures in QStash.
- Confirm that a repeated publish of the same repository, branch, source, run
  ID, and run attempt uses the same bounded deduplication ID; confirm that a
  later run or attempt produces a different ID.
- When testing queue behavior, keep the existing five-shard layout, serial
  FIFO queue processing, four-worker reconciliation batch limit, and five
  configured QStash retries. Changing those values is a runtime change.
- For a `202`, follow the message to its worker result; do not report the
  repository as synchronized based only on the HTTP response.
- Compare `repository_sync_runs` with the latest worker delivery when
  investigating catalog or index failures.
- Treat stale indexes, orphaned `running` sync records, and repeated deliveries
  as separate failure modes; one status signal does not prove the others are
  healthy.
- Do not perform production queue, database, or credential changes as part of
  these checks.

## Implementation references

The source evidence checked for this note is in:

- `NoteBooks-Framework/src/lib/repository-queue-shards.ts`
- `NoteBooks-Framework/src/lib/qstash.ts`
- `NoteBooks-Framework/src/lib/repository-update-identity.ts`
- `NoteBooks-Framework/src/app/api/webhooks/repository-update/route.ts`
- `NoteBooks-Framework/src/app/api/cron/repository-reconciliation/route.ts`
- `NoteBooks-Framework/src/app/api/workflows/repository-update/route.ts`
- `NoteBooks-Framework/workflow/repository-update.ts`
- `NoteBooks-Framework/test/repository-queue-shards.test.ts`
- `NoteBooks-Framework/test/repository-update-routes.test.ts`
- `NoteBooks-Framework/test/repository-reconciliation-route.test.ts`
- `NoteBooks-Framework/test/repository-update-queue-idempotency.test.ts`
