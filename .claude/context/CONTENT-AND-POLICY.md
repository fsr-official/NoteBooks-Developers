# Content, usage, and policy

## Content types

This repository contains public developer documentation and small renderer fixtures. Curriculum notes and larger learning materials belong in their designated content repositories, not here, unless the user specifically asks to edit them.

For student-facing notes:

- Write clear, structured explanations with accurate definitions, worked steps, and readable equations.
- Preserve the author's meaning and educational level. Do not invent curriculum facts or silently change an answer while editing presentation.
- Use standard Markdown and the syntax already supported by the reader. A Markdown/KaTeX fixture and parser references are in [`desmos-dsl/`](../../desmos-dsl/README.md).
- Keep code and examples inert unless the existing reader explicitly supports their rendering. Never introduce executable MDX/JSX; MDX remains a research proposal, not a production authoring format.
- Prefer relative links within a repository and verify each target exists. Use ordinary Markdown fences with an accurate language tag.
- When source accuracy is uncertain, mark the uncertainty or ask for a source instead of presenting a guess as fact.

## Desmos blocks

Use the dedicated [`desmos-dsl-author` skill](../skills/desmos-dsl-author/SKILL.md) for graph authoring. Treat the language references as the intended grammar but check the compiler tests and audit before using newer or API-sensitive features. Desmos 2D/3D runtime rendering is not independently production-certified in the latest audit.

## Content rights

- Original material in this repository is licensed under GNU GPL version 3 only (`GPL-3.0-only`). See [`LICENSE.md`](../../LICENSE.md).
- The GPL applies to original material in this repository; it does not relicense learning content or code from other repositories.
- Third-party names, documentation, textbooks, diagrams, and code retain their own licenses and terms. Verify permission and attribution before copying or redistributing.
- API access or indexing a repository does not grant redistribution rights.

## Privacy and security

- Do not place API keys, webhook secrets, passwords, private logs, student-identifying information, or production request data in docs, examples, context files, commits, or tool output.
- Use placeholders for credentials and synthetic content for examples.
- Keep account authentication and passwords with Supabase Auth. Do not describe client state as authorization.
- Follow the public [AI Usage Policy](https://notebooks-framework.vercel.app/ai-usage-policy) and [Privacy Policy](https://notebooks-framework.vercel.app/privacy) when describing student-facing features.
- Be precise about data handling: provider calls, telemetry, retention, and production configuration can differ from local code. Inspect current source/policy and do not promise privacy properties unsupported by evidence.

## Documentation maintenance

When implementation changes, update the relevant public architecture/API/policy page and the context index or dated status note if they no longer match. Keep the root README as the human entry point and `CLAUDE.md` as the Claude project entry point. `.claude/` is deliberately excluded from `files.json` by `fmtree.py`, so never rely on agent context files being published as reader content.
