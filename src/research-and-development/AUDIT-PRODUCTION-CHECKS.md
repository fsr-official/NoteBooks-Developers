# Live-Production Verification Checklist

**Purpose:** Identify exact read-only checks needed to turn source-confirmed
findings into production-certified findings.

## Read-only snapshot — 2026-11-23T07:41:30Z

This snapshot records observations from connected provider accounts at the
timestamp above (local UTC clock). They are not production-certified for the
deployed Framework app: a Vercel project/deployment could not be linked, and
the connected Supabase, QStash, and Redis resources could not be matched to
that deployment. No credentials, project URLs, tokens, or user data are
included here.

Evidence sources were the GitHub CLI command below; Vercel
`get_git_deployment_context` and `open_deployments`; Supabase `list_migrations`,
advisor checks, and a sample query; and connected QStash/Redis provider
metadata and one-day statistics. These reads were collected for this snapshot,
not as continuous monitoring.

### GitHub Actions

The read-only command
`gh run list -R fsr-official/NoteBooks-Framework` showed the latest listed
scheduled `Repository reconciliation` run as completed/success at
`2026-11-22T11:24:21Z`. Workflow success is not proof that queued workers
completed or that indexes are current; no worker-result correlation was
verified.

### Vercel

`get_git_deployment_context` returned `teams: []`. `open_deployments` for
`fsr-official/NoteBooks-Framework` found no linked Vercel project or preview.
Consequently, the deployed project, environment-variable presence, deployment
commit, route/runtime logs, and live app behavior were not verified.

### Supabase

The connected Supabase project returned 14 migration-history entries, exactly
matching the 14 checked-in migration filenames/versions. This establishes a
match only for that connected project and local source; it does not establish
that the project is bound to the deployed app.

The security advisor reported 30 informational findings for RLS-enabled
tables without policies. In a sample query, `api_keys`, `feature_flags`,
`repository_sync_runs`, and `ai_usage_events` showed `service_role` and
`postgres` grants only, with no policies (RLS therefore denies access to
application roles by default). `repository_entries` had four authenticated
policies using `is_admin()`. The advisor also reported that
`public.is_admin()` is `SECURITY DEFINER` and callable by `authenticated`, and
that leaked-password protection is disabled.

The performance advisor reported 19 unindexed foreign keys, 36 unused-index
informational findings, and one duplicate permissive-policy warning on
`accounts`. Unused-index findings are observations, not instructions to drop
indexes. The health advisor returned no findings. No database changes were
made.

### QStash

Provider metadata showed free QStash accounts in EU and US. One-day statistics
for both regions showed zero message activity and a DLQ count of zero; the EU
latest global maximum-parallelism sample was 10. The application token/region
binding was not compared, so these observations do not establish the health
or activity of the deployed app's QStash queues.

### Redis

The connected Redis database named `NoteBooks-Project` was reported active and
healthy, on the free/global `ap-south-1` configuration, with eviction enabled.
Its one-day statistics showed zero commands, reads, writes, and connections.
Because deployment linkage and credentials were not accessed, this database
cannot be confirmed as the Framework production KV store.

### Scope and limitations

The checks were read-only. No production writes, queue publishes,
credential/configuration changes, or migrations were performed. These are
connected-provider/account observations, not a production certification of the
deployed Vercel app. Deployment linkage, app credentials/region binding, worker
completion, and runtime behavior remain unverified. Sensitive credentials,
URLs, and user data were not included.

## Vercel

- Record latest deployment commit and route env configuration.
- Verify `APP_BASE_URL`, `WEBHOOK_SECRET`,
  `REPOSITORY_RECONCILIATION_SECRET`, `QSTASH_*`, `SUPABASE_*`, `KV_REST_*`,
  `GITHUB_*`, `TRUSTED_MDX_REPOSITORIES`, and `DESMOS_API_KEY` presence without
  exposing values.
- Review function logs for `/api/webhooks/repository-update`,
  `/api/cron/repository-reconciliation`,
  `/api/workflows/repository-update`, `/read`, and `/api/raw`.
- Confirm route cache headers and static/dynamic rendering match intended routes.
- Check memory, duration, and invocation volume for repository worker runs.

## QStash

- Inspect delivery/retry/DLQ logs for all five repository-update shards.
- Record queue backlog, oldest message age, failure count, retry exhaustion,
  replay count, and message-ID correlation.
- Verify current/next signing keys match publisher and worker configuration.
- Compare signed GitHub webhook timestamps with final sync-run timestamps.
- Check whether reconciliation curl retries and QStash retries create duplicate
  deliveries.

## Supabase

- Run migration-history and advisor review.
- Confirm RLS policies and effective grants for public, authenticated, and
  service-role accounts.
- Inspect Postgres logs for RPC locks, sync trigger failures, slow statements,
  RLS denials, and run-table insert/update failures.
- Compare live constraint definitions with migration replay.
- Check row counts/trends for `repository_sync_runs`, `ai_usage_events`,
  `ai_provider_key_metrics`, API metrics, and audit events.
- Check backup/PITR configuration and recovery status.

## Redis

- Confirm public-index TTL/content after a known repository push.
- Verify GitHub commit SHA, repository file SHAs, and Redis index entries agree.
- Check cache hit/miss behavior for `/api/raw`, compiled HTML, and chapter
  bundles.
- Inspect Redis latency, command cost, memory, eviction, and stale-key patterns.

## Browser

### Follow-up observation — `/science` at 390px

**Reported:** 2026-11-23 live browser pass; exact capture timestamp was not
supplied.

The browser pass found document overflow: `documentClientWidth=375` and
`documentScrollWidth=479`. `.main-panel` was 375px wide with `scrollWidth=478`;
its `.workspace-layout` had `scrollWidth=472`. The top navigation is an
independent horizontal scroll container (223px wide, `scrollWidth=664`,
`overflow-x:auto`), distinct from the document-level overflow.

This contradicts the earlier audit's no-document-overflow result. Source
inspection identified `.library-view::before` in
`NoteBooks-Framework/src/app/notebooks.css` (`width: 360px; right: -120px`) as
a likely contributor, not a confirmed root cause; it was not isolated in the
DOM. The issue was not independently checked at 320px. No code change was made.
The unlinked Vercel project also means this browser observation cannot be
certified as behavior of the deployed production app.
See the [responsive/performance audit](AUDIT-UI-PERFORMANCE.md) for the
evidence and limitations.

- Test `/`, `/science`, `/commerce`, `/humanities`, `/developers`,
  `/read`, `/precompiled/[chapterId]`, and representative Markdown/MDX notes.
- Test desktop, tablet, 390px, 320px, and landscape widths.
- Measure document and element horizontal overflow.
- Test keyboard-only navigation and AI drawer focus behavior.
- Test dark/light mode, reduced motion, print mode, chat open/close, PDF,
  table, math, Mermaid, TikZ, Desmos, and Desmos3D.
- Capture Core Web Vitals under mobile throttling and production CDN behavior.

## GitHub Actions

- Inspect latest reconciliation run and signed webhook runs.
- Confirm workflow success is correlated with worker completion, not just
  successful queueing.
- Record failed action, curl response, QStash response, and worker result.
- Verify no secret value is printed in logs.

