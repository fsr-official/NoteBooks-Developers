# DESMOS-3D

A small declarative language for `desmos3d` code blocks. It is the 3D sibling of DESMOS-2D: same header syntax, same presets, same verification pipeline, with first-class **vectors**, surfaces, and a 3D viewport. It compiles to Desmos 3D API calls so the renderer can control ids, labels, colors, visibility, slider bounds and more, without parsing LaTeX.

**Status legend** (used in every table below)

- ✓ = confirmed against the Desmos API docs, or confirmed by the project owner
- ◦ = from memory of the API reference, **verify before locking the schema**

> The Desmos 3D API is newer and less documented than the 2D one. Anything 3D-specific is ◦ unless it was inherited unchanged from the 2D rules the project owner already confirmed.

## Implementation status

The compiler and reader integration are implemented, including initialization checks and visible compile or capability errors. Treat the 3D path as requiring production verification: live 3D API access and end-to-end rendering have not been independently certified in the latest audit.

This is a first implementation, not the complete verification design in §12. `%folder`, `%expect`, and `%verify` are not implemented; expression analysis, round-trip verification, warning badges, and the full structured error pipeline are also deferred. The reader uses `updateSettings` when available (rather than the `setGraphSettings` name in the reference examples). The 3D API methods, vector LaTeX template, surface fields, and 3D drag modes have not been verified against a live Desmos 3D API session. Treat this document's grammar and examples as the intended DSL unless marked implemented above, not as a guarantee that every listed directive is currently accepted.

---

## 1. Design rules

1. **LaTeX is never parsed.** Everything after the first `:` of a header is the LaTeX payload, verbatim.
2. **Metadata comes before the LaTeX**, inside `[ ... ]`.
3. **Backwards compatible.** A line with no `@` header is plain LaTeX and gets an auto id.
4. **The id is the label.** `showLabel` alone displays the id. `label="..."` overrides it.
5. **No silent fallbacks.** Unknown attributes, bad enum values and duplicate ids are compile errors.
6. **Single source of truth.** Shared styles live in `%preset` and are referenced with `use=`. No repeated magic values.
7. **Never render blank.** Every failure, at compile time or at render time, surfaces as a visible, structured error in the app (§12).
8. **Sugar is string templating, not parsing.** `%vector` and friends splice the author's LaTeX component strings into a fixed template. The compiler never inspects what is inside a component.

---

## 2. Grammar

```
file        := line*
line        := blank | comment | directive | expr_line
comment     := WS* "//" ...
directive   := "%" name arg*                     # whitespace-separated args
expr_line   := header_line | plain_latex
header_line := "@" id [ "[" attrs "]" ] ":" latex  [ WS "//" comment ]
attrs       := attr ("," attr)*
attr        := key | key "=" value
value       := word | "quoted string" | "(" value ("," value)* ")"
plain_latex := any line not starting with "@" or "%" or "//"
```

Nested tuples are allowed in values, for example `from=(0,0,0)` and `domain=((0,1),(0,2))`.

### Tokenizing rules

| Rule | Detail |
|---|---|
| Fence | Language tag is `desmos3d` |
| Attribute split | Top-level commas only. Commas inside `( )`, `{ }` and `"..."` do **not** split |
| Header regex | `^@([A-Za-z0-9_]+)\s*(?:\[(.*)\])?\s*:\s*(.*)$`. The attr list is tokenized with a quote/paren-aware scanner, not by regex |
| Continuation | A header that ends with `:` takes the next non-empty line as its LaTeX |
| Comments | `//` starts a comment only when preceded by whitespace and outside quotes |
| Flags | A bare key (`showLabel`) means `true` |
| Directive args | Whitespace-separated `key=value`, respecting `( )`, `{ }` and quotes |

### Ids ✓ (confirmed)

- Must match `[A-Za-z0-9_]+`.
- No `-`.
- Ids are always **strings** in the output JSON. Purely numeric ids such as `1` are allowed and are emitted as `"1"`. The compiler never emits a numeric id, and the renderer never coerces one.
- Plain LaTeX lines get `auto_1`, `auto_2`, ... The prefix `auto_` is reserved.
- Duplicate ids are an error. This includes ids produced by sugar directives (`%vector v` reserves `v`).

---

## 3. Expression attributes

Applied to `@id [ ... ]: latex` lines and to the sugar directives in §5. Compiles to one object in `setExpressions([...])`.

### 3.1 Shared with DESMOS-2D

| DSL key | JSON field | Value | Status |
|---|---|---|---|
| `@id` | `id` | `[A-Za-z0-9_]+`, always a string | ✓ |
| *(latex after `:`)* | `latex` | string, verbatim | ✓ |
| `hidden` (aliases `inv`, `color=inv`) | `hidden` | flag, `true`. All three forms are identical | ✓ |
| `color=` (alias `colour=`) | `color` | hex `#rrggbb`, or a name from §4. `inv` emits `hidden: true` and **no** `color` field | ✓ |
| `slider=(min,max,step)` | `sliderBounds` `{min,max,step}` | LaTeX strings. `(min,max)` omits `step` | ✓ |
| `domain=(min,max)` | `domain` `{min,max}` | LaTeX strings | ✓ |
| `showLabel` | `showLabel: true`, plus `label: <id>` | flag | ◦ |
| `label="..."` | `label` | string, overrides the id-as-label default | ◦ |
| `labelSize=` | `labelSize` | `small` `medium` `large` | ◦ |
| `lineStyle=` | `lineStyle` | `solid` `dashed` `dotted` | ◦ |
| `lineWidth=` | `lineWidth` | number > 0 | ◦ |
| `lineOpacity=` | `lineOpacity` | number, 0..1 | ◦ |
| `pointStyle=` | `pointStyle` | `point` `open` `cross` | ◦ |
| `pointSize=` | `pointSize` | number > 0 | ◦ |
| `pointOpacity=` | `pointOpacity` | number, 0..1 | ◦ |
| `fill=` | `fillOpacity` | number, 0..1. For surfaces and regions | ◦ |
| `secret` | `secret` | flag | ◦ |
| `folder=name` | `folderId` | must match a `%folder` | ◦ |
| `use=name` | *(compiler-only)* | applies a `%preset` | n/a |

### 3.2 3D-specific

| DSL key | JSON field | Value | Status |
|---|---|---|---|
| `parametricDomain=(min,max)` | `parametricDomain` `{min,max}` | LaTeX strings. Curves in `t` | ◦ |
| `uDomain=(min,max)`, `vDomain=(min,max)` | `parametricDomain` `{u:{min,max}, v:{min,max}}` | LaTeX strings. Parametric surfaces in `u`, `v` | ◦ |
| `xDomain=(min,max)`, `yDomain=(min,max)`, `zDomain=(min,max)` | `domain` per axis | LaTeX strings. Clips a surface or region | ◦ |
| `surface=` | `surfaceStyle` | `solid` `mesh` `wire` | ◦ |
| `mesh=` | `meshDensity` | integer ≥ 1 | ◦ |
| `arrowSize=` | `arrowSize` | number > 0. Vector head size | ◦ |
| `drag=` (alias `dragMode=`) | `dragMode` | `none` `x` `y` `z` `xy` `xz` `yz` `xyz` `auto` | ◦ (2D set is ✓; `z`-modes unverified) |

Notes:

- Slider and domain bounds are **LaTeX strings** ✓ (confirmed). The compiler keeps `slider=(0,2\pi,0.1)` as raw strings and never converts them to numbers. The verifier compares them as strings.
- `slider` only takes effect on lines of the form `name=constant`. Anything else is a warning.
- `drag` only works on free points (coordinates that are plain numbers). On a dependent point it is a warning. In 3D, `drag` axes beyond what the API supports are an `E_CAPABILITY` error at render time (§12.3), not a silent downgrade.
- `uDomain`/`vDomain` are only valid on a line whose LaTeX is a 3-tuple in `u` and `v`. The compiler does not check that (rule 1); the analysis step does (§12.4).
- Merge order: preset values first, then inline attributes. Inline wins.

---

## 4. Enum and color maps

| DSL value | Desmos value | Status |
|---|---|---|
| `red` | `#c74440` (`Desmos.Colors.RED`) | ◦ |
| `blue` | `#2d70b3` (`Desmos.Colors.BLUE`) | ◦ |
| `green` | `#388c46` (`Desmos.Colors.GREEN`) | ◦ |
| `purple` | `#6042a6` (`Desmos.Colors.PURPLE`) | ◦ |
| `orange` | `#fa7e19` (`Desmos.Colors.ORANGE`) | ◦ |
| `black` | `#000000` (`Desmos.Colors.BLACK`) | ◦ |
| `inv` | *(no color)*, sets `hidden: true` | n/a (compiler rule) |
| `drag=xyz` etc. | `Desmos.DragModes.XYZ` etc. | ◦ |
| `lineStyle=dashed` etc. | `Desmos.Styles.DASHED` etc. | ◦ |
| `pointStyle=open` etc. | `Desmos.Styles.OPEN` etc. | ◦ |
| `surface=mesh` etc. | string passthrough | ◦ |

The compiler resolves names to the actual strings or constants at compile time. Unknown names are errors.

---

## 5. Block directives

Start with `%`. Arguments are whitespace-separated.

### `%folder`, `%note`, `%table`

Identical to DESMOS-2D. `%table` columns may hold 3D coordinates through three columns (`x_1`, `y_1`, `z_1`); the compiler does not group them.

### `%vector`

First-class vector sugar. It builds the vector's LaTeX by **string templating only**; component strings are inserted verbatim.

```
%vector <id> from=(fx,fy,fz) to=(tx,ty,tz) [attrs...]
%vector <id> at=(px,py,pz) dir=(dx,dy,dz)  [attrs...]
%vector <id> dir=(dx,dy,dz)                [attrs...]      # tail at origin
```

| Form | Emitted LaTeX template | Status |
|---|---|---|
| `from` + `to` | `\operatorname{vector}\left(\left(fx,fy,fz\right),\left(tx,ty,tz\right)\right)` | ◦ |
| `at` + `dir` | `\operatorname{vector}\left(\left(px,py,pz\right),\left(px+dx,py+dy,pz+dz\right)\right)` | ◦ |
| `dir` only | `\operatorname{vector}\left(\left(0,0,0\right),\left(dx,dy,dz\right)\right)` | ◦ |

Rules:

- Exactly one of the three forms must be used. Mixing is `E_VECTOR_FORM`.
- Each tuple must have exactly **3** top-level components, else `E_VECTOR_ARITY`. Components are counted by the same paren-aware splitter used for attributes; their content is never inspected.
- In the `at` + `dir` form the head is `p + d` per component, wrapped in `\left(...\right)` so that signed or compound components stay correct: `p_x+\left(d_x\right)`.
- The result is an ordinary expression object, so every attribute in §3 applies. Vector-relevant ones: `color`, `lineWidth`, `lineStyle`, `arrowSize`, `showLabel`, `label`, `hidden`, `use`, `folder`.
- If a component refers to a slider or another expression, the vector updates live in Desmos. That needs no compiler support.
- If the author prefers to write the vector LaTeX by hand, a normal `@v [...]:` line works identically. `%vector` is optional sugar.

### `%vectors`

Draws several vectors from one origin without repeating attributes.

```
%vectors <idprefix> at=(px,py,pz) [attrs...]
  dir=(dx,dy,dz) [id=suffix] [color=...]
  dir=(dx,dy,dz)
```

Emits one expression per `dir` row. Ids are `<idprefix>_<suffix>`, or `<idprefix>_1`, `<idprefix>_2`, ... when `id=` is omitted. Row attributes override the block's attributes.

### `%point3`

Convenience for a labelled 3D point. Pure templating.

```
%point3 <id> at=(x,y,z) [attrs...]
```

Emits `<id>=\left(x,y,z\right)`. Same arity rule as vectors (`E_POINT_ARITY`).

### `%axes`

Draws the three coordinate axes as vectors with labels. Ids are reserved: `axis_x`, `axis_y`, `axis_z`.

```
%axes [length=5] [color=...] [labels=("x","y","z")]
```

`length` is a LaTeX string spliced in verbatim.

---

## 6. Graph-level directives

| Directive | Compiles to | Status |
|---|---|---|
| `%options <flag>...` | `Desmos.Calculator3D(el, options)` | ◦ |
| `%view x=(l,r) y=(b,t) z=(lo,hi)` | `calc.setMathBounds({ xmin, xmax, ymin, ymax, zmin, zmax })` | ◦ |
| `%camera azimuth=a elevation=e [zoom=z]` | camera/orientation call | ◦ (may not exist, see below) |
| `%settings key=value ...` | `calc.setGraphSettings({ ... })` | ◦ |
| `%expect <id> ...` | verifier assertion, see §12.6 | n/a (compiler rule) |
| `%verify <mode>` | verifier strictness, see §12.5 | n/a (compiler rule) |

**`%options` flags:** `lockViewport`, `expressionsCollapsed`, `keypad`, `graphpaper`, `expressions`, `settingsMenu`, `zoomButtons`, `border`, `expressionsTopbar`, `images`, `folders`, `administerSecretFolders`. The 2D list is ✓; whether each applies to the 3D constructor is ◦. Unknown flags for the 3D target are a compile error. Use `key=false` to turn off defaults.

**`%settings` keys:**

| Key | Value | Status |
|---|---|---|
| `showGrid`, `showXAxis`, `showYAxis`, `showZAxis` | `true` / `false` | ◦ |
| `showPlane` | `true` / `false`, the base `xy` plane | ◦ |
| `xAxisLabel`, `yAxisLabel`, `zAxisLabel` | string | ◦ |
| `degreeMode` | `true` / `false` | ◦ |
| `axisArrowMode` | `none` `positive` `both` | ◦ |

**`%view`:** numbers are real numbers, not LaTeX strings. Each pair must satisfy `min < max`, otherwise `E_VIEW_RANGE`. The three axes may be given in any combination; omitted axes are left to Desmos.

**`%camera`:** angles are in degrees, real numbers. This is the least certain item in the spec. The renderer probes for the method (§12.3). If the API has no camera control, `%camera` fails with `E_CAPABILITY` and the message says so, and `%view` is the only way to frame the scene.

---

## 7. Compiler-only directives

| Directive | Purpose |
|---|---|
| `%preset <name> key=value ...` | Defines a reusable attribute set. Referenced by `use=<name>`. A preset may not reference another preset |
| `%const <name> = <value>` | **Reserved, not implemented** |

Presets must be declared before use. An unknown preset name is an error. Presets apply to sugar directives the same way as to headers: `%vector v use=arrow from=... to=...`.

---

## 8. Validation (compile time)

| Condition | Result | Code |
|---|---|---|
| Duplicate id (including sugar-reserved ids) | error | `E_DUP_ID` |
| Id not matching `[A-Za-z0-9_]+` or using the `auto_` prefix | error | `E_BAD_ID` |
| Unknown attribute key | error | `E_UNKNOWN_ATTR` |
| Unknown enum or color name, malformed hex | error | `E_BAD_ENUM` |
| Opacity outside 0..1, size, width, mesh or arrowSize ≤ 0 | error | `E_BAD_RANGE` |
| `folder=` names an undeclared folder | error | `E_NO_FOLDER` |
| `use=` names an undeclared preset | error | `E_NO_PRESET` |
| Both `color` and `colour` given on one line | error | `E_DUP_COLOR` |
| `%view` with `min ≥ max` on any given axis | error | `E_VIEW_RANGE` |
| `%vector` mixes forms, or has none | error | `E_VECTOR_FORM` |
| `%vector` or `%vectors` tuple without exactly 3 components | error | `E_VECTOR_ARITY` |
| `%point3` tuple without exactly 3 components | error | `E_POINT_ARITY` |
| `%expect` names an unknown id | error | `E_NO_EXPECT_TARGET` |
| `uDomain`/`vDomain` given only one of the two | error | `E_DOMAIN_PAIR` |
| 2D-only key used (`polarDomain`, `labelOrientation`) | error | `E_2D_ONLY` |
| `color=inv` together with `hidden` or `inv` (redundant) | warning | `W_REDUNDANT_HIDE` |
| `slider` on a line that is not `name=constant` | warning | `W_SLIDER_TARGET` |
| `drag` on a dependent point | warning | `W_DRAG_DEPENDENT` |
| `showLabel` and `label` on a `hidden` expression | warning | `W_HIDDEN_LABEL` |
| `arrowSize` on a non-`%vector` expression | warning | `W_ARROW_TARGET` |

Every entry carries a source location (`line`, `col`) and the offending `id` when there is one.

---

## 9. Compile target

The compiler outputs one object. The renderer applies it in this order:

```json
{
  "target":      "3d",
  "options":     { },
  "settings":    { },
  "expressions": [ ],
  "bounds":      { },
  "camera":      { },
  "expect":      [ ],
  "verify":      "strict",
  "diagnostics": [ ]
}
```

```js
const calc = Desmos.Calculator3D(el, out.options);   // ◦ constructor name
calc.setGraphSettings(out.settings);
calc.setExpressions(out.expressions);
if (out.bounds) calc.setMathBounds(out.bounds);      // ◦ 3D keys xmin..zmax
if (out.camera) applyCamera(calc, out.camera);       // ◦ may be unsupported
```

The snippet is the **happy path only**. The renderer never calls it bare; it goes through the guarded pipeline in §12.

Empty sections are omitted. `target: "3d"` lets one renderer host both languages and reject a `desmos3d` block routed to the 2D compiler (`E_WRONG_TARGET`).

---

## 10. Examples

### Example 1: vectors with a slider-driven component

**Source**

````
```desmos3d
%view x=(-5,5) y=(-5,5) z=(-1,6)
%preset arrow lineWidth=4 arrowSize=1.2

@t  [slider=(0,3,0.1)]:                 t=1

%vector a   [use=arrow, color=red,  showLabel]  dir=(2,1,3)
%vector b   [use=arrow, color=blue, showLabel]  dir=(-1,2,t)
@s  [color=purple, use=arrow, showLabel]:
     \operatorname{vector}\left(\left(0,0,0\right),\left(1,-1,2\right)\right)
```
````

**Compiled** (abridged)

```json
{
  "target": "3d",
  "bounds": { "xmin": -5, "xmax": 5, "ymin": -5, "ymax": 5, "zmin": -1, "zmax": 6 },
  "expressions": [
    { "id": "t", "latex": "t=1",
      "sliderBounds": { "min": "0", "max": "3", "step": "0.1" } },
    { "id": "a",
      "latex": "\\operatorname{vector}\\left(\\left(0,0,0\\right),\\left(2,1,3\\right)\\right)",
      "color": "#c74440", "lineWidth": 4, "arrowSize": 1.2, "showLabel": true, "label": "a" },
    { "id": "b",
      "latex": "\\operatorname{vector}\\left(\\left(0,0,0\\right),\\left(-1,2,t\\right)\\right)",
      "color": "#2d70b3", "lineWidth": 4, "arrowSize": 1.2, "showLabel": true, "label": "b" },
    { "id": "s",
      "latex": "\\operatorname{vector}\\left(\\left(0,0,0\\right),\\left(1,-1,2\\right)\\right)",
      "color": "#6042a6", "lineWidth": 4, "arrowSize": 1.2, "showLabel": true, "label": "s" }
  ]
}
```

What happened:

- `%vector` with only `dir` put the tail at the origin; the components were spliced in as written, including the slider name `t`.
- `use=arrow` expanded the preset, inline keys winning on conflict.
- The `@s` header ended in `:`, so its LaTeX came from the next line. A hand-written vector and a `%vector` compile to the same shape.

### Example 2: vector at a point, sum of vectors, a surface

**Source**

````
```desmos3d
%view x=(-4,4) y=(-4,4) z=(-2,4)
%settings zAxisLabel="height"

%folder vecs [title="Vectors"]

%point3 P at=(1,1,0) [color=black, pointSize=9, showLabel]
%vector u [folder=vecs, color=red]   at=(1,1,0) dir=(1,0,2)
%vector w [folder=vecs, color=green] at=(1,1,0) dir=(0,2,1)
%vector r [folder=vecs, color=orange, lineStyle=dashed, showLabel, label="u+w"]
          at=(1,1,0) dir=(1,2,3)

@S [fill=0.35, surface=mesh, color=blue, xDomain=(-3,3), yDomain=(-3,3)]:
   z=0.2\left(x^{2}-y^{2}\right)
```
````

**Compiled** (abridged)

```json
{
  "target": "3d",
  "settings": { "zAxisLabel": "height" },
  "expressions": [
    { "type": "folder", "id": "vecs", "title": "Vectors" },
    { "id": "P", "latex": "P=\\left(1,1,0\\right)",
      "color": "#000000", "pointSize": 9, "showLabel": true, "label": "P" },
    { "id": "u", "folderId": "vecs",
      "latex": "\\operatorname{vector}\\left(\\left(1,1,0\\right),\\left(1+\\left(1\\right),1+\\left(0\\right),0+\\left(2\\right)\\right)\\right)",
      "color": "#c74440" },
    { "id": "w", "folderId": "vecs",
      "latex": "\\operatorname{vector}\\left(\\left(1,1,0\\right),\\left(1+\\left(0\\right),1+\\left(2\\right),0+\\left(1\\right)\\right)\\right)",
      "color": "#388c46" },
    { "id": "r", "folderId": "vecs",
      "latex": "\\operatorname{vector}\\left(\\left(1,1,0\\right),\\left(1+\\left(1\\right),1+\\left(2\\right),0+\\left(3\\right)\\right)\\right)",
      "color": "#fa7e19", "lineStyle": "DASHED", "showLabel": true, "label": "u+w" },
    { "id": "S", "latex": "z=0.2\\left(x^{2}-y^{2}\\right)",
      "fillOpacity": 0.35, "surfaceStyle": "mesh", "color": "#2d70b3",
      "domain": { "x": { "min": "-3", "max": "3" }, "y": { "min": "-3", "max": "3" } } }
  ],
  "bounds": { "xmin": -4, "xmax": 4, "ymin": -4, "ymax": 4, "zmin": -2, "zmax": 4 }
}
```

What happened:

- `at` + `dir` built the head as `p + (d)` per component. The extra parentheses are intentional: a component like `-1` or `a+b` stays correct without the compiler ever looking inside it.
- The label `"u+w"` replaced the id-as-label default.
- The `%folder` was emitted before its members.
- The `%vector r` call continued onto a second line because its attribute block was followed by an indented line; continuation follows the same rule as headers.

### Example 3: render-time checks on vectors

**Source**

````
```desmos3d
%view x=(-5,5) y=(-5,5) z=(-5,5)
%verify strict
%expect a [defined]
%expect m [value=(0,6)]            // magnitude of a

@k [slider=(0,3,0.5)]:   k=2
%vector a [color=red] dir=(1,2,k)
@m: m=\operatorname{mag}\left(\operatorname{vector}\left(\left(0,0,0\right),\left(1,2,k\right)\right)\right)
```
````

What happened:

- The compiler emits the expressions and bounds, plus two `expect` entries.
- After render, the verifier confirms every compiled field arrived, confirms the viewport equals `%view`, and evaluates `m` to check it lies in `(0, 6)`.
- With `k=3`, `m = √14 ≈ 3.74`, so it passes. If a bad edit changed the vector to `(1,2,k*100)`, `m` would exceed 6 and the app would show `E_EXPECT_FAILED` naming `m`, the range `(0,6)` and the actual value.
- Whether `\operatorname{mag}` exists in Desmos 3D is ◦; the example shows the mechanism, and the analysis step would report `E_ANALYSIS` on `m` if the function is unavailable.

---

## 11. Open decisions

| Item | Current choice |
|---|---|
| `inv` vs `hidden` | `hidden` is canonical, `inv` is an alias |
| Label rendering of ids like `n_0` | Shown literally. Use `label="n₀"` to override |
| Id type | Always string ✓ (closed) |
| Slider and domain bounds type | LaTeX strings ✓ (closed) |
| 3D constructor name (`Desmos.Calculator3D`) | ◦ verify; the loader probes for it (§12.3) |
| Vector LaTeX syntax (`\operatorname{vector}`) | ◦ verify; template lives in one constant so it can be changed in one place |
| `%camera` | ◦ may not exist in the API; fails with `E_CAPABILITY` if so |
| `%const` | Reserved, not implemented |
| `%image` | Out of scope for v1 |
| Vector fields, implicit surfaces, slice planes | Out of scope for v1 |
| Slider animation keys | Not in v1 |
| `expressionAnalysis` and bounds-read shapes (§12.4, §12.5) | ◦ verify against the live API before locking |
| Verifier default mode | `strict` in dev builds, `lenient` in production |

---

## 12. Verification and error handling

> **Design target, not current behavior:** this section describes the planned full verification pipeline. The implementation status above lists the narrower checks and directives currently supported.

Goal: the app must always know whether the pipeline produced a **graph** or an **error**, and when it is an error, say exactly what and where. Nothing fails silently. The pipeline, the error object and the UI are shared with DESMOS-2D; this section lists what changes for 3D.

### 12.1 Pipeline

```
source ──compile──▶ output ──load API──▶ init ──probe──▶ apply ──analyze──▶ verify ──▶ graph
   │                   │          │         │        │         │            │
   └───────────── any failure at any phase ─┴─────────┴─────────┴────────────┴──▶ DesmosError[] ──▶ error panel
```

`probe` is new in the 3D pipeline: a capability check between init and apply (§12.3). `analyze` and `verify` collect **all** problems before reporting.

### 12.2 Error object

```ts
type Phase = "compile" | "load" | "init" | "probe" | "apply" | "analyze" | "verify";
type Severity = "error" | "warning";

interface DesmosError {
  phase: Phase;
  severity: Severity;
  code: string;          // stable, e.g. "E_DUP_ID", "E_CAPABILITY", "E_VERIFY_MISMATCH"
  message: string;       // human-readable, one sentence
  id?: string;           // expression id, when the problem belongs to one
  line?: number;         // source line (compile phase)
  col?: number;
  field?: string;        // JSON field involved, e.g. "sliderBounds.max", "bounds.zmax"
  expected?: unknown;    // verify phase
  actual?: unknown;      // verify phase
  detail?: string;       // raw API message or stack, shown collapsed
}

type Result =
  | { ok: true;  calc: any; warnings: DesmosError[] }
  | { ok: false; errors: DesmosError[]; warnings: DesmosError[] };
```

`ok: true` means a calculator exists **and** passed verification. A calculator that rendered but failed verification is `ok: false`, and the partial graph is still shown beneath the error banner (§12.7).

### 12.3 Load, init and probe: did the API send a graph?

| Check | Failure code | Meaning |
|---|---|---|
| Script tag `onerror` fired, or no load within the timeout (default 10 s) | `E_API_LOAD` | Network, blocked CDN, or wrong URL |
| `typeof Desmos === "undefined"` after load | `E_API_MISSING` | Script ran but did not define the global (a bad or missing API key often looks like this) ◦ |
| `typeof Desmos.Calculator3D !== "function"` | `E_API_NO_3D` | API version loaded has no 3D calculator ◦ |
| `Desmos.Calculator3D(el, options)` throws | `E_INIT_THROW` | Bad options or a detached element. `detail` holds the exception message |
| Constructor returned something without `setExpressions` | `E_INIT_INVALID` | Not a calculator object |
| No mounted DOM (`.dcg-container` or canvas) after one animation frame | `E_INIT_NO_DOM` | Object exists but never mounted ◦ |
| WebGL unavailable (`canvas.getContext("webgl")` is null) | `E_NO_WEBGL` | 3D needs WebGL; reported with an explanation instead of a blank box |

**Capability probe.** Before apply, the renderer checks that every method the compiled output needs actually exists, so a missing 3D method becomes a precise error:

| Output needs | Probe | Code if missing |
|---|---|---|
| `settings` | `typeof calc.setGraphSettings === "function"` | `E_CAPABILITY` |
| `bounds` | `typeof calc.setMathBounds === "function"` | `E_CAPABILITY` |
| `camera` | `typeof calc.setCamera === "function"` ◦ (name unknown) | `E_CAPABILITY` |
| any `drag` with a `z` axis | feature test on the drag-mode constants | `E_CAPABILITY` |
| any `getState` based verification | `typeof calc.getState === "function"` | downgrades `verify` to `off` with `W_VERIFY_UNAVAILABLE` |

`E_CAPABILITY` messages name the missing method and the DSL key that required it, for example: "`%camera` needs a camera method, which this Desmos API version does not expose."

The loader code from DESMOS-2D §12.3 is reused unchanged, with the extra `E_API_NO_3D` and `E_NO_WEBGL` checks after the global is defined.

### 12.4 Apply and analyze: did our expressions work?

`setExpressions` does **not** throw on bad LaTeX. Desmos records the problem per expression, so the renderer asks.

1. Wrap the apply calls in `try/catch`. A throw becomes `E_APPLY_THROW` with `detail`.
2. Wait for the calculator to settle, then read `calc.expressionAnalysis` ◦.
3. For every compiled expression id:

| Analysis result | Code | Severity |
|---|---|---|
| `isError: true` | `E_ANALYSIS` | error. `message` is Desmos's `errorMessage`, `id` names the expression |
| Entry missing for a compiled id | `E_ANALYSIS_MISSING` | error. Expression dropped or id rewritten |
| `isGraphable: false` on a line that is not a slider, definition, folder, note or `hidden` | `W_NOT_GRAPHABLE` | warning |
| `uDomain`/`vDomain` set but the expression is not a parametric surface | `W_DOMAIN_TARGET` | warning |
| `%vector` expression analysed as something other than a vector | `E_VECTOR_ANALYSIS` | error. Template did not produce a vector, which means the ◦ vector syntax is wrong for this API version |
| Hidden line reported as visible | `W_VISIBILITY` | warning |

`E_VECTOR_ANALYSIS` is the early-warning check for the single riskiest assumption in the spec. If it fires on every `%vector`, change the one template constant and nothing else.

### 12.5 Verify: is the conversion correct?

Round-trip comparison. The compiled output is **expected**; the calculator's own state is **actual**.

```js
const expected = out.expressions;
const actual   = calc.getState().expressions.list;   // ✓ getState, ◦ exact shape
```

| Check | Code | Compares |
|---|---|---|
| Same set of ids, no extras, no missing | `E_VERIFY_IDS` | `expected[].id` vs `actual[].id` (as strings) |
| Same order | `W_VERIFY_ORDER` | index of each id |
| `latex` equal | `E_VERIFY_MISMATCH` | whitespace-normalized only, never reparsed |
| `sliderBounds` equal | `E_VERIFY_MISMATCH` | `min`, `max`, `step` as strings |
| Every other styling field present in `expected` | `E_VERIFY_MISMATCH` | each field must exist and be equal in `actual` |
| Field present in `actual` but absent in `expected` | none | Desmos adds defaults. Ignored |
| Viewport equals `%view` | `E_VERIFY_BOUNDS` | six-value comparison, below |
| Settings equal `%settings` | `E_VERIFY_SETTINGS` | `calc.settings` ◦ vs `out.settings` |
| Vector latex equals the template output | `E_VERIFY_VECTOR` | re-run the template on the DSL components and compare with `actual.latex` (catches a template or splice bug independent of Desmos) |

**Bounds check (3D).** The viewport is read back and compared per axis with a tolerance.

```js
const vb = readBounds3D(calc);     // { xmin, xmax, ymin, ymax, zmin, zmax } ◦ read method unknown
const keys = ["xmin","xmax","ymin","ymax","zmin","zmax"].filter(k => k in out.bounds);
for (const k of keys) {
  const span = Math.abs(out.bounds[k.replace("min","max")] - out.bounds[k.replace("max","min")]) || 1;
  const tol  = 1e-6 * Math.max(1, span);
  if (Math.abs(vb[k] - out.bounds[k]) > tol)
    errors.push({ phase: "verify", severity: "error", code: "E_VERIFY_BOUNDS",
      message: `Viewport ${k} is ${vb[k]}, expected ${out.bounds[k]}`,
      field: `bounds.${k}`, expected: out.bounds[k], actual: vb[k] });
}
```

If the API provides no way to read the 3D viewport back, `E_VERIFY_BOUNDS` cannot run; the verifier emits `W_VERIFY_UNAVAILABLE` with `field: "bounds"` and continues. If Desmos adjusts the box to preserve aspect ratio (◦), the check compares **containment** (requested box fully inside the actual viewport) and downgrades equality failures to `W_VERIFY_BOUNDS_ASPECT`.

**`%verify` modes**

| Mode | Behavior |
|---|---|
| `strict` | Every `E_VERIFY_*` is an error. The error panel is shown |
| `lenient` | `E_VERIFY_*` are warnings. Graph shown with a warning badge |
| `off` | Verification skipped. Load, init, probe, apply and analyze checks still run |

Default: `strict` in dev builds, `lenient` in production. An explicit `%verify` line wins.

### 12.6 `%expect`: author-declared bounds on values

```
%expect <id> [x=(min,max)] [y=(min,max)] [z=(min,max)] [value=(min,max)] [norm=(min,max)] [defined]
```

| Key | Applies to | Check |
|---|---|---|
| `value=(min,max)` | scalar definitions (`a=1`, sliders, `m=...`) | numeric value inside the range |
| `x=`, `y=`, `z=` | 3D points | each coordinate inside its range |
| `norm=(min,max)` | `%vector` and 3-tuples | Euclidean length of the head-minus-tail (or of the tuple) inside the range |
| `defined` | any | analysis says it evaluated (not `isError`, not undefined) |

Values are read through `calc.HelperExpression({ latex })` ◦ and its `numericValue` / `listValue` ✓. For `norm=` on a `%vector`, the renderer creates **two** helper expressions, one per endpoint, and computes the length itself, so it does not depend on Desmos having a magnitude function. Range bounds are real numbers.

Failure code: `E_EXPECT_FAILED`, with `id`, `expected` (the range), `actual` (the value), and `field` naming which key (`norm`, `z`, ...) failed.

An `%expect` that targets an unknown id is a compile error (`E_NO_EXPECT_TARGET`). Expectations on `hidden` expressions are allowed.

### 12.7 What the app shows

| Outcome | UI |
|---|---|
| `ok: true`, no warnings | Graph only |
| `ok: true`, warnings | Graph plus a small badge, "N warnings", expandable |
| `ok: false`, calculator exists | Red banner above the partially rendered graph listing each error with `phase`, `code`, `id`, `message`, and `expected` vs `actual` when present |
| `ok: false`, no calculator (compile, load, init, probe failures) | Error panel **in place of** the graph, same listing, plus the original source in a collapsed block |
| `E_NO_WEBGL` | Error panel with a one-line explanation that 3D needs WebGL |

Each listed error shows `code · phase · id`, then `message`, then a collapsed `detail`. Compile errors also show `line:col` and the offending source line with a caret. The same `DesmosError[]` is logged with `console.error` and exposed on the container element (`el.__desmosErrors`).

The renderer must **never**:

- leave an empty container with no message,
- swallow an exception,
- report success because `setExpressions` returned without throwing,
- silently drop a DSL key the API lacks (it raises `E_CAPABILITY` instead).

### 12.8 Reference renderer skeleton

```js
async function renderDesmos3D(el, source, opts) {
  const warnings = [];
  const c = compile3D(source);                       // { out } | { errors }
  if (c.errors) return fail(el, c.errors, warnings, source);
  warnings.push(...c.out.diagnostics);

  const loadErr = await loadDesmos(opts.src);        // shared with 2D
  if (loadErr) return fail(el, [loadErr], warnings, source);
  if (typeof Desmos.Calculator3D !== "function")
    return fail(el, [err("load", "E_API_NO_3D", "This Desmos API build has no 3D calculator")], warnings, source);
  if (!hasWebGL())
    return fail(el, [err("init", "E_NO_WEBGL", "3D rendering needs WebGL, which is unavailable")], warnings, source);

  let calc;
  try { calc = Desmos.Calculator3D(el, c.out.options); }
  catch (e) { return fail(el, [err("init", "E_INIT_THROW", "Calculator3D threw", { detail: String(e) })], warnings, source); }
  if (typeof calc?.setExpressions !== "function")
    return fail(el, [err("init", "E_INIT_INVALID", "Constructor did not return a calculator")], warnings, source);

  const probeErrs = probe(calc, c.out);              // E_CAPABILITY list
  if (probeErrs.some(e => e.severity === "error")) return fail(el, probeErrs, warnings, source, calc);

  try {
    if (c.out.settings) calc.setGraphSettings(c.out.settings);
    calc.setExpressions(c.out.expressions);
    if (c.out.bounds) calc.setMathBounds(c.out.bounds);
    if (c.out.camera) applyCamera(calc, c.out.camera);
  } catch (e) {
    return fail(el, [err("apply", "E_APPLY_THROW", "Applying state threw", { detail: String(e) })], warnings, source, calc);
  }

  await settle(calc);
  const errors = [
    ...probeErrs,
    ...analyze(calc, c.out),
    ...(c.out.verify === "off" ? [] : verify3D(calc, c.out)),
    ...checkExpect3D(calc, c.out.expect),
  ];
  const hard = errors.filter(x => x.severity === "error");
  const soft = errors.filter(x => x.severity === "warning");
  if (hard.length) return fail(el, hard, [...warnings, ...soft], source, calc);
  return { ok: true, calc, warnings: [...warnings, ...soft] };
}
```

### 12.9 Test matrix

| Input | Expected result |
|---|---|
| Valid block | `ok: true`, no warnings |
| Duplicate id, including one from `%vector` | `E_DUP_ID` with `line` |
| `%vector` with a 2-component tuple | `E_VECTOR_ARITY` |
| `%vector` with both `from` and `dir` | `E_VECTOR_FORM` |
| `%vector` whose component is `-1` or `a+b` | Head wrapped in `\left(...\right)`, verify passes |
| Vector template wrong for this API version | `E_VECTOR_ANALYSIS` on every vector, one constant to fix |
| 2D-only key `polarDomain` | `E_2D_ONLY` |
| Network blocked | `E_API_LOAD`, error panel, source shown |
| API loaded without 3D | `E_API_NO_3D` |
| No WebGL | `E_NO_WEBGL`, error panel |
| `%camera` with no camera method | `E_CAPABILITY` naming `%camera` |
| Invalid LaTeX in one expression | `E_ANALYSIS` naming that id, rest still drawn, banner shown |
| `slider=(0,5)` on `b=3` | `sliderBounds` `{min:"0",max:"5"}`, verify passes |
| Numeric-looking id `@1` | Emitted as `"1"`, verify passes |
| `%view` with `z=(3,3)` | `E_VIEW_RANGE` |
| Viewport not readable | `W_VERIFY_UNAVAILABLE`, rest of verify still runs |
| `%expect a [norm=(0,2)]` with `|a| = 3.7` | `E_EXPECT_FAILED`, `field: "norm"`, `expected (0,2)`, `actual 3.74` |

## Reader fixture

Use this block to smoke-test the 3D reader integration:

```desmos3d
@sphere: x^2+y^2+z^2=9
```

Expected: a 3D surface appears. Also test a browser without WebGL and malformed DSL; the reader should show an explicit error state.
| Compiler drops a field (bug) | `E_VERIFY_MISMATCH` naming `id` and `field` |