# Desmos DSL and renderer fixtures

This folder contains the Desmos DSL references, implementation audit, and Markdown fixtures for exercising the NoteBooks reader. Their presence does not establish that a live provider/API path has been verified or that every syntax combination is supported.

## References and fixtures

- [Desmos 2D language reference](DESMOS-2D.md)
- [Desmos 3D language reference](DESMOS-3D.md)
- [Implementation and verification audit](AUDIT.md)
- [Markdown and mathematics fixture](markdown-and-math.md)
- [Desmos 2D fixture](desmos-2d.md)
- [Desmos 3D fixture](desmos-3d.md)

When checking a renderer change, verify the expected result, malformed-input diagnostics, narrow and wide layouts, and browser console output. Keep experimental formats separate until their parser and safety model are implemented.
