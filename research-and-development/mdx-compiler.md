# MDX compiler proposal

**Status:** Proposal — not implemented in production.

## Goal

Explore richer interactive notes while preserving the current Markdown reader's predictable rendering, accessibility, and safety.

## Suggested constraints

1. Start with a small, allow-listed component set (for example callouts, collapsible explanations, and quizzes) rather than general-purpose JSX.
2. Compile only files from configured, trusted repositories. Never compile user-submitted MDX on the server.
3. Reject imports, arbitrary expressions, event handlers, and components outside the approved registry.
4. Preserve a Markdown fallback when an MDX block fails, and surface a clear diagnostic with source location.
5. Test hydration, keyboard access, reduced motion, narrow screens, sanitization, and bundle size before enabling a format in production.
6. Keep authoring fixtures in [desmos-dsl](../desmos-dsl/README.md) and gate rollout behind an explicit format/version marker.

## Evaluation path

Compare a restricted MDX subset with Markdown extensions and custom fenced directives. Measure cold compile cost, rendered DOM size, accessibility, and error recovery on representative notes. Do not select or ship a compiler until these checks and the threat model have been reviewed.
