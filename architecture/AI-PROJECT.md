# NoteBooks AI chat

This page describes the implemented AI chat path in [NoteBooks-Framework](https://github.com/fsr-official/NoteBooks-Framework). It is an implementation reference, not a provider quota guarantee. Provider model names, availability, and rate limits can change; verify them with the provider before changing production configuration.

## Request path

The reader sends chat requests to `POST /api/ai/chat`. The server validates the body, limits its size, and fits the note excerpts and recent chat history to the selected tier's approximate input budget. The browser never receives provider API keys.

Low effort is available anonymously. Medium, High, and Extra require a verified signed-in account. Requests are rate-limited through Redis: authenticated requests use an account identifier; anonymous requests are limited by both IP and browser identifier. A successful signed-in request records usage metadata; prompts and provider secrets are not written to those usage events.

The request may opt into provider web search. Search availability depends on the selected model and provider support; it is not guaranteed. Note excerpts are untrusted reference material, not instructions.

## Server-enforced tiers

| Tier | Model order | Input budget | Maximum output | Reasoning effort |
| --- | --- | ---: | ---: | --- |
| Low | `llama-3.1-8b-instant`, then `openai/gpt-oss-20b` | 1,500 tokens | 512 tokens | — |
| Medium | `openai/gpt-oss-20b`, then `llama-3.1-8b-instant` | 2,500 tokens | 1,000 tokens | low |
| High | `llama-3.3-70b-versatile`, then `openai/gpt-oss-120b` | 4,000 tokens | 1,500 tokens | — |
| Extra | `openai/gpt-oss-120b`, then `llama-3.3-70b-versatile` | 3,500 tokens | 3,000 tokens | high |

These settings are enforced by the server, not trusted from the client. Input fitting is approximate. The service falls back to the next model on provider rate-limit and transient server failures; other provider errors are reported without silently treating them as success.

## Provider key slots

The server reads these optional environment variables:

| Slot | Environment variable |
| --- | --- |
| Main | `GROQ_API_KEY_MAIN` |
| Science | `GROQ_API_KEY_SCIENCE` |
| Commerce | `GROQ_API_KEY_COMMERCE` |
| Humanities | `GROQ_API_KEY_HUMANITIES` |
| Lower secondary | `GROQ_API_KEY_LOWER_SECONDARY` |

The service selects only configured slots enabled by the database controls and rotates among available slots using Redis. A provider `429` records a cooldown for the selected slot; an administrator can also disable or re-enable a slot. The admin interface exposes configuration status, never the secret value. Multiple keys should not be assumed to provide independent capacity; provider limits and terms determine how keys are grouped.

## Limits and operational gaps

- There are request-rate limits, but no tier-specific daily token or request quotas.
- Input budgets are character-based approximations, not tokenizer guarantees.
- There is no separate fallback provider.
- Provider key state and usage telemetry depend on the configured Supabase and Redis services.
- Live provider quotas and deployment secrets must be checked in their respective consoles; this document intentionally contains no secret values.

See the [AI Usage Policy](https://notebooks-framework.vercel.app/ai-usage-policy), [database model](DATABASE.md), and [maintainer operations guide](ADMIN-OPERATIONS.md) for related behavior.
