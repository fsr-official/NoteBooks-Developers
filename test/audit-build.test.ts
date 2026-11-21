import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { auditBuildDirectory, auditRenderedHtml, renderChapterHtml } from "../utils/audit-build.js";
import { buildChapter, writeBuild } from "../utils/build.js";
import type { ChapterBundle } from "../src/research-and-development/schema/chapter.js";
import type { ChapterSources } from "../utils/validate.js";

const pilotId = "PHYSICS06-SYSTEM_OF_PARTICLES_AND_ROTATIONAL_MOTION";

function smallSources(): ChapterSources {
  return {
    glossary: [
      "# Test | GLOSSARY",
      "",
      "**Torque (τ)** — Turning effect of a force. *(§1.1)*",
    ].join("\n"),
    notes: [
      "# Physics | Chapter 06 | Test | NOTES",
      "",
      "## Chapter Brief",
      "This is the chapter overview.",
      "",
      "## Table of Contents",
      "- Generated outline replaces this list.",
      "",
      "## 🗺️ CONCEPT ROADMAP",
      "",
      "```mermaid",
      "flowchart TD",
      "A --> B",
      "```",
      "",
      "## SECTION 1 — Basics ⭐⭐",
      "",
      "### 1.1 First idea",
      "Torque appears here.",
      "",
      "### 1.2 Worked examples",
      "> [!example] Find the final value",
      ">",
      "> Given $x=1$.",
      ">",
      "> $$x=2$$",
    ].join("\n"),
    cnotes: [
      "# Test | CNOTES",
      "",
      "## §1 Basics",
      "",
      "### 1.1 First idea",
      "- Torque equals the turning effect.",
      "",
      "### 1.2 Worked examples",
      "- Result: $x=2$.",
    ].join("\n"),
  };
}

async function auditedBundle(): Promise<ChapterBundle> {
  const { bundle } = await buildChapter(pilotId, smallSources());
  const desmosId = "desmos-audit-test";
  return {
    ...bundle,
    notes: {
      tree: [
        ...bundle.notes.tree,
        {
          type: "component",
          name: "Desmos",
          props: {
            name: "Desmos",
            id: desmosId,
            kind: "2d",
            data: { ref: desmosId },
          },
        },
      ],
    },
    desmos: [{ id: desmosId, kind: "2d", data: { expressions: [] } }],
  };
}

describe("build HTML auditor", () => {
  it("renders compiled content and excludes Desmos execution", async () => {
    const bundle = await auditedBundle();
    const html = renderChapterHtml(bundle);

    expect(html).toContain("<!doctype html>");
    expect(html).toContain('id="1.1"');
    expect(html).toContain('class="chapter-math-inline"');
    expect(html).toContain('data-diagram-kind="mermaid"');
    expect(html).toContain("flowchart TD");
    expect(html).toContain('data-desmos-skipped="true"');
    expect(html).not.toContain("<script");
  });

  it("rejects malformed rendered HTML and removes unsafe links", async () => {
    const bundle = await auditedBundle();
    const unsafeBundle: ChapterBundle = {
      ...bundle,
      notes: {
        tree: [
          ...bundle.notes.tree,
          {
            type: "paragraph",
            children: [{
              type: "link",
              href: "javascript:alert(1)",
              children: [{ type: "text", value: "bad link" }],
            }],
          },
        ],
      },
    };
    const html = renderChapterHtml(unsafeBundle);

    expect(html).not.toContain("javascript:");
    expect(() => auditRenderedHtml(bundle, "<html><body><p><p></body></html>"))
      .toThrow("rendered invalid HTML");
  });

  it("fails when a rendered diagram has no compiled source", async () => {
    const bundle = await auditedBundle();
    const invalidBundle: ChapterBundle = { ...bundle, diagrams: [] };

    expect(() => renderChapterHtml(invalidBundle)).toThrow("Missing or mismatched compiled diagram");
  });

  it("writes one HTML audit artifact per manifest chapter", async () => {
    const bundle = await auditedBundle();
    const directory = await mkdtemp(path.join(os.tmpdir(), "notebooks-audit-"));
    try {
      const buildDirectory = path.join(directory, "build");
      const htmlDirectory = path.join(directory, "html");
      await writeBuild(bundle, buildDirectory);
      const results = await auditBuildDirectory(buildDirectory, htmlDirectory);
      const html = await readFile(path.join(htmlDirectory, `${bundle.id}.html`), "utf8");

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        chapterId: bundle.id,
        examples: bundle.examples.length,
        diagrams: bundle.diagrams.length,
        desmosSkipped: bundle.desmos.length,
      });
      expect(html).toContain("chapter-example-");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("fails when a bundle does not match the generated manifest", async () => {
    const bundle = await auditedBundle();
    const directory = await mkdtemp(path.join(os.tmpdir(), "notebooks-audit-mismatch-"));
    try {
      const buildDirectory = path.join(directory, "build");
      await writeBuild(bundle, buildDirectory);
      const manifestPath = path.join(buildDirectory, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
        chapters: Array<{ sourceShas: { notes: string } }>;
      };
      manifest.chapters[0].sourceShas.notes = "0".repeat(64);
      await writeFile(manifestPath, JSON.stringify(manifest), "utf8");

      await expect(auditBuildDirectory(buildDirectory, path.join(directory, "html")))
        .rejects.toThrow("does not match its manifest entry");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
