import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { renderMarkdownDocument } from "../utils/markdown-renderer.js";

type HtmlNode = DefaultTreeAdapterMap["node"];
type HtmlElement = DefaultTreeAdapterMap["element"];

const source = readFileSync(new URL("./fixtures/markdown-parity.md", import.meta.url), "utf8");

function isElement(node: HtmlNode): node is HtmlElement {
  return "tagName" in node;
}

function children(node: HtmlNode): HtmlNode[] {
  return "childNodes" in node ? node.childNodes : [];
}

function textContent(node: HtmlNode): string {
  if ("value" in node) return node.value;
  if (isElement(node)) {
    const classes = node.attrs.find((attribute) => attribute.name === "class")?.value.split(/\s+/) ?? [];
    if (classes.includes("callout-icon") || classes.includes("katex-mathml")) return "";
  }
  return children(node).map(textContent).join(" ");
}

describe("Framework Markdown renderer parity", () => {
  it("matches normalized content from the Physics 06 note and shared syntax", () => {
    const html = renderMarkdownDocument(source).html;
    const normalizedText = textContent(parseFragment(html)).replace(/\s+/g, " ").trim();

    expect(normalizedText).toBe(
      "Physics Notes SECTION 1 — Basics 1.1 Motion Use the turning effect and highlight with F = ma . [1] "
      + "Definition A rigid body is a body with a perfectly definite and unchanging shape. "
      + "The distances between all pairs of particles remain constant, regardless of the forces acting. "
      + "No real body is truly rigid; deformations exist but are often negligible (e.g., a steel beam, a flywheel, "
      + "a wheel of a vehicle). Type Description Example Pure Translation All particles have the same velocity "
      + "at every instant Block sliding down inclined plane Pure Rotation Body rotates about a fixed axis; particles "
      + "move in circles Ceiling fan, Potter’s wheel Rolling Motion Translation + Rotation combined Cylinder rolling "
      + "down an incline Key Principle In pure translation , every particle has the same velocity. In pure rotation "
      + "about a fixed axis, every particle has the same angular velocity ω. checked task open task const value = 1; "
      + "External Newton law. ↩︎",
    );
    expect(html).toContain('href="#Torque"');
    expect(html).toContain('data-callout="note"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("<table>");
    expect(html).toContain('class="language-js"');
    expect(html).toContain("https://example.test");
    expect(html).toContain("class=\"katex\"");
  });
});
