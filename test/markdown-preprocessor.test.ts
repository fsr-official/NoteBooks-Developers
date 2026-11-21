import { describe, expect, it } from "vitest";
import { preprocessMarkdown } from "../utils/markdown-preprocessor.js";

describe("Markdown preprocessing", () => {
  it("strips leading frontmatter once and is idempotent", () => {
    const source = "---\ntitle: Physics\nlabels: [science, notes]\n---\n\n# Chapter\n";
    const normalized = preprocessMarkdown(source);

    expect(normalized).toBe("\n# Chapter\n");
    expect(preprocessMarkdown(normalized)).toBe(normalized);
  });

  it("leaves Markdown without frontmatter unchanged", () => {
    const source = "# Chapter\n\n$F=ma$\n";
    expect(preprocessMarkdown(source)).toBe(source);
  });
});
