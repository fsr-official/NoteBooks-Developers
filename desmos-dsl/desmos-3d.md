# Desmos 3D

The `desmos3d` compiler and reader integration are implemented, but live 3D API access and end-to-end rendering remain unverified. Use this fixture in a WebGL-capable browser as a verification subject, not as evidence of production readiness.

```desmos3d
@sphere: x^2+y^2+z^2=9
```

Expected: a 3D surface appears. Also test a browser without WebGL and malformed DSL; the reader should show an explicit error state.

See the [DESMOS-3D DSL reference](DESMOS-3D.md) for known implementation gaps and API verification status.
