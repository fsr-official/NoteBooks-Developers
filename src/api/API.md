# NoteBooks Content API

The v1 API lets signed-in NoteBooks accounts manage their API keys and use those keys to download catalogued Markdown files.

**Base URL:** `https://notebooks-framework.vercel.app/api/v1`

## Start here

1. Sign in to NoteBooks and obtain a Supabase access token.
2. Use that access token as `Authorization: Bearer <access-token>` with the [key-management endpoints](APIv1.md#api-key-management).
3. Create an API key and copy it immediately. The secret is returned once and cannot be retrieved later.
4. Use the NoteBooks API key as `Authorization: Bearer <notebooks-api-key>` with the file endpoint.
5. Keep the key in a secret store and never put it in a URL, browser bundle, source control, or logs.

See the [full v1 endpoint reference](APIv1.md) for request and response details, and the [API client skill](SKILL.md) for safe agent/client usage guidance.

## Access and limits

- Each NoteBooks account may have at most five active API keys.
- The file endpoint serves only `.md`, `.markdown`, and `.mdx` paths that are present in an enabled, non-archived repository in the Framework catalog.
- Downloads are pinned to synchronized commit metadata and verified against the Git blob SHA before being returned.
- Each key has a 60-request-per-minute token-bucket limit. A `429` response includes `Retry-After`.
- A successful download includes an SHA-based `ETag` and file metadata headers. Send `If-None-Match` to request a `304` when unchanged.
- The service does not grant rights to redistribute source repository content. Respect the source repository's license and terms.

The API is intended for authorized clients. Do not use it to bypass repository access controls, enumerate content, or redistribute material without permission.
