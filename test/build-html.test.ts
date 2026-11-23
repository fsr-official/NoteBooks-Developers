import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildStaticHtml, renderChapterFragment, renderPageFragment } from "../utils/build-html.js";
import { buildChapter } from "../utils/build.js";
import { renderMarkdownDocument } from "../utils/markdown-renderer.js";
import type { ChapterSources } from "../utils/validate.js";

const chapterId = "PHYSICS06-SYSTEM_OF_PARTICLES_AND_ROTATIONAL_MOTION";

function sources(): ChapterSources {
  return {
    glossary: [
      "# Test | GLOSSARY",
      "",
      "**Torque (τ)** — Turning effect of a force. *(§1.1)*",
    ].join("\n"),
    notes: [
      "# Physics | Chapter 06 | Test | NOTES",
      "",
      "## Table of Contents",
      "- Generated outline replaces this list.",
      "",
      "## 🗺️ CONCEPT ROADMAP",
      "The road from force to rotation.",
      "",
      "## SECTION 1 — Basics ⭐⭐",
      "",
      "### 1.1 Start",
      "Torque changes rotational motion.",
      "",
      "### 1.2 Worked example",
      "> [!example] Find the result",
      "> [from=1.1; concepts=1.1]",
      ">",
      "> Given $x=1$.",
      ">",
      "> $$x=2$$",
      "",
      "```mermaid",
      "flowchart TD",
      "A --> B",
      "```",
      "",
      "```desmos",
      "y=x",
      "```",
    ].join("\n"),
    cnotes: [
      "# Test | CNOTES",
      "",
      "## Chapter Brief",
      "A compact overview with $F=ma$.",
      "",
      "## §1 Basics",
      "",
      "### 1.1 Start",
      "#### Summary",
      "Torque explains how a force produces rotational change through its lever arm, $\\tau=I\\alpha$.",
      "",
      "#### Important Notes",
      "- Exact fact: $F=ma$.",
      "",
      "```mermaid",
      "flowchart TD",
      "A --> B",
      "```",
      "",
      "### 1.2 Worked example",
      "#### Summary",
      "This example applies a rotational relation to a specific result.",
      "",
      "#### Important Notes",
      "- Result: $x=2$.",
    ].join("\n"),
  };
}

describe("static HTML renderer", () => {
  it("renders matching Markdown features and records heading/search metadata", () => {
    const rendered = renderMarkdownDocument([
      "---",
      "title: Test",
      "---",
      "",
      "# Force and Motion",
      "",
      "A [[Torque|turning effect]] with $F=ma$.[^1]",
      "",
      "[^1]: Newton's second law.",
    ].join("\n"));

    expect(rendered.html).toContain('id="force-and-motion"');
    expect(rendered.html).toContain('class="obsidian-wikilink"');
    expect(rendered.html).toContain("katex");
    expect(rendered.html).toContain("footnote");
    expect(rendered.outline).toContainEqual(expect.objectContaining({
      title: "Force and Motion",
      id: "force-and-motion",
    }));
    expect(rendered.searchIndex.some(({ text }) => text.includes("turning effect"))).toBe(true);
  });

  it("renders NCERT inline, bracketed, and begin/end LaTeX delimiters", () => {
    const rendered = renderMarkdownDocument(String.raw`
Inline \(x^2+1=0\).

\[
x^2=-1
\]

> \begin{aligned}
> 4x &= 3 \\
> 3x-y &= -6
> \end{aligned}
`);

    expect(rendered.html.match(/class="katex"/g)).toHaveLength(3);
    expect(rendered.html.match(/class="katex-display"/g)).toHaveLength(2);
    expect(rendered.html).not.toContain("katex-error");
  });

  it("renders a CNOTES mindmap alongside section-level LaTeX", () => {
    const rendered = renderMarkdownDocument([
      "# CNOTES",
      "",
      "## Section 1 — Sets",
      "",
      "```mermaid",
      "mindmap",
      "  root((Sets))",
      "    Operations",
      "      Union",
      "      Intersection",
      "```",
      "",
      String.raw`The distributive law is \(A\cap(B\cup C)=(A\cap B)\cup(A\cap C)\).`,
    ].join("\n"));

    expect(rendered.figures).toHaveLength(1);
    expect(rendered.figures?.[0]).toMatchObject({ type: "mermaid" });
    expect(rendered.figures?.[0]?.source).toContain("mindmap");
    expect(rendered.html).toContain("katex");
    expect(rendered.html).toContain("Sets");
    expect(rendered.html).not.toContain("katex-error");
  });

  it("renders a chapter fragment with a separate outline, synced facts, examples, and inert data scripts", async () => {
    const { bundle } = await buildChapter(chapterId, sources());
    const html = renderChapterFragment(bundle);
    const notes = html.match(/<section class="chapter-reader-content" data-notes>([\s\S]*?)<\/section>/)?.[1] ?? "";

    expect(html).toContain('data-outline aria-label="Chapter outline"');
    expect(html).toContain("A compact overview");
    expect(notes).not.toContain("A compact overview");
    expect(html).toContain('id="chapter-overview" data-section-id="chapter-overview"');
    expect(html).toContain('data-section-id="chapter-overview"');
    expect(html).toContain('href="#chapter-overview" data-section-id="chapter-overview">Concept Roadmap');
    expect(html).toContain("<h2>Outline</h2>");
    expect(html).toContain("<h3>Summary</h3>");
    expect(html).toContain("<h3>Important Notes</h3>");
    expect(html).toContain('class="chapter-reader-fact-important"><h3>Important Notes</h3><ul>');
    expect(html.slice(html.indexOf("data-facts"))).toContain('class="katex"');
    expect(html).not.toContain("At a Glance");
    expect(notes).toContain('data-example-target="');
    expect(html).toContain("Return To Section");
    expect(html).toContain('<figure data-diagram');
    expect(bundle.facts[0].visuals).toHaveLength(1);
    expect(html.slice(html.indexOf("data-facts"))).toContain('data-diagram-kind="mermaid"');
    expect(html).toContain('data-desmos-request');
    expect(html).toContain('class="katex"');
    expect(html).toContain('data-term="torque"');
    expect(html).toMatch(/<script type="application\/json" data-chapter-data>/);
    const embeddedData = JSON.parse(
      html.match(/<script type="application\/json" data-chapter-data>([\s\S]*?)<\/script>/)?.[1] ?? "{}",
    ) as { tree?: Array<{ id: string; children: Array<{ id: string }> }> };
    expect(embeddedData.tree?.[0]?.children.map(({ id }) => id)).toContain("1.1");
    expect([...html.matchAll(/<script\b[^>]*>/g)].every(([tag]) => tag.includes('type="application/json"'))).toBe(true);
  });

  it("renders plain documents as fragments with an outline and embedded JSON data", () => {
    const html = renderPageFragment("# A Page\n\n## A Section\n\nPlain text.", "notes/a-page.md");
    expect(html).toContain('data-kind="page"');
    expect(html).toContain('data-content');
    expect(html).toContain('data-chapter-data');
    expect(html).toContain('"title":"A Section"');
    expect(html).toContain('"tree":');
    expect(html).not.toContain("<html");
  });

  it("supports the documented teal Desmos color in Markdown examples", () => {
    const rendered = renderMarkdownDocument("```desmos\n@line [color=teal]: y=2x+1\n```");
    expect(rendered.desmos[0]?.data).toEqual(expect.objectContaining({
      expressions: expect.arrayContaining([
        expect.objectContaining({ color: "#008080" }),
      ]),
    }));
  });

  it("builds incrementally into a temporary directory with source paths in the manifest", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "notebooks-html-source-"));
    const output = await mkdtemp(path.join(os.tmpdir(), "notebooks-html-output-"));
    const chapterDirectory = path.join(root, "src/AI-NOTES", chapterId);
    const plainPath = "src/research-and-development/plain.md";
    const nestedPagePath = "src/api/reference.md";
    const unmigratedDirectory = path.join(root, "src/AI-NOTES/PHYSICS05-WORK_ENERGY_AND_POWER");
    try {
      await mkdir(chapterDirectory, { recursive: true });
      await mkdir(path.dirname(path.join(root, plainPath)), { recursive: true });
      await mkdir(path.dirname(path.join(root, nestedPagePath)), { recursive: true });
      await mkdir(unmigratedDirectory, { recursive: true });
      await Promise.all([
        writeFile(path.join(chapterDirectory, `${chapterId}-GLOSSARY.mdx`), sources().glossary),
        writeFile(path.join(chapterDirectory, `${chapterId}-NOTES.mdx`), sources().notes),
        writeFile(path.join(chapterDirectory, `${chapterId}-CNOTES.mdx`), sources().cnotes),
        writeFile(path.join(root, plainPath), "# A Plain Page\n\nContent."),
        writeFile(path.join(root, nestedPagePath), "# API Reference\n\nNested content."),
        writeFile(path.join(unmigratedDirectory, "PHYSICS05-WORK_ENERGY_AND_POWER-GLOSSARY.md"), "# Glossary"),
        writeFile(path.join(unmigratedDirectory, "PHYSICS05-WORK_ENERGY_AND_POWER-NOTES.md"), "# Notes"),
        writeFile(path.join(unmigratedDirectory, "PHYSICS05-WORK_ENERGY_AND_POWER-CNOTES.md"), "# CNotes"),
      ]);

      const first = await buildStaticHtml(root, output);
      const second = await buildStaticHtml(root, output);
      const chapterPath = path.join(output, "AI-NOTES", `${chapterId}.html`);
      const manifest = JSON.parse(await readFile(path.join(output, "manifest.json"), "utf8"));
      const chapterHtml = await readFile(chapterPath, "utf8");

      expect(first.written).toHaveLength(3);
      expect(second.skipped).toHaveLength(3);
      expect(manifest.files[`AI-NOTES/${chapterId}.html`].FilePaths).toHaveLength(3);
      expect(manifest.files["api/reference.html"].FilePaths).toEqual([nestedPagePath]);
      expect(manifest.files["research-and-development/plain.html"].FilePaths).toEqual([plainPath]);
      expect(manifest.files["AI-NOTES/PHYSICS05-WORK_ENERGY_AND_POWER.html"]).toBeUndefined();
      expect(chapterHtml).toContain('data-kind="chapter"');
      expect(chapterHtml).not.toContain("<html");

      await rm(path.join(root, nestedPagePath));
      await buildStaticHtml(root, output);
      await expect(readFile(path.join(output, "api/reference.html"), "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(output, { recursive: true, force: true });
    }
  });
});
