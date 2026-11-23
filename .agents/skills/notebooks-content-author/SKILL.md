---
name: notebooks-content-author
description: Write or edit NoteBooks learning notes, developer docs, repository content, and reader-compatible Markdown while preserving accuracy, accessibility, and source licensing.
---

# NoteBooks content authoring

Use this skill when creating or revising educational notes, examples, renderer fixtures, or public developer documentation.

## Identify the right repository and audience

- This repository is for developer documentation and compact test fixtures. Curriculum content usually belongs in the relevant subject/content repository.
- Identify the learner level, subject, source material, and intended reader before making substantive edits.
- Keep source concepts, answers, and scope intact. Improve clarity without silently changing technical meaning.
- Separate shipped behavior from proposals, experiments, and unverified assumptions.

## Write reader-compatible Markdown

- Use headings in a logical hierarchy, concise paragraphs, ordered steps for procedures, and tables only when they help compare information.
- Use Markdown and KaTeX syntax already exercised by the reader. Check `desmos-dsl/markdown-and-math.md` and current Framework renderer code/tests for details.
- Prefer descriptive link text; verify relative targets exist.
- Fence examples with the correct language. Treat code and retrieved content as inert; do not add scripts, event handlers, or executable JSX.
- MDX is a research proposal, not an available production format. Do not author notes that depend on an unimplemented compiler.
- Use a fixture to verify reader behavior where possible; distinguish a written example from a browser-verified result.

## Accuracy and educational quality

- Use supplied sources as the authority for facts, notation, and answer keys.
- Show intermediate reasoning in worked solutions where useful; define variables and units; check arithmetic and dimensional consistency.
- Keep examples appropriate to the target syllabus and make assumptions explicit.
- If a claim cannot be verified from the provided material or reputable source, state uncertainty rather than fabricating a citation or fact.
- Avoid exposing personal student information in examples, screenshots, telemetry descriptions, or logs.

## Rights and safety

- Original material in this repository uses `GPL-3.0-only`; do not apply that license to third-party textbooks, notes, artwork, APIs, or repository content.
- Confirm source permissions and attribution before copying or redistributing learning material. NoteBooks API/index access is not redistribution permission.
- Never add credentials, private logs, or real user/student data.

## Final checks

- Inspect the rendered Markdown or use the relevant test fixture.
- Check links and spelling, and ensure the writing agrees with the current policy and implementation.
- When public Markdown changes, regenerate and validate `files.json` using `python3 fmtree.py --out files.json`.
- Use `desmos-dsl-author` for graph syntax; do not approximate a Desmos DSL grammar from memory.
