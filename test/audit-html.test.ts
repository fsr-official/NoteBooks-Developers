import { describe, expect, it } from "vitest";
import { auditHtmlFragment } from "../utils/audit-html.js";

const validPage = [
  '<article data-chapter-id="page" data-kind="page" data-renderer-version="0.2.1">',
  '<script type="application/json" data-chapter-data>{"outline":[],"glossary":{}}</script>',
  '<main data-content><h1 id="start" data-chapter-heading="true">Page</h1><a href="#start">Top</a></main>',
  "</article>",
].join("");

describe("static HTML audit", () => {
  it("accepts a plain page with inert embedded data and resolved anchors", () => {
    expect(auditHtmlFragment(validPage, "page.html")).toMatchObject({
      file: "page.html",
      headings: 1,
      diagrams: 0,
      desmos: 0,
    });
  });

  it("rejects executable scripts, broken anchors, and duplicate section IDs", () => {
    const invalid = validPage
      .replace("</main>", '<a href="#missing">Missing</a><script>alert(1)</script><h2 id="start" data-chapter-heading="true">Duplicate</h2></main>');
    expect(() => auditHtmlFragment(invalid, "page.html")).toThrow("executable or unsupported script");
    expect(() => auditHtmlFragment(invalid, "page.html")).toThrow('anchor "#missing" does not resolve');
    expect(() => auditHtmlFragment(invalid, "page.html")).toThrow('duplicate section ID "start"');
  });

  it("rejects empty diagrams and unresolved glossary terms", () => {
    const invalid = [
      '<article data-chapter-id="chapter" data-kind="chapter" data-renderer-version="0.2.1">',
      '<script type="application/json" data-chapter-data>{"glossary":{}}</script>',
      '<nav data-outline></nav><section data-notes></section><section data-facts></section><section data-examples></section>',
      '<button data-term-id="torque">Torque</button><figure data-diagram data-diagram-id="d-1"></figure>',
      "</article>",
    ].join("");
    expect(() => auditHtmlFragment(invalid, "chapter.html")).toThrow("glossary reference has no definition");
    expect(() => auditHtmlFragment(invalid, "chapter.html")).toThrow("has no rendered SVG");
  });

  it("validates embedded Desmos request structure without loading the external API", () => {
    const valid = validPage.replace(
      "</main>",
      '<div data-desmos data-id="graph-1" data-kind="2d">'
        + '<script type="application/json" data-desmos-request>'
        + '{"expressions":[{"id":"line-1","latex":"y=x"}],"options":{"expressions":false}}'
        + "</script></div></main>",
    );
    expect(auditHtmlFragment(valid, "page.html").desmos).toBe(1);

    const duplicateExpressionIds = valid.replace(
      '{"id":"line-1","latex":"y=x"}',
      '{"id":"line-1","latex":"y=x"},{"id":"line-1","latex":"y=x+1"}',
    );
    expect(() => auditHtmlFragment(duplicateExpressionIds, "page.html"))
      .toThrow('duplicate expression ID "line-1"');
  });
});
