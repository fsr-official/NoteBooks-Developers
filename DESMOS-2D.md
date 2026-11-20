# DESMOS-2D

A small declarative language for `desmos` code blocks. It compiles to Desmos API calls so the renderer can control ids, labels, colors, visibility, slider bounds and more, without parsing LaTeX.

**Implementation status:** the compiler and reader integration are present. The latest audit does not independently certify live rendering or expression-analysis behavior; complete the browser/API checks before treating the path as fully verified.

Validation reference: [Desmos API v1.11 documentation](https://www.desmos.com/api/v1.11/docs/index.html).

**Status legend** (used in every table below)

- ✓ = confirmed against the Desmos API docs, or confirmed by the project owner
- ◦ = from memory of the API reference, **verify before locking the schema**

Implementation note: the initial parser is limited to expression, text, and table states accepted by the documented `setExpressions` API. Folder serialization and render-time verification directives are rejected until their API behavior is established.

---

## 1. Design rules

1. **LaTeX is never parsed.** Everything after the first `:` of a header is the LaTeX payload, verbatim.
2. **Metadata comes before the LaTeX**, inside `[ ... ]`.
3. **Backwards compatible.** A line with no `@` header is plain LaTeX and gets an auto id.
4. **The id is the label.** `showLabel` alone displays the id. `label="..."` overrides it.
5. **No silent fallbacks.** Unknown attributes, bad enum values and duplicate ids are compile errors.
6. **Single source of truth.** Shared styles live in `%preset` and are referenced with `use=`. No repeated magic values.
7. **Never render blank.** Every failure, at compile time or at render time, surfaces as a visible, structured error in the app (§12). A graph that silently fails to appear is a bug.

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

### Tokenizing rules

| Rule | Detail |
|---|---|
| Fence | Language tag is `desmos` |
| Attribute split | Top-level commas only. Commas inside `( )`, `{ }` and `"..."` do **not** split |
| Header regex | `^@([A-Za-z0-9_]+)\s*(?:\[(.*)\])?\s*:\s*(.*)$`. The attr list is tokenized with a quote/paren-aware scanner, not by regex |
| Continuation | A header that ends with `:` takes the next non-empty line as its LaTeX |
| Comments | `//` starts a comment only when preceded by whitespace and outside quotes |
| Flags | A bare key (`showLabel`) means `true` |
| Directive args | Whitespace-separated `key=value`, respecting `( )`, `{ }` and quotes |

### Ids ✓ (confirmed)

- Must match `[A-Za-z0-9_]+` (Desmos requires a valid JS property name: letters, digits, `_`).
- No `-`.
- Ids are always **strings** in the output JSON. Purely numeric ids such as `1` are allowed and are emitted as `"1"`. The compiler never emits a numeric id, and the renderer never coerces one.
- Plain LaTeX lines get `auto_1`, `auto_2`, ... The prefix `auto_` is reserved.
- Duplicate ids are an error.

---

## 3. Expression attributes

Applied to `@id [ ... ]: latex` lines. Compiles to one object in `setExpressions([...])`.

| DSL key | JSON field | Value | Status |
|---|---|---|---|
| `@id` | `id` | `[A-Za-z0-9_]+`, always a string | ✓ |
| *(latex after `:`)* | `latex` | string, verbatim | ✓ |
| `hidden` (alias `inv`, or `color=inv`) | `hidden` | flag, `true`. All three forms hide the expression | ✓ |
| `color=` (alias `colour=`) | `color` | hex `#rrggbb`, or a name from §4. The special value `inv` means invisible: it emits `hidden: true` and **no** `color` field | ✓ |
| `slider=(min,max,step)` | `sliderBounds` `{min,max,step}` | LaTeX strings. `(min,max)` omits `step`, so the slider is continuous | ✓ |
| `domain=(min,max)` | — | Not an API field; use `parametricDomain` or `polarDomain` | — |
| `drag=` (alias `dragMode=`) | `dragMode` | `none` `x` `y` `xy` `auto` | ✓ |
| `showLabel` | `showLabel: true`, plus `label: <id>` | flag; id-label behavior is a DSL convenience | ✓ |
| `label="..."` | `label` | string, overrides the id-as-label default | ✓ |
| `labelSize=` | `labelSize` | LaTeX string | ✓ |
| `labelOrientation=` | `labelOrientation` | `default` `above` `below` `left` `right` | ✓ |
| `lineStyle=` | `lineStyle` | `solid` `dashed` `dotted` | ✓ |
| `lineWidth=` | `lineWidth` | number > 0 | ✓ |
| `lineOpacity=` | `lineOpacity` | number, 0..1 | ✓ |
| `pointStyle=` | `pointStyle` | `point` `open` `cross` `square` `plus` `triangle` `diamond` `star` | ✓ |
| `pointSize=` | `pointSize` | number > 0 | ✓ |
| `pointOpacity=` | `pointOpacity` | number, 0..1 | ✓ |
| `fill` | `fill` | flag | ✓ |
| `fillOpacity=` | `fillOpacity` | number, 0..1 | ✓ |
| `parametricDomain=(min,max)` | `parametricDomain` `{min,max}` | LaTeX strings | ✓ |
| `polarDomain=(min,max)` | `polarDomain` `{min,max}` | LaTeX strings | ✓ |
| `secret` | `secret` | flag, hides it from the expression list | ✓ |
| `folder=name` | — | Unsupported until folder state serialization is verified | — |
| `cdf=(min,max)` | — | Not listed in the v1.11 expression API | — |
| `use=name` | *(compiler-only)* | applies a `%preset` | n/a |

Notes:

- Slider and domain bounds are **LaTeX strings** ✓ (confirmed). Numbers are coerced to strings. The compiler keeps `slider=(0,2\pi,0.1)` as raw strings and never converts them to numbers, and the verifier (§12.5) compares them as strings.
- `slider` only takes effect on lines of the form `name=constant`. Anything else is a warning.
- `drag` only works on free points (coordinates that are plain numbers). On a dependent point it is a warning.
- Merge order: preset values first, then inline attributes. Inline wins.

---

## 4. Enum and color maps

| DSL value | Desmos value | Status |
|---|---|---|
| `red` | `#c74440` (`Desmos.Colors.RED`) | ✓ |
| `blue` | `#2d70b3` (`Desmos.Colors.BLUE`) | ✓ |
| `green` | `#348543` (`Desmos.Colors.GREEN`) | ✓ |
| `purple` | `#6042a6` (`Desmos.Colors.PURPLE`) | ✓ |
| `orange` | `#fa7e19` (`Desmos.Colors.ORANGE`) | ✓ |
| `black` | `#000000` (`Desmos.Colors.BLACK`) | ✓ |
| `inv` | *(no color)*, sets `hidden: true` | n/a (compiler rule) |
| `drag=xy` etc. | `Desmos.DragModes.XY` etc. | ✓ |
| `lineStyle=dashed` etc. | `Desmos.Styles.DASHED` etc. | ✓ |
| `pointStyle=open` etc. | `Desmos.Styles.OPEN` etc. | ✓ |

The compiler resolves names to the actual strings or constants at compile time. Unknown names are errors.

---

## 5. Block directives

Start with `%`. Arguments are whitespace-separated.

### `%folder` (deferred)

The v1.11 `setExpressions` reference documents `expression`, `text`, and `table` states, but does not document folder states. The initial parser reports `%folder` and `folder=` as unsupported rather than passing an unverified state to Desmos.

### `%note`

```
%note <id>: plain text
```

Compiles to `{ "type": "text", "id": <id>, "text": ... }` ✓. The text is plain, not LaTeX.

### `%table`

```
%table <id>
  col latex=x_1 values=(1,2,3) color=blue points lines drag=xy
  col latex=y_1 values=(1,4,9)
```

Compiles to `{ "type": "table", "id": <id>, "columns": [ ... ] }`.
Column keys: `latex`, `values`, `color`, `hidden`, `points`, `lines`, `lineStyle`, `lineWidth`, `lineOpacity`, `pointStyle`, `pointSize`, `pointOpacity`, and `dragMode` ✓. The deprecated `columnMode` is not accepted; use `points` and `lines`.

---

## 6. Graph-level directives

| Directive | Compiles to | Status |
|---|---|---|
| `%options <flag>...` | `Desmos.GraphingCalculator(el, options)` | ✓ |
| `%view x=(l,r) y=(b,t)` | `calc.setMathBounds({ left, right, bottom, top })` | ✓ |
| `%settings key=value ...` | `calc.updateSettings({ ... })` | ✓ |
| `%expect <id> ...` | Deferred; rejected by the initial parser | n/a |
| `%verify <mode>` | Deferred; rejected by the initial parser | n/a |

**`%options` flags:** `lockViewport`, `expressionsCollapsed`, `keypad`, `graphpaper`, `expressions`, `settingsMenu`, `zoomButtons`, `border`, `pointsOfInterest`, `expressionsTopbar`, `singleVariableSolutions`, `images`, `folders`, `administerSecretFolders`, `authorFeatures` ✓. Use `key=false` to turn off defaults, for example `keypad=false`.

**`%settings` keys:**

| Key | Value | Status |
|---|---|---|
| `xAxisArrowMode`, `yAxisArrowMode` | `none` `positive` `both` | ✓ |
| `xAxisLabel`, `yAxisLabel` | string | ✓ |
| `degreeMode` | `true` / `false` | ✓ |
| `showGrid`, `showXAxis`, `showYAxis`, `polarMode`, `xAxisScale`, `yAxisScale` | — | Deferred until verified |

`%view` numbers are real numbers. Unlike slider bounds, they are not LaTeX strings. Bounds must satisfy `l < r` and `b < t`, otherwise it is a compile error (`E_VIEW_RANGE`).

---

## 7. Compiler-only directives

| Directive | Purpose |
|---|---|
| `%preset <name> key=value ...` | Defines a reusable attribute set. Referenced by `use=<name>`. A preset may not reference another preset |
| `%const <name> = <value>` | **Reserved, not implemented.** Compile-time substitution to avoid magic numbers |

Presets must be declared before use. An unknown preset name is an error.

---

## 8. Validation (compile time)

| Condition | Result | Code |
|---|---|---|
| Duplicate id | error | `E_DUP_ID` |
| Id not matching `[A-Za-z0-9_]+` or using the `auto_` prefix | error | `E_BAD_ID` |
| Unknown attribute key | error | `E_UNKNOWN_ATTR` |
| Unknown enum or color name, malformed hex | error | `E_BAD_ENUM` |
| Opacity outside 0..1, size or width ≤ 0 | error | `E_BAD_RANGE` |
| `%folder` or `folder=` | error | `E_UNSUPPORTED_DIRECTIVE` |
| `use=` names an undeclared preset | error | `E_NO_PRESET` |
| Both `color` and `colour` given on one line | error | `E_DUP_COLOR` |
| `%view` with `l ≥ r` or `b ≥ t` | error | `E_VIEW_RANGE` |
| `showLabel` on a `hidden` expression | warning | `W_HIDDEN_LABEL` |

Every entry carries a source location (`line`, `col`) and the offending `id` when there is one.

---

## 9. Compile target

The compiler outputs one object. The renderer applies it in this order:

```json
{
  "options":     { },
  "settings":    { },
  "expressions": [ ],
  "bounds":      { }
}
```

```js
const calc = Desmos.GraphingCalculator(el, out.options);
calc.updateSettings(out.settings);
calc.setExpressions(out.expressions);
if (out.bounds) calc.setMathBounds(out.bounds);
```

The snippet above is the **happy path only**. The renderer never calls it bare; it goes through the guarded pipeline in §12.

`updateSettings`, `setExpressions`, and `setMathBounds` are documented in v1.11. `setGraphSettings` exists but is deprecated.
Empty `options`, `settings`, and `bounds` are omitted. Compile diagnostics are returned separately from `output`; errors prevent an output object.

---

## 10. Examples

### Example 1: slider-driven curve with a point

**Source**

````
```desmos
@k   [color=inv]:                             k=0.4136
@n0  [slider=(1,10,1)]:                       n_{0}=5
@f   [color=blue, lineWidth=3, showLabel]:    f\left(n\right)=k\left(n-n_{0}\right)\left\{n\ge n_{0}\right\}
@now [slider=(1,10,0.5)]:                     n_{now}=7
@P   [color=red, pointSize=12, labelOrientation=above, showLabel]:
     P=\left(n_{now},f\left(n_{now}\right)\right)
```
````

**Compiled**

```json
{
  "expressions": [
    { "id": "k",   "latex": "k=0.4136", "hidden": true },
    { "id": "n0",  "latex": "n_{0}=5",
      "sliderBounds": { "min": "1", "max": "10", "step": "1" } },
    { "id": "f",   "latex": "f\\left(n\\right)=k\\left(n-n_{0}\\right)\\left\\{n\\ge n_{0}\\right\\}",
      "color": "#2d70b3", "lineWidth": 3, "showLabel": true, "label": "f" },
    { "id": "now", "latex": "n_{now}=7",
      "sliderBounds": { "min": "1", "max": "10", "step": "0.5" } },
    { "id": "P",   "latex": "P=\\left(n_{now},f\\left(n_{now}\\right)\\right)",
      "color": "#c74440", "pointSize": 12, "labelOrientation": "above",
      "showLabel": true, "label": "P" }
  ]
}
```

What happened:

- `color=inv` became `hidden: true` with no `color` field. The bare flag `inv` and the flag `hidden` compile identically.
- Slider tuples became `sliderBounds` strings.
- `showLabel` produced `label` equal to the id.
- The `@P` header ended in `:`, so its LaTeX came from the next line.

### Example 2: presets, view, settings, plain line

**Source**

````
```desmos
%options lockViewport
%view x=(-2,12) y=(-2,10)
%settings xAxisLabel="n" degreeMode=false

%preset curve color=blue lineWidth=3
%preset ghost color=#888888 lineStyle=dashed lineOpacity=0.6

%note params: Parameter definitions for this graph.
@a    [slider=(0,2,0.1)]:   a=1
@b    [slider=(0,5)]:       b=3
@g    [use=curve, showLabel]:              g\left(x\right)=a\sin\left(x\right)+b
@base [use=ghost]:                         y=b
@Q    [color=red, pointSize=10, drag=xy, showLabel]:   Q=\left(2,2\right)
@C    [parametricDomain=(0,2\pi), color=purple]:       \left(5+2\cos\left(t\right),5+2\sin\left(t\right)\right)
y=0
```
````

**Compiled**

```json
{
  "options":  { "lockViewport": true },
  "settings": { "xAxisLabel": "n", "degreeMode": false },
  "expressions": [
    { "id": "params", "type": "text", "text": "Parameter definitions for this graph." },
    { "id": "a", "latex": "a=1",
      "sliderBounds": { "min": "0", "max": "2", "step": "0.1" } },
    { "id": "b", "latex": "b=3",
      "sliderBounds": { "min": "0", "max": "5" } },
    { "id": "g", "latex": "g\\left(x\\right)=a\\sin\\left(x\\right)+b",
      "color": "#2d70b3", "lineWidth": 3, "showLabel": true, "label": "g" },
    { "id": "base", "latex": "y=b",
      "color": "#888888", "lineStyle": "DASHED", "lineOpacity": 0.6 },
    { "id": "Q", "latex": "Q=\\left(2,2\\right)",
      "color": "#c74440", "pointSize": 10, "dragMode": "XY",
      "showLabel": true, "label": "Q" },
    { "id": "C",
      "latex": "\\left(5+2\\cos\\left(t\\right),5+2\\sin\\left(t\\right)\\right)",
      "parametricDomain": { "min": "0", "max": "2\\pi" }, "color": "#6042a6" },
    { "id": "auto_1", "latex": "y=0" }
  ],
  "bounds": { "left": -2, "right": 12, "bottom": -2, "top": 10 }
}
```

What happened:

- `use=curve` and `use=ghost` expanded the presets, with inline keys winning on conflict.
- `slider=(0,5)` has no step, so `step` is omitted and the slider is continuous.
- The comma inside `(0,2\pi)` did not split the attribute list.
- `%note` creates a Desmos text state.
- The plain `y=0` line got `auto_1`.

### Example 3: deferred render-time checks

**Source**

````
```text
%view x=(0,12) y=(0,6)
%verify strict
%expect P   [x=(1,10), y=(0,6)]
%expect now [value=(1,10)]

@n0  [slider=(1,10,1)]:    n_{0}=5
@now [slider=(1,10,0.5)]:  n_{now}=7
@f   [color=blue]:         f\left(n\right)=0.4136\left(n-n_{0}\right)\left\{n\ge n_{0}\right\}
@P   [color=red, showLabel]:  P=\left(n_{now},f\left(n_{now}\right)\right)
```
````

This illustrates planned verification syntax only. `%verify` and `%expect` currently produce `E_UNSUPPORTED_DIRECTIVE` and do not compile.

---

## 11. Open decisions

| Item | Current choice |
|---|---|
| `inv` vs `hidden` | `hidden` is canonical, `inv` is an alias |
| Label rendering of ids like `n_0` | Shown literally. Use `label="n₀"` to override |
| Id type | Always string ✓ (closed) |
| Slider and domain bounds type | LaTeX strings ✓ (closed) |
| `%const` | Reserved, not implemented |
| `%image` | Out of scope for v1 |
| Slider animation keys (`isPlaying`, `animationPeriod`, `loopMode`) | Not in v1 |
| `expressionAnalysis` shape (§12.4) | ◦ Verify against the live API before locking |
| Verifier default mode | `strict` in dev builds, `lenient` in production (§12.5) |

---

## 12. Verification and error handling (planned)

Goal: the app must always know whether the pipeline produced a **graph** or an **error**, and when it is an error, say exactly what and where. Nothing fails silently.

The current reader reports compile failures and Desmos load/init/apply failures. Analysis, round-trip verification, and `%expect` checks described below remain future work; the snippets and behaviors in this section are design targets, not implemented functionality.

### 12.1 Pipeline

```
source ──compile──▶ output ──load API──▶ init ──apply──▶ analyze ──verify──▶ graph
   │                  │          │          │        │          │
   └───────────── any failure at any phase ─┴────────┴──────────┴──▶ DesmosError[] ──▶ error panel
```

Each phase either passes or produces one or more `DesmosError` objects. A phase that fails stops later phases that depend on it, except `analyze` and `verify`, which collect **all** problems before reporting.

### 12.2 Error object

```ts
type Phase = "compile" | "load" | "init" | "apply" | "analyze" | "verify";
type Severity = "error" | "warning";

interface DesmosError {
  phase: Phase;
  severity: Severity;
  code: string;          // stable, e.g. "E_DUP_ID", "E_ANALYSIS", "E_VERIFY_MISMATCH"
  message: string;       // human-readable, one sentence
  id?: string;           // expression id, when the problem belongs to one
  line?: number;         // source line (compile phase)
  col?: number;
  field?: string;        // JSON field involved, e.g. "sliderBounds.max"
  expected?: unknown;    // verify phase
  actual?: unknown;      // verify phase
  detail?: string;       // raw API message or stack, shown collapsed
}

type Result =
  | { ok: true;  calc: Desmos.Calculator; warnings: DesmosError[] }
  | { ok: false; errors: DesmosError[];   warnings: DesmosError[] };
```

`ok: true` means a calculator exists **and** passed verification. A calculator that rendered but failed verification is `ok: false` and the partial graph is still shown beneath the error banner (§12.7).

### 12.3 Load and init: did the API send a graph?

The Desmos API is a remote script. It can fail before any of our code runs, so the renderer checks each step.

| Check | Failure code | Meaning |
|---|---|---|
| Script tag `onerror` fired, or no load within the timeout (default 10 s) | `E_API_LOAD` | Network, blocked CDN, or wrong URL |
| `typeof Desmos === "undefined"` after load | `E_API_MISSING` | Script ran but did not define the global (bad or missing API key often looks like this) ◦ |
| `Desmos.GraphingCalculator(el, options)` throws | `E_INIT_THROW` | Bad options or a detached element. `detail` holds the exception message |
| Constructor returned something without `setExpressions` | `E_INIT_INVALID` | Not a calculator object |
| `el.querySelector(".dcg-container")` is null after one animation frame | `E_INIT_NO_DOM` | Calculator object exists but never mounted ◦ |

```js
async function loadDesmos(src, timeoutMs = 10000) {
  if (typeof Desmos !== "undefined") return null;
  return new Promise((resolve) => {
    const s = document.createElement("script");
    const t = setTimeout(() => resolve(err("load", "E_API_LOAD", "Desmos API did not load in time")), timeoutMs);
    s.onload  = () => { clearTimeout(t); resolve(typeof Desmos === "undefined"
                  ? err("load", "E_API_MISSING", "Script loaded but Desmos global is undefined") : null); };
    s.onerror = () => { clearTimeout(t); resolve(err("load", "E_API_LOAD", "Desmos script failed to load", { detail: src })); };
    s.src = src;
    document.head.appendChild(s);
  });
}
```

### 12.4 Apply and analyze: did our expressions work?

`setExpressions` does **not** throw on bad LaTeX. Desmos accepts the state and records the problem per expression. So the renderer must ask.

1. Wrap the three apply calls in `try/catch`. A throw becomes `E_APPLY_THROW` with `detail`.
2. After applying, wait for the calculator to settle (one `calc.observeEvent("change", ...)` tick, or `calc.asyncScreenshot` as a settle barrier ◦), then read `calc.expressionAnalysis` ◦.
3. For every compiled expression id, look at its analysis entry:

| Analysis result | Code | Severity |
|---|---|---|
| `isError: true` | `E_ANALYSIS` | error. `message` is Desmos's `errorMessage`, `id` is the failing expression |
| Entry missing for a compiled id | `E_ANALYSIS_MISSING` | error. Expression was dropped or id was rewritten |
| `isGraphable: false` on a line that is not a slider, folder, note, or `hidden` | `W_NOT_GRAPHABLE` | warning. Defined but draws nothing |
| Hidden line reported as visible | `W_VISIBILITY` | warning |

Expected non-graphable lines (plain definitions such as `k=0.4136`, sliders, notes, folders) are exempt from `W_NOT_GRAPHABLE`.

### 12.5 Verify: is the conversion correct?

This is the round-trip check. The compiler's output is the **expected** state; the calculator's own state is the **actual** state. They are compared field by field.

```js
const expected = out.expressions;
const actual   = calc.getState().expressions.list;   // ✓ getState, ◦ exact shape
```

| Check | Code | Compares |
|---|---|---|
| Same set of ids, no extras, no missing | `E_VERIFY_IDS` | `expected[].id` vs `actual[].id` (as strings) |
| Same order | `W_VERIFY_ORDER` | index of each id |
| `latex` equal | `E_VERIFY_MISMATCH` | normalized for whitespace only, never reparsed |
| `sliderBounds` equal | `E_VERIFY_MISMATCH` | `min`, `max`, `step` compared **as strings** |
| `hidden`, `color`, `lineStyle`, `lineWidth`, `lineOpacity`, `pointStyle`, `pointSize`, `pointOpacity`, `fillOpacity`, `dragMode`, `label`, `showLabel`, `labelSize`, `labelOrientation`, `folderId`, `domain`, `parametricDomain`, `polarDomain`, `secret`, `cdf` | `E_VERIFY_MISMATCH` | each field present in `expected` must exist and be equal in `actual` |
| Field present in `actual` but absent in `expected` | none | Desmos adds defaults. Ignored |
| Viewport equals `%view` | `E_VERIFY_BOUNDS` | see below |
| Settings equal `%settings` | `E_VERIFY_SETTINGS` | `calc.settings` ◦ vs `out.settings` |

**Bounds check.** When `%view` is present, after `setMathBounds` the renderer reads the real viewport back and compares with a tolerance:

```js
const vb  = calc.graphpaperBounds.mathCoordinates;   // { left, right, bottom, top } ◦
const tol = 1e-6 * Math.max(1, Math.abs(out.bounds.right - out.bounds.left));
for (const k of ["left", "right", "bottom", "top"]) {
  if (Math.abs(vb[k] - out.bounds[k]) > tol) {
    errors.push({ phase: "verify", severity: "error", code: "E_VERIFY_BOUNDS",
      message: `Viewport ${k} is ${vb[k]}, expected ${out.bounds[k]}`,
      field: `bounds.${k}`, expected: out.bounds[k], actual: vb[k] });
  }
}
```

Desmos may adjust the viewport to preserve aspect ratio when the container is not the shape of the requested box (◦ verify). In that case the check compares **containment** (requested box fully inside the actual viewport) and downgrades equality failures to `W_VERIFY_BOUNDS_ASPECT`.

**`%verify` modes**

| Mode | Behavior |
|---|---|
| `strict` | Every `E_VERIFY_*` is an error. The error panel is shown |
| `lenient` | `E_VERIFY_*` are warnings. Graph shown with a warning badge |
| `off` | Verification skipped. Load, init, apply and analyze checks still run |

Default: `strict` in dev builds, `lenient` in production. An explicit `%verify` line wins.

### 12.6 `%expect`: author-declared bounds on values

Lets a block declare what its graph is *supposed* to contain, so a wrong conversion or a wrong number is caught at render time.

```
%expect <id> [x=(min,max)] [y=(min,max)] [value=(min,max)] [defined]
```

| Key | Applies to | Check |
|---|---|---|
| `value=(min,max)` | scalar definitions (`a=1`, sliders) | numeric value inside the range |
| `x=(min,max)`, `y=(min,max)` | points | each coordinate inside its range |
| `defined` | any | analysis says the expression evaluated (not `isError`, not undefined) |

Values are read through a `calc.HelperExpression({ latex: <id-or-name> })` ◦ and its `numericValue` / `listValue` ✓. Range bounds here are real numbers, like `%view`.

Failure code: `E_EXPECT_FAILED`, with `id`, `expected` (the range) and `actual` (the value).

An `%expect` that targets an unknown id is a compile error (`E_NO_EXPECT_TARGET`). Expectations on `hidden` expressions are allowed.

### 12.7 What the app shows

| Outcome | UI |
|---|---|
| `ok: true`, no warnings | Graph only |
| `ok: true`, warnings | Graph plus a small badge, "N warnings", expandable |
| `ok: false`, calculator exists | Red banner above the partially rendered graph listing each error, with `phase`, `code`, `id`, and `message`; `expected` vs `actual` when present |
| `ok: false`, no calculator (compile, load, init failures) | Error panel **in place of** the graph, same listing, plus the original source in a collapsed block |

Each listed error shows `code · phase · id`, then `message`, then a collapsed `detail`. Compile errors also show `line:col` and the offending source line with a caret. The same `DesmosError[]` is logged with `console.error` and exposed on the container element (`el.__desmosErrors`) so it can be inspected or tested.

The renderer must **never**:

- leave an empty container with no message,
- swallow an exception,
- report success because `setExpressions` returned without throwing.

### 12.8 Reference renderer skeleton

```js
async function renderDesmos(el, source, opts) {
  const warnings = [];
  // compile
  const c = compile(source);                       // { out } | { errors }
  if (c.errors) return fail(el, c.errors, warnings, source);
  warnings.push(...c.out.diagnostics);

  // load + init
  const loadErr = await loadDesmos(opts.src);
  if (loadErr) return fail(el, [loadErr], warnings, source);
  let calc;
  try { calc = Desmos.GraphingCalculator(el, c.out.options); }
  catch (e) { return fail(el, [err("init", "E_INIT_THROW", "GraphingCalculator threw", { detail: String(e) })], warnings, source); }
  if (typeof calc?.setExpressions !== "function")
    return fail(el, [err("init", "E_INIT_INVALID", "Constructor did not return a calculator")], warnings, source);

  // apply
  try {
    calc.updateSettings(c.out.settings ?? {});
    calc.setExpressions(c.out.expressions);
    if (c.out.bounds) calc.setMathBounds(c.out.bounds);
  } catch (e) {
    return fail(el, [err("apply", "E_APPLY_THROW", "Applying state threw", { detail: String(e) })], warnings, source, calc);
  }

  // analyze, verify, expect (collect everything)
  await settle(calc);
  const errors = [
    ...analyze(calc, c.out),
    ...(c.out.verify === "off" ? [] : verify(calc, c.out)),
    ...checkExpect(calc, c.out.expect),
  ];
  const hard = errors.filter(x => x.severity === "error");
  const soft = errors.filter(x => x.severity === "warning");
  if (hard.length) return fail(el, hard, [...warnings, ...soft], source, calc);
  return { ok: true, calc, warnings: [...warnings, ...soft] };
}
```

`fail(...)` builds the `Result`, paints the UI from §12.7, logs, and sets `el.__desmosErrors`.

### 12.9 Test matrix

| Input | Expected result |
|---|---|
| Valid block | `ok: true`, no warnings |
| Duplicate id | `E_DUP_ID` with `line` |
| Network blocked | `E_API_LOAD`, error panel, source shown |
| Invalid LaTeX in one expression | `E_ANALYSIS` naming that id, other expressions still drawn, banner shown |
| `slider=(0,5)` on `b=3` | `sliderBounds` `{min:"0",max:"5"}`, verify passes |
| Numeric-looking id `@1` | Emitted as `"1"`, verify passes |
| `%view` with `l ≥ r` | `E_VIEW_RANGE` |
| `%view` on a non-matching aspect container | Containment check passes, `W_VERIFY_BOUNDS_ASPECT` at most |
| `%expect P [x=(1,10)]` with `n_{now}=14` | `E_EXPECT_FAILED`, `expected (1,10)`, `actual 14` |
| Compiler drops a field (bug) | `E_VERIFY_MISMATCH` naming `id` and `field` |