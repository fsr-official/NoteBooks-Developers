# NoteBooks Content API v1

Base URL: `https://notebooks-framework.vercel.app/api/v1`

All responses are JSON except successful file downloads, which return Markdown text. Do not send access tokens or API keys in query parameters.

## Authentication

Key-management endpoints require a valid Supabase access token:

```http
Authorization: Bearer <supabase-access-token>
```

The file endpoint requires a NoteBooks API key created by the key-management API:

```http
Authorization: Bearer <notebooks-api-key>
```

API key secrets are returned only when created. Store the key securely; it cannot be listed or recovered later. Each account can have at most five active keys.

## API-key management

### `POST /keys`

Create a key for the authenticated account.

Request:

```json
{ "name": "my-client" }
```

`name` is required and must contain 1–64 characters after trimming.

Success: `201 Created`

```json
{
  "id": "key-id",
  "name": "my-client",
  "apiKey": "nbv2_...",
  "warning": "Copy this key now. It cannot be retrieved again."
}
```

Returns `409 Conflict` when the account already has five active keys. Treat `apiKey` as a secret and do not log the response.

### `GET /keys`

List the authenticated account's key metadata. The response never includes the secret:

```json
{
  "keys": [
    {
      "id": "key-id",
      "name": "my-client",
      "key_prefix": "nbv2_...",
      "created_at": "timestamp",
      "expires_at": null,
      "last_used_at": null,
      "revoked_at": null
    }
  ]
}
```

### `DELETE /keys/{id}`

Revoke an active key owned by the authenticated account.

Success: `200 OK`

```json
{ "id": "key-id", "status": "revoked" }
```

Returns `400 Bad Request` for an invalid ID and `404 Not Found` when the key is not active or not owned by the account.

## Download a file

### `GET /files`

Required query parameters (each must occur exactly once):

| Parameter | Meaning |
| --- | --- |
| `owner` | GitHub owner or organization |
| `repo` | GitHub repository name |
| `path` | Repository-relative path to a `.md`, `.markdown`, or `.mdx` file |

Example:

```sh
curl --fail-with-body \
  -H "Authorization: Bearer ${NOTEBOOKS_API_KEY}" \
  --get \
  --data-urlencode "owner=fsr-science" \
  --data-urlencode "repo=NCERT-Science" \
  --data-urlencode "path=Class 9/Chapter 1.md" \
  "https://notebooks-framework.vercel.app/api/v1/files"
```

Use an environment variable or secret manager for the credential; do not paste a real key into shell history or a committed script.

Successful responses return `text/markdown; charset=utf-8` with:

- `ETag`: the Git blob SHA, quoted.
- `X-File-SHA`: the Git blob SHA.
- `X-Repository`: `owner/repo`.
- `RateLimit-Limit` and `RateLimit-Remaining`.
- `Content-Disposition`: attachment filename.

Send `If-None-Match: "<file-sha>"` to receive `304 Not Modified` when the synchronized file has not changed. The response body is capped at 2 MiB. The server verifies the downloaded content against the catalogued blob SHA before returning it.

Each key is limited to 60 requests per 60 seconds by a token bucket. A `429 Too Many Requests` response includes `Retry-After`, `RateLimit-Limit`, and `RateLimit-Remaining`.

## Common errors

| Status | Meaning |
| --- | --- |
| `400` | Missing, repeated, malformed, or invalid query/body data |
| `401` | Missing, invalid, expired, or revoked credential |
| `404` | File not present in the enabled catalog, or key not found for the account |
| `409` | Active API-key limit reached |
| `413` | Requested text file exceeds 2 MiB |
| `429` | API-key rate limit exceeded; honor `Retry-After` |
| `502` | Upstream content or catalog metadata could not be verified |
| `503` | A required service is unavailable |

Do not automatically retry authentication, validation, or not-found errors. Retry transient `502`/`503` responses with bounded backoff; for `429`, wait at least the supplied `Retry-After`.