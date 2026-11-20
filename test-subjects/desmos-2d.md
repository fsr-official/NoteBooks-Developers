# Desmos 2D

Open this page in the NoteBooks reader to check the production `desmos` compiler and graph renderer.

```desmos
@parabola [color=blue, showLabel]: y=x^2
@line [color=teal]: y=2x+1
```

Expected: two labeled/colorized expressions appear in a 2D calculator. A deliberately malformed expression should produce the reader's visible diagnostic overlay rather than silently showing incorrect output.

See the [DESMOS-2D DSL reference](../DESMOS-2D.md) for supported grammar and attributes.
