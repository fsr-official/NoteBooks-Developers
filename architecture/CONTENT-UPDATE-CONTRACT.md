# Runtime repository and content updates

The NoteBooks-Framework Supabase catalog is the source of truth for enabled repositories, branches, and file metadata. The `GITHUB-REPOSITORIES.md` in this repository is a reference/import artifact; changing it does not change the live catalog. Repository content updates are processed at runtime and do not require an app deployment.

## Signed update request

Send `POST /api/webhooks/repository-update` with a JSON body:

```json
{
  "repository": "fsr-science/NCERT-Science",
  "branch": "main"
}
```

Sign the exact UTF-8 request body with HMAC-SHA256 using the shared `NOTEBOOKS_UPDATE_SECRET`. Send the signature as `X-NoteBooks-Signature: sha256=<hex-digest>` and the JSON content type. The app rejects unsigned, malformed, unsupported, or unregistered updates. Do not send file contents or credentials in the request.

The workflow call is authenticated by the shared secret; the server resolves the submitted repository and branch against the enabled Supabase catalog and checks the configured branch head before processing. Enabled repositories in the `science`, `commerce`, `humanities`, and `developer` streams can send updates on their configured branch. Repositories should include Git blob SHAs in `files.json`; these identify changed files.

The endpoint queues the update through the existing repository worker. The reusable workflow requires HTTP `202` and a JSON response confirming `status: "queued"`; redirects and unexpected responses fail the job. A successful HTTP `202` means queued, not completed. The worker syncs the repository rows in Supabase and regenerates the affected public index. Failed verification or enqueueing must fail the workflow so it can be retried.

## Content repository workflow setup

Each enabled content repository should invoke the reusable workflow on pushes to its configured branch. NoteBooks-Developers uses the same reusable workflow from its own repository. The workflow regenerates and validates `files.json` (including each file's Git blob SHA), commits it only when needed, then posts the repository and branch:

```yaml
name: Notify NoteBooks of content updates

on:
  push:
    branches: [main]

permissions:
  contents: write

jobs:
  notify:
    uses: fsr-official/NoteBooks-Developers/.github/workflows/reusable-content-update.yml@main
    secrets:
      NOTEBOOKS_UPDATE_URL: ${{ secrets.NOTEBOOKS_UPDATE_URL }}
      NOTEBOOKS_UPDATE_SECRET: ${{ secrets.NOTEBOOKS_UPDATE_SECRET }}
```

The Developers repository calls the same reusable workflow from its own `main` branch. Content repositories should reference the reusable workflow hosted here so workflow fixes have one shared source.

Add repository Actions secrets:

- `NOTEBOOKS_UPDATE_URL`: the app endpoint URL, ending in `/api/webhooks/repository-update`
- `NOTEBOOKS_UPDATE_SECRET`: the shared HMAC secret configured on the app

Set `NOTEBOOKS_UPDATE_URL` to the canonical HTTPS endpoint `https://notebooks-framework.vercel.app/api/webhooks/repository-update`. Do not use redirecting domain aliases: the reusable workflow requires a direct HTTP `202` response and intentionally rejects redirects. The reusable workflow needs `contents: write` permission so it can commit a changed manifest. The app checks the configured branch head when processing the queued update.

## Client behavior

Public JSON indexes are regenerated from Supabase after a successful sync. The website may continue to use a cached tree until its cache expires or it reloads the published index; the webhook itself does not reload visitor browsers or restart the app.
