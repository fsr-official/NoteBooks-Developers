# Research and development

This area describes parser experiments and proposals. Every item must state its implementation status; an idea documented here is not automatically part of production.

## Parser status

| Parser or renderer | Status | Notes |
| --- | --- | --- |
| Markdown and KaTeX | Production | Used by the note reader |
| Desmos 2D DSL | Implemented; runtime verification pending | Compiler and reader integration exist; see [reference](../DESMOS-2D.md) and [audit](../AUDIT.md) |
| Desmos 3D DSL | Implemented; runtime verification pending | Live 3D API access and end-to-end rendering remain unverified; see [reference](../DESMOS-3D.md) and [audit](../AUDIT.md) |
| MDX | Proposal | No production MDX compiler is installed. See [the design note](mdx-compiler.md) |
| TikZ / Mermaid | Unverified | Do not assume production support without a working reader fixture and end-to-end validation |

## Safety boundary

Never execute arbitrary JSX or compile visitor-submitted MDX on the server. Any future MDX path must be restricted to trusted repository content, define allowed components and imports, and have explicit safety, fallback, and regression tests. An in-browser playground must remain isolated from server execution.
