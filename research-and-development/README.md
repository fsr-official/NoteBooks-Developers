# Research and development

This area describes parser experiments and proposals. Every item must state its implementation status; an idea documented here is not automatically part of production.

## Parser status

| Parser or renderer | Status | Notes |
| --- | --- | --- |
| Markdown and KaTeX | Production | Used by the note reader |
| Desmos 2D DSL | Production | Compiled and rendered by the note reader; see [reference](../DESMOS-2D.md) |
| Desmos 3D DSL | Production, verification ongoing | WebGL/API capability checked; see [reference](../DESMOS-3D.md) |
| MDX | Proposal | No production MDX compiler is installed. See [the design note](mdx-compiler.md) |
| TikZ / Mermaid | Unverified | Do not assume production support without a working reader fixture |

## Safety boundary

Never execute arbitrary JSX or compile visitor-submitted MDX on the server. Any future MDX path must be restricted to trusted repository content, define allowed components and imports, and have explicit safety, fallback, and regression tests. An in-browser playground must remain isolated from server execution.
