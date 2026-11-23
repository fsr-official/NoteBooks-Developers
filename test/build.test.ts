import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildChapter, writeBuild } from "../utils/build.js";
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
      "## Front Matter",
      "**Prerequisites:** Newton's laws.",
      "",
      "## SECTION 1 — Basics ⭐⭐",
      "",
      "### 1.1 First idea",
      "First section summary.",
      "",
      "### 1.2 Worked examples",
      "> [!example] Find the final value",
      "> [from=1.1; concepts=1.1,1.2]",
      ">",
      "> Given $x=1$.",
      ">",
      "> $$x=2$$",
      "",
      "**Example 2.1 — A second calculation** [from=1.2; concepts=1.1]",
      "",
      "The given values are $a=1$ and $b=2$.",
      "",
      "$$a+b=3$$",
      "",
      "---",
      "",
      "### 1.3 Solved Example — Final case [from=1.3; concepts=1.1,1.3]",
      "",
      "The input is $v=4$.",
      "",
      "$$v^2=16$$",
    ].join("\n"),
    cnotes: [
      "# Test | CNOTES",
      "",
      "## Chapter Brief",
      "This is the chapter overview.",
      "",
      "## §1 Basics",
      "",
      "```mermaid",
      "flowchart TD",
      "F --> T",
      "```",
      "",
      "```desmos",
      "y=x",
      "```",
      "",
      "### 1.1 First idea",
      "#### Summary",
      "Torque links a force to rotational change as $\\tau=I\\alpha$.",
      "",
      "#### Important Notes",
      "- Exact fact: $F=ma$.",
      "",
      "### 1.2 Worked examples",
      "#### Summary",
      "These examples connect given values to a computed result.",
      "",
      "#### Important Notes",
      "- Result: $x=2$.",
      "",
      "### 1.3 Final case",
      "#### Summary",
      "This final case applies the same method to a new quantity.",
      "",
      "#### Important Notes",
      "- Result: $v^2=16$.",
    ].join("\n"),
  };
}

describe("buildChapter", () => {
  it("strips idempotent public frontmatter rules before parsing MDX sources", async () => {
    const sources = smallSources();
    sources.glossary = `---\ntitle: Glossary\n---\n${sources.glossary}`;
    sources.notes = `---\ntitle: Notes\n---\n${sources.notes}`;
    sources.cnotes = `---\ntitle: Facts\n---\n${sources.cnotes}`;

    const { bundle } = await buildChapter(pilotId, sources);

    expect(bundle.title).toBe("Test");
    expect(bundle.glossary.torque.term).toBe("Torque (τ)");
    expect(bundle.notes.tree.map((node) => JSON.stringify(node)).join(" ")).not.toContain("title: Notes");
    expect(bundle.facts[0].sectionId).toBe("1.1");
  });

  it("creates an outline, facts, examples, and a rebuildable data tree", async () => {
    const { bundle } = await buildChapter(pilotId, smallSources());
    const tree = JSON.stringify(bundle.notes.tree);

    expect(bundle.schemaVersion).toBe(3);
    expect(bundle.title).toBe("Test");
    expect(bundle.outline[0]).toMatchObject({ id: "chapter-overview", title: "Concept Roadmap" });
    expect(bundle.outline[0].brief).toBe("This is the chapter overview.");
    expect(bundle.outline[1]).toMatchObject({ id: "SECTION-1", importance: 2 });
    expect(bundle.notes.tree.filter((node) => node.type === "heading" && node.id === "chapter-overview")).toHaveLength(1);
    expect(tree).not.toContain("chapter overview");
    expect(tree).not.toContain("Generated outline replaces this list.");
    expect(tree).toContain("CONCEPT ROADMAP");
    expect(tree).not.toContain("#ex-");
    expect(bundle.examples).toHaveLength(3);
    expect(bundle.outline.every(({ title }) => !title.includes("⭐"))).toBe(true);
    expect(bundle.examples[0].from).toEqual(["1.1"]);
    expect(bundle.examples[0].concepts).toEqual(["1.1", "1.2"]);
    expect(bundle.examples[0].title).not.toContain("[from=");
    expect(bundle.examples[1].from).toEqual(["1.2"]);
    expect(bundle.examples[1].concepts).toEqual(["1.1"]);
    expect(bundle.examples[1].title).not.toContain("[from=");
    expect(bundle.examples[2].from).toEqual(["1.3"]);
    expect(bundle.examples[2].concepts).toEqual(["1.1", "1.3"]);
    expect(bundle.examples[2].title).not.toContain("[from=");
    expect(bundle.examples[0].question.length).toBeGreaterThan(0);
    expect(bundle.examples[0].answer.length).toBeGreaterThan(0);
    expect(bundle.facts).toContainEqual(expect.objectContaining({
      sectionId: "1.1",
      brief: "Torque links a force to rotational change as $\\tau=I\\alpha$.",
      points: ["Exact fact: $F=ma$."],
    }));
    expect(bundle.facts[0].visuals.map(({ name }) => name)).toEqual(["Diagram", "Desmos"]);
    expect(bundle.facts.every(({ visuals }) => Array.isArray(visuals))).toBe(true);
    expect(bundle.glossary.torque.aliases).toEqual(["τ"]);
    expect(bundle.sourceShas).toEqual({
      glossary: expect.stringMatching(/^[a-f0-9]{64}$/),
      notes: expect.stringMatching(/^[a-f0-9]{64}$/),
      cnotes: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(JSON.parse(JSON.stringify(bundle))).toEqual(bundle);
  });

  it("adds one glossary reference per section while skipping headings, links, code, and math", async () => {
    const sources = smallSources();
    sources.notes = sources.notes
      .replace(
        "### 1.1 First idea\nFirst section summary.",
        "### 1.1 Torque heading\nTorque appears; Torque repeats, [Torque](https://example.com), `Torque`, and $τ$.",
      )
      .replace("### 1.2 Worked examples", "### 1.2 Worked examples\n\nτ appears in this section.");
    sources.cnotes = sources.cnotes.replace(
      "- Exact fact: $F=ma$.",
      "- Torque is exact: $F=τ$.",
    );
    const { bundle } = await buildChapter(pilotId, sources);
    const subsection = bundle.notes.tree.findIndex(
      (node) => node.type === "heading" && node.id === "1.1",
    );
    const paragraph = bundle.notes.tree.slice(subsection + 1).find((node) => node.type === "paragraph");
    const secondSection = bundle.notes.tree.findIndex(
      (node) => node.type === "heading" && node.id === "1.2",
    );
    const aliasParagraph = bundle.notes.tree.slice(secondSection + 1).find((node) => node.type === "paragraph");

    expect(paragraph?.type).toBe("paragraph");
    if (paragraph?.type !== "paragraph") throw new Error("Expected subsection paragraph");
    expect(paragraph.children.filter((node) => node.type === "glossaryRef")).toEqual([{
      type: "glossaryRef",
      termId: "torque",
      children: [{ type: "text", value: "Torque" }],
    }]);
    expect(paragraph.children.some((node) => node.type === "link")).toBe(true);
    expect(paragraph.children.some((node) => node.type === "inlineCode")).toBe(true);
    expect(paragraph.children.some((node) => node.type === "mathInline")).toBe(true);

    expect(aliasParagraph?.type).toBe("paragraph");
    if (aliasParagraph?.type !== "paragraph") throw new Error("Expected alias subsection paragraph");
    expect(aliasParagraph.children).toContainEqual({
      type: "glossaryRef",
      termId: "torque",
      children: [{ type: "text", value: "τ" }],
    });

    expect(bundle.facts[0].glossaryRefs.brief).toEqual([
      { start: 0, end: 6, termId: "torque" },
    ]);
    expect(bundle.facts[0].glossaryRefs.points[0]).toEqual([]);
  });

  it("compiles every diagram and Desmos DSL block in the full pilot", async () => {
    const directory = path.resolve(
      "src/AI-NOTES",
      pilotId,
    );
    const sources: ChapterSources = {
      glossary: await readFile(path.join(directory, `${pilotId}-GLOSSARY.mdx`), "utf8"),
      notes: await readFile(path.join(directory, `${pilotId}-NOTES.mdx`), "utf8"),
      cnotes: await readFile(path.join(directory, `${pilotId}-CNOTES.mdx`), "utf8"),
    };
    const { bundle } = await buildChapter(pilotId, sources);

    expect(bundle.diagrams).toHaveLength(28);
    expect(bundle.desmos).toHaveLength(15);
    expect(bundle.desmos.every(({ data }) => typeof data === "object" && data !== null)).toBe(true);
    expect(bundle.examples.length).toBeGreaterThan(0);
    expect(bundle.examples.every(({ answer }) => answer.length > 0)).toBe(true);
    expect(bundle.facts).toHaveLength(54);
    expect(Object.keys(bundle.glossary)).toHaveLength(34);
    expect(bundle.notes.tree.some((node) => JSON.stringify(node).includes('"type":"glossaryRef"'))).toBe(true);
    expect(bundle.facts.some((fact) => fact.glossaryRefs.brief.length + fact.glossaryRefs.points.flat().length > 0)).toBe(true);
  }, 30_000);

  it("skips unchanged bundles and writes an accurate manifest", async () => {
    const { bundle } = await buildChapter(pilotId, smallSources());
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "notebooks-build-"));
    try {
      const first = await writeBuild(bundle, outputDirectory);
      const second = await writeBuild(bundle, outputDirectory);
      const manifest = JSON.parse(await readFile(path.join(outputDirectory, "manifest.json"), "utf8"));
      expect(first.skipped).toBe(false);
      expect(second.skipped).toBe(true);
      expect(manifest.chapters).toEqual([{
        id: bundle.id,
        title: bundle.title,
        bundle: `${bundle.id}.json`,
        sourceShas: bundle.sourceShas,
      }]);
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  });

  it("migrates the previous manifest and bundle schema on the next build", async () => {
    const { bundle } = await buildChapter(pilotId, smallSources());
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "notebooks-build-migrate-"));
    try {
      await mkdir(outputDirectory, { recursive: true });
      await writeFile(path.join(outputDirectory, "manifest.json"), JSON.stringify({
        schemaVersion: 1,
        rendererVersion: "0.1.1",
        chapters: [{
          id: bundle.id,
          title: bundle.title,
          bundle: `${bundle.id}.json`,
          sourceShas: bundle.sourceShas,
        }],
      }));

      const result = await writeBuild(bundle, outputDirectory);
      const writtenBundle = JSON.parse(await readFile(path.join(outputDirectory, `${bundle.id}.json`), "utf8"));

      expect(result.skipped).toBe(false);
      expect(result.manifest.schemaVersion).toBe(3);
      expect(writtenBundle.schemaVersion).toBe(3);
      expect(result.manifest.chapters[0].sourceShas).toEqual(writtenBundle.sourceShas);
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  });
});
