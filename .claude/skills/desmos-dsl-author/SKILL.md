---
name: desmos-dsl-author
description: Author and validate NoteBooks desmos and desmos3d Markdown blocks using the repository DSL references, compiler behavior, and verification limits.
---

# NoteBooks Desmos DSL authoring

Use this skill whenever writing, editing, or reviewing a `desmos` or `desmos3d` fenced block.

## Read the local references first

1. Read `desmos-dsl/README.md` for the index.
2. Read `desmos-dsl/DESMOS-2D.md` or `desmos-dsl/DESMOS-3D.md` for the target language.
3. Check `desmos-dsl/AUDIT.md` for implemented behavior and unverified API assumptions.
4. Inspect the corresponding Framework compiler and tests when the codebase is available:
   - `NoteBooks-Framework/src/lib/desmos-2d.ts` and `test/desmos-2d.test.ts`
   - `NoteBooks-Framework/src/lib/desmos-3d.ts` and `test/desmos-3d.test.ts`
5. Use `desmos-dsl/desmos-2d.md` and `desmos-dsl/desmos-3d.md` as small reader fixtures.

## Authoring rules

- Use a fenced code block with exactly the correct tag: `desmos` for 2D or `desmos3d` for 3D.
- Keep examples minimal and pedagogically useful. Give expressions stable, unique IDs; use only documented attributes/directives supported by the compiler.
- Preserve LaTeX payloads literally. Do not rewrite math into a guessed parser syntax.
- Do not invent flags, settings, nested attributes, `%verify`, `%expect`, folders, camera fields, vector sugar, or other directives. In particular, 3D/API-sensitive features require explicit confirmation in the current compiler/tests and the audit.
- Prefer ordinary documented expressions for routine examples. Mark experimental or API-unverified syntax clearly and keep it out of core learning notes.
- Include a plain-language explanation of what the graph demonstrates and what the learner should observe.

## Validation and status

- Run focused compiler tests in NoteBooks-Framework when DSL implementation changes.
- Open the fixture in the reader to validate runtime behavior when the appropriate development environment and API access are available.
- Compiler tests prove parsing/output behavior, not live Desmos API rendering. The latest audit does not independently certify live 2D rendering or 3D API access, expression analysis, or all generated fields.
- Report compile-tested and browser/API-verified as distinct states. Never claim a graph is production-verified from source inspection alone.

## Failure handling

If syntax is unsupported, use existing supported syntax or clearly identify the required compiler change. Do not silently drop unsupported options or convert a broken expression into a different graph. Add a focused regression fixture/test when changing compiler behavior.
