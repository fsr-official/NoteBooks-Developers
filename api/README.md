# NoteBooks Content API

The v1 API lets registered accounts manage API keys and download Markdown files from enabled repositories.

Base URL: `https://notebooks-frameworks.vercel.app/api/v1`

## API-key management

Sign in or register with NoteBooks first. Use the Supabase access token in the `Authorization: Bearer` header:

- `POST /keys` with `{"name":"my-client"}` creates a key. The secret is returned once; store it securely.
- `GET /keys` lists key metadata, never secret values.
- `DELETE /keys/{id}` revokes a key you own.

Each account can have at most five active keys. Do not put keys in URLs, browser code, source control, or logs.

## Download a Markdown file

`GET /files?owner=...&repo=...&path=...` requires a NoteBooks API key in the `Authorization: Bearer` header. Only catalogued paths with `.md`, `.markdown`, or `.mdx` extensions are accepted. Files are pinned to synchronized repository metadata and SHA-verified. The current per-file maximum is 2 MiB.

Each key is rate-limited to 60 requests per minute. A `429` response includes `Retry-After` and rate-limit headers. Successful responses include an `ETag` based on the file SHA; send `If-None-Match` to request a `304` when unchanged.

The API is intended for authorized clients. Respect repository content rights and do not redistribute material without permission. The service does not provide API access to disabled or archived repositories.
