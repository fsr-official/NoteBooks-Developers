import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateChapter, validateSourceTree, validateSources, type ChapterSources } from "../utils/validate.js";

const chapterId = "PHYSICS06-SYSTEM_OF_PARTICLES_AND_ROTATIONAL_MOTION";

function sources(overrides: Partial<ChapterSources> = {}): ChapterSources {
  return {
    glossary: "**Torque** — turning effect of a force (§1.1).\n",
    notes: "## SECTION 1 — Motion\n\n### 1.1 Rotation\n\nText.\n",
    cnotes: "## SECTION 1 — Motion\n\n### 1.1 Rotation\n\nFacts.\n",
    ...overrides,
  };
}

describe("validateSources", () => {
  it("accepts the Physics 06 pilot and preserves its complete CNOTES coverage", async () => {
    const report = await validateChapter(chapterId);
    expect(report.errors).toEqual([]);
    expect(report.notesOnlySections).toEqual([]);
  }, 20_000);

  it("fails when either chapter file omits a section ID from the other", async () => {
    const report = await validateSources(chapterId, sources({
      notes: "## SECTION 1 — Motion\n\n### 1.1 Rotation\n\n### 1.2 Inertia\n",
      cnotes: "## §1 Motion\n\n### 1.3 Torque\n",
    }));

    expect(report.errors).toContainEqual(expect.objectContaining({
      file: `${chapterId}-CNOTES.mdx`,
      line: 3,
      reason: 'CNOTES section "1.3" is missing from NOTES',
    }));
    expect(report.errors).toContainEqual(expect.objectContaining({
      file: `${chapterId}-NOTES.mdx`,
      line: 3,
      reason: 'NOTES section "1.1" is missing from CNOTES',
    }));
    expect(report.notesOnlySections).toEqual(["1.1", "1.2"]);
  });

  it("rejects duplicate IDs in either notes file", async () => {
    const report = await validateSources(chapterId, sources({
      notes: "## SECTION 1 — Motion\n\n### 1.1 Rotation\n\n### 1.1 Repeated\n",
    }));

    expect(report.errors).toContainEqual(expect.objectContaining({
      file: `${chapterId}-NOTES.mdx`,
      line: 5,
      reason: 'duplicate section ID "1.1"',
    }));
  });

  it("rejects example links to missing sections and invalid component props", async () => {
    const report = await validateSources(chapterId, sources({
      notes: [
        "## SECTION 1 — Motion",
        "### 1.1 Rotation",
        '<Example id="rotation-1" title="Rotation" from="9.9" concepts="1.1" question="Question" answer="Answer" extra="no" />',
      ].join("\n"),
    }));

    expect(report.errors.map((error) => error.reason)).toEqual(expect.arrayContaining([
      'Example from references missing NOTES section "9.9"',
      'Example has unknown prop "extra"',
    ]));
  });

  it("rejects duplicate glossary terms, unapproved callouts and unknown components", async () => {
    const report = await validateSources(chapterId, sources({
      glossary: "**Torque** — first.\n\n**torque** — duplicate.\n",
      notes: [
        "## SECTION 1 — Motion",
        "### 1.1 Rotation",
        "> [!mystery] Unsupported callout",
        "<UnknownThing />",
      ].join("\n"),
    }));

    expect(report.errors.map((error) => error.reason)).toEqual(expect.arrayContaining([
      'duplicate glossary entry "torque"',
      'unknown callout type "mystery"',
      'unknown component "UnknownThing"',
    ]));
  });

  it("rejects MDX imports and executable expressions", async () => {
    const report = await validateSources(chapterId, sources({
      notes: [
        'import Button from "./Button";',
        "",
        "## SECTION 1 — Motion",
        "### 1.1 Rotation",
        "{1 + 1}",
      ].join("\n"),
    }));

    expect(report.errors.map((error) => error.reason)).toEqual(expect.arrayContaining([
      "import/export statements are not allowed",
      "JavaScript expressions are not allowed in the data tree",
    ]));
  });
});

describe("validateSourceTree", () => {
  it("classifies complete Markdown-only triads as not migrated and validates MDX triads", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "notebooks-source-check-"));
    try {
      const oldChapter = "PHYSICS05-WORK_ENERGY_AND_POWER";
      const migratedChapter = "PHYSICS06-SYSTEM_OF_PARTICLES_AND_ROTATIONAL_MOTION";
      const source = path.join(root, "src", "AI-NOTES");
      for (const role of ["GLOSSARY", "NOTES", "CNOTES"]) {
        const oldDir = path.join(source, oldChapter);
        await mkdir(oldDir, { recursive: true });
        await writeFile(path.join(oldDir, `${oldChapter}-${role}.md`), `# ${role}\n`);
      }

      const mdxDir = path.join(source, migratedChapter);
      await mkdir(mdxDir, { recursive: true });
      await writeFile(
        path.join(mdxDir, `${migratedChapter}-GLOSSARY.mdx`),
        "**Torque** — turning effect of a force (§1.1).\n",
      );
      await writeFile(
        path.join(mdxDir, `${migratedChapter}-NOTES.mdx`),
        "## SECTION 1 — Motion\n\n### 1.1 Rotation\n\nText.\n",
      );
      await writeFile(
        path.join(mdxDir, `${migratedChapter}-CNOTES.mdx`),
        "## §1 Motion\n\n### 1.1 Rotation\n\nFacts.\n",
      );

      const report = await validateSourceTree(root);
      expect(report.errors).toEqual([]);
      expect(report.chapters).toEqual([
        { id: oldChapter, directory: `src/AI-NOTES/${oldChapter}`, status: "not migrated" },
        { id: migratedChapter, directory: `src/AI-NOTES/${migratedChapter}`, status: "migrated" },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reports incomplete triads, case collisions, and mirrored root collisions", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "notebooks-source-errors-"));
    try {
      const sourceDir = path.join(root, "src", "docs");
      await mkdir(sourceDir, { recursive: true });
      await writeFile(path.join(sourceDir, "PHYSICS01-GLOSSARY.md"), "# Glossary\n");
      await writeFile(path.join(sourceDir, "page.md"), "# Page\n");
      await writeFile(path.join(sourceDir, "PAGE.md"), "# Duplicate case\n");
      await mkdir(path.join(root, "docs"), { recursive: true });
      await writeFile(path.join(root, "docs", "page.html"), "<p>Existing</p>\n");

      const report = await validateSourceTree(root);
      expect(report.chapters).toEqual([
        { id: "PHYSICS01", directory: "src/docs", status: "failing" },
      ]);
      expect(report.errors.map(({ reason }) => reason)).toEqual(expect.arrayContaining([
        'triad is missing its NOTES source',
        'triad is missing its CNOTES source',
        'case-insensitive path collision with "src/docs/page.md"',
        'mirrored output path "docs/page.html" collides with existing root path "docs/page.html"',
      ]));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
