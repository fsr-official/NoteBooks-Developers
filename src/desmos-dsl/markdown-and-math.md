# Markdown and mathematics

This page checks common Markdown structures and KaTeX math in the reader.

## Inline math

The identity \(a^2+b^2=c^2\) is inline.

## Display math

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$

## Lists and tables

- A nested list
  - with a child item
- A [link to the AI Usage Policy](https://notebooks-framework.vercel.app/ai-usage-policy)

| Input | Expected |
| --- | --- |
| `**bold**` | Bold on the same line |
| `$x^2$` | Inline mathematics |
| A fenced code block | Monospaced code |

```text
Render this as code, not as executable content.
```
