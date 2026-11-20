# Desmos 2D

The `desmos` compiler and reader integration are implemented. Use this fixture for end-to-end verification; the latest audit does not independently certify live rendering or expression-analysis behavior.

```desmos
@parabola [color=blue, showLabel]: y=x^2
@line [color=teal]: y=2x+1
```

Expected: two labeled/colorized expressions appear in a 2D calculator. A deliberately malformed expression should produce the reader's visible diagnostic overlay rather than silently showing incorrect output.

See the [DESMOS-2D DSL reference](DESMOS-2D.md) for supported grammar and attributes.
