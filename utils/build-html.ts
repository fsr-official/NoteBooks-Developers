import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import katex from "katex";
import { buildChapter } from "./build.js";
import { renderMarkdownDocument, renderMarkdownInline, escapeStaticHtml } from "./markdown-renderer.js";
import type { BlockNode, ChapterBundle, InlineNode } from "../src/research-and-development/schema/chapter.js";
import { validateSourceTree, type ChapterClassification, type ChapterSources } from "./validate.js";

export const STATIC_RENDERER_VERSION = "0.2.5";

export type HtmlManifestRecord = {
  kind: "chapter" | "page";
  FilePaths: string[];
  FileSHAs: Record<string, string>;
};

export type HtmlManifest = {
  rendererVersion: string;
  files: Record<string, HtmlManifestRecord>;
};

export type StaticBuildResult = {
  outputDirectory: string;
  manifest: HtmlManifest;
  written: string[];
  skipped: string[];
  warnings: Array<{ file: string; line: number; message: string }>;
};

type StaticBuildOptions = {
  chapterId?: string;
  plainSourcePath?: string;
};

type RenderState = {
  diagramCounts: Map<string, number>;
  desmosCounts: Map<string, number>;
};

type ReaderSection = {
  id: string;
  number: string;
  title: string;
  level: number;
  children: ReaderSection[];
};

function createRenderState(): RenderState {
  return { diagramCounts: new Map(), desmosCounts: new Map() };
}

function occurrenceId(id: string, counts: Map<string, number>): string {
  const occurrence = (counts.get(id) ?? 0) + 1;
  counts.set(id, occurrence);
  return `${id}-${occurrence}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function textFromBlocks(nodes: ChapterBundle["notes"]["tree"]): string {
  return nodes.map((node) => {
    if ("children" in node && node.children) {
      return node.children.map((child) => "value" in child ? child.value : "").join(" ");
    }
    return node.type === "codeBlock" || node.type === "mathBlock" ? node.value : "";
  }).join(" ").replace(/\s+/g, " ").trim();
}

function isSectionId(value: string): value is ChapterBundle["examples"][number]["from"][number] {
  return /^\d+\.\d+(?:\.\d+)?$/.test(value);
}

function outlineHtml(bundle: ChapterBundle): string {
  const entries = bundle.outline
    .filter((entry) => entry.id === "chapter-overview" || entry.id.startsWith("SECTION-"))
    .map((entry) => (
      `<li data-importance="${entry.importance}"><a href="#${escapeStaticHtml(entry.id)}" `
      + `data-section-id="${escapeStaticHtml(entry.id)}">${escapeStaticHtml(entry.title)}</a></li>`
    )).join("");
  return `<nav data-outline aria-label="Chapter outline"><h2>Outline</h2><ol>${entries}</ol></nav>`;
}

function inlineText(nodes: InlineNode[]): string {
  return nodes.map((node) => {
    if ("value" in node) return node.value;
    return inlineText(node.children);
  }).join("");
}

function headingId(node: BlockNode): string | undefined {
  if (node.type !== "heading") return undefined;
  if (node.id) return node.id;
  const match = inlineText(node.children).match(/^SECTION\s+(\d+)\b/i);
  return match ? `SECTION-${match[1]}` : undefined;
}

function readerTree(bundle: ChapterBundle): ReaderSection[] {
  const sections = new Map<string, ReaderSection>();
  const roots = bundle.outline
    .filter((entry) => /^SECTION-\d+$/.test(entry.id))
    .map((entry): ReaderSection => {
      const section = {
        id: entry.id,
        number: entry.id.slice("SECTION-".length),
        title: entry.title,
        level: 2,
        children: [],
      };
      sections.set(section.id, section);
      return section;
    });

  const addHeadings = (nodes: BlockNode[]) => {
    for (const node of nodes) {
      const id = headingId(node);
      if (id && /^\d+\.\d+(?:\.\d+)?$/.test(id)) {
        const parts = id.split(".");
        const parentId = parts.length === 2 ? `SECTION-${parts[0]}` : parts.slice(0, -1).join(".");
        const section: ReaderSection = {
          id,
          number: id,
          title: inlineText(node.type === "heading" ? node.children : []).replace(/^\d+(?:\.\d+)+\s*/, ""),
          level: parts.length + 1,
          children: [],
        };
        sections.set(id, section);
        sections.get(parentId)?.children.push(section);
      }

      if (node.type === "list" || node.type === "listItem" || node.type === "blockquote") {
        addHeadings(node.children);
      } else if (node.type === "component" && node.name === "Example") {
        addHeadings([...node.props.question, ...node.props.answer]);
      }
    }
  };
  addHeadings(bundle.notes.tree);
  return roots;
}

function pageReaderTree(
  outline: Array<{ id: string; number: string; title: string; level: number }>,
): ReaderSection[] {
  const roots: ReaderSection[] = [];
  const parents: ReaderSection[] = [];
  for (const entry of outline) {
    while (parents.at(-1) && (parents.at(-1)?.level ?? 0) >= entry.level) parents.pop();
    const section: ReaderSection = {
      id: entry.id,
      number: entry.number,
      title: entry.title,
      level: entry.level,
      children: [],
    };
    const parent = parents.at(-1);
    if (parent) parent.children.push(section);
    else roots.push(section);
    parents.push(section);
  }
  return roots;
}

function safeHref(href: string): string | null {
  return /^(?:javascript|data|vbscript):/i.test(href.trim()) ? null : href;
}

function renderText(value: string): string {
  const pattern = /!\[\[([^\]]+)\]\]|\[\[([^\]]+)\]\]|==((?!\s)[\s\S]*?(?<!\s))==/g;
  let html = "";
  let previous = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    html += escapeStaticHtml(value.slice(previous, index));
    if (match[1]) {
      const file = match[1].split("|", 1)[0].split("#", 1)[0].trim();
      const label = match[1].split("|", 2)[1]?.trim() ?? file;
      if (/\.(?:bmp|gif|jpe?g|png|svg|webp)$/i.test(file)) {
        html += `<img class="obsidian-embed obsidian-image" src="${escapeStaticHtml(file)}" alt="${escapeStaticHtml(label)}">`;
      } else {
        html += `<a class="obsidian-embed obsidian-transclusion" href="${escapeStaticHtml(file)}">Embedded file: ${escapeStaticHtml(label)}</a>`;
      }
    } else if (match[2]) {
      const [targetWithAnchor, alias] = match[2].split("|", 2).map((part) => part.trim());
      const [target, anchor] = targetWithAnchor.split("#", 2);
      const label = alias || (anchor ? `${target}#${anchor}` : target);
      html += `<a class="obsidian-wikilink" href="#${encodeURIComponent(anchor || target)}" data-target="${escapeStaticHtml(target)}">${escapeStaticHtml(label)}</a>`;
    } else {
      html += `<mark>${escapeStaticHtml(match[3])}</mark>`;
    }
    previous = index + match[0].length;
  }
  return html + escapeStaticHtml(value.slice(previous));
}

function renderInline(nodes: InlineNode[], bundle: ChapterBundle): string {
  return nodes.map((node) => {
    switch (node.type) {
      case "text":
        return renderText(node.value);
      case "inlineCode":
        return `<code>${escapeStaticHtml(node.value)}</code>`;
      case "mathInline":
        return katex.renderToString(node.value, {
          displayMode: false,
          throwOnError: false,
          strict: "ignore",
          output: "html",
        });
      case "emphasis":
        return `<em>${renderInline(node.children, bundle)}</em>`;
      case "strong":
        return `<strong>${renderInline(node.children, bundle)}</strong>`;
      case "link": {
        const href = safeHref(node.href);
        const children = renderInline(node.children, bundle);
        if (href === null) return `<span>${children}</span>`;
        const title = node.title ? ` title="${escapeStaticHtml(node.title)}"` : "";
        const external = /^https?:\/\//i.test(href);
        return `<a href="${escapeStaticHtml(href)}"${title}${external ? ' target="_blank" rel="noreferrer"' : ""}>${children}</a>`;
      }
      case "glossaryRef":
        if (!Object.hasOwn(bundle.glossary, node.termId)) {
          throw new Error(`Unknown glossary term "${node.termId}" in ${bundle.id}.`);
        }
        return `<span class="chapter-glossary-reference-wrap" data-term="${escapeStaticHtml(node.termId)}"><button type="button" class="chapter-glossary-reference" data-term-id="${escapeStaticHtml(node.termId)}" aria-expanded="false">${renderInline(node.children, bundle)}</button></span>`;
    }
  }).join("");
}

function renderBlocks(
  nodes: BlockNode[],
  bundle: ChapterBundle,
  includeHeadingIds = true,
  state: RenderState = createRenderState(),
): string {
  return nodes.map((node) => renderBlock(node, bundle, includeHeadingIds, state)).join("");
}

function renderBlock(
  node: BlockNode,
  bundle: ChapterBundle,
  includeHeadingIds: boolean,
  state: RenderState,
): string {
  switch (node.type) {
    case "paragraph":
      return `<p>${renderInline(node.children, bundle)}</p>`;
    case "heading": {
      const id = headingId(node);
      const attributes = includeHeadingIds && id
        ? ` id="${escapeStaticHtml(id)}" data-section-id="${escapeStaticHtml(id)}" data-chapter-heading="true"`
        : "";
      return `<h${node.depth}${attributes}>${renderInline(node.children, bundle)}</h${node.depth}>`;
    }
    case "list":
      return `<${node.ordered ? "ol" : "ul"}>${renderBlocks(node.children, bundle, includeHeadingIds, state)}</${node.ordered ? "ol" : "ul"}>`;
    case "listItem":
      return `<li>${renderBlocks(node.children, bundle, includeHeadingIds, state)}</li>`;
    case "table": {
      const rows = node.children.map((row) => {
        const cells = row.children.map((cell) => `<td>${renderInline(cell.children, bundle)}</td>`).join("");
        return `<tr>${cells}</tr>`;
      });
      const body = rows.length > 1 ? `<tbody>${rows.slice(1).join("")}</tbody>` : `<tbody>${rows.join("")}</tbody>`;
      const head = rows.length > 1 ? `<thead>${rows[0]}</thead>` : "";
      return `<div class="markdown-table-scroll"><table>${head}${body}</table></div>`;
    }
    case "tableRow":
      return `<tr>${renderBlocks(node.children, bundle, includeHeadingIds, state)}</tr>`;
    case "tableCell":
      return `<td>${renderInline(node.children, bundle)}</td>`;
    case "blockquote":
      return `<blockquote>${renderBlocks(node.children, bundle, includeHeadingIds, state)}</blockquote>`;
    case "thematicBreak":
      return "<hr>";
    case "codeBlock": {
      const language = node.lang ? ` class="language-${escapeStaticHtml(node.lang)}"` : "";
      return `<pre><code${language}>${escapeStaticHtml(node.value)}</code></pre>`;
    }
    case "mathBlock":
      return katex.renderToString(node.value, {
        displayMode: true,
        throwOnError: false,
        strict: "ignore",
        output: "html",
      });
    case "image":
      return safeHref(node.src) === null
        ? `<span>Image blocked: ${escapeStaticHtml(node.alt || node.src)}</span>`
        : `<img src="${escapeStaticHtml(node.src)}" alt="${escapeStaticHtml(node.alt)}"${node.title ? ` title="${escapeStaticHtml(node.title)}"` : ""}>`;
    case "component":
      switch (node.name) {
        case "Callout":
          return `<blockquote class="callout" data-type="${node.props.type}"><div class="callout-title">${node.props.type}</div>`
            + `<div class="callout-content">${renderBlocks(node.children ?? [], bundle, includeHeadingIds, state)}</div></blockquote>`;
        case "Example":
          return `<details class="chapter-inline-example"><summary>${escapeStaticHtml(node.props.title)}</summary>`
            + `${renderBlocks(node.props.question, bundle, includeHeadingIds, state)}`
            + `<details><summary>Show answer</summary>${renderBlocks(node.props.answer, bundle, includeHeadingIds, state)}</details></details>`;
        case "Diagram": {
          const diagram = bundle.diagrams.find((item) => item.id === node.props.id);
          if (!diagram || diagram.kind !== node.props.kind) {
            throw new Error(`Missing or mismatched diagram "${node.props.id}" in ${bundle.id}.`);
          }
          const renderedId = occurrenceId(diagram.id, state.diagramCounts);
          const source = escapeStaticHtml(diagram.source);
          const content = diagram.kind === "mermaid"
            ? `<div class="obsidian-mermaid mermaid" data-diagram-source>${source}</div>`
            : `<div class="tikz-wrapper"><div class="tikz-loading">Rendering diagram…</div><div class="tikz-source" hidden>${source}</div></div>`;
          return `<figure data-diagram data-diagram-id="${escapeStaticHtml(renderedId)}" data-diagram-kind="${diagram.kind}">${content}</figure>`;
        }
        case "Desmos": {
          const graph = bundle.desmos.find((item) => item.id === node.props.id);
          if (!graph || graph.kind !== node.props.kind) {
            throw new Error(`Missing compiled Desmos block "${node.props.id}" in ${bundle.id}.`);
          }
          const renderedId = occurrenceId(graph.id, state.desmosCounts);
          return `<div data-desmos data-id="${escapeStaticHtml(renderedId)}" data-kind="${graph.kind}">`
            + `<script type="application/json" data-desmos-request>${safeJson(graph.data)}</script></div>`;
        }
      }
  }
}

function sectionNodes(nodes: BlockNode[], targetId: string): BlockNode[] {
  const start = nodes.findIndex((node) => node.type === "heading" && headingId(node) === targetId);
  if (start < 0) return [];
  const heading = nodes[start];
  if (heading.type !== "heading") return [];
  let end = start + 1;
  while (end < nodes.length) {
    const node = nodes[end];
    if (node.type === "heading" && node.depth <= heading.depth) break;
    end += 1;
  }
  return nodes.slice(start, end);
}

function renderNotes(nodes: BlockNode[], bundle: ChapterBundle, state: RenderState): string {
  let html = "";
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const id = headingId(node);
    const examples = id && isSectionId(id)
      ? bundle.examples.filter((example) => example.from.includes(id))
      : [];
    html += renderBlock(node, bundle, true, state);
    if (node.type === "heading" && id && examples.length > 0) {
      html += `<div class="chapter-example-links">${examples.map((example) => (
        `<button type="button" data-example-target="${escapeStaticHtml(example.id)}">Go to example: ${escapeStaticHtml(example.title)}</button>`
      )).join("")}</div>`;
    }
  }
  return html;
}

function renderExamples(bundle: ChapterBundle, state: RenderState): string {
  return `<section class="chapter-example-list" data-examples><h2>Worked examples</h2>${bundle.examples.map((example) => {
    const concepts = example.concepts.map((id) => (
      `<section class="chapter-example-concept" data-concept-id="${escapeStaticHtml(id)}">`
      + `${renderBlocks(sectionNodes(bundle.notes.tree, id), bundle, false, state)}</section>`
    )).join("");
    const from = example.from.map((id) => (
      `<div class="chapter-example-source"><a href="#${escapeStaticHtml(id)}" data-example-section="${escapeStaticHtml(id)}">${escapeStaticHtml(id)}</a>`
      + `<button type="button" data-return-section="${escapeStaticHtml(id)}">Return To Section</button></div>`
    )).join("");
    return `<article class="chapter-example-card" id="chapter-example-${escapeStaticHtml(example.id)}" data-example-id="${escapeStaticHtml(example.id)}">`
      + `<h3>${escapeStaticHtml(example.title)}</h3><div class="chapter-example-columns">`
      + `<section class="chapter-example-from">${from}</section>`
      + `<section class="chapter-example-question">${renderBlocks(example.question, bundle, true, state)}`
      + `<details class="chapter-example-answer"><summary>Reveal answer</summary>${renderBlocks(example.answer, bundle, true, state)}</details></section>`
      + `<section class="chapter-example-concepts">${concepts}</section></div></article>`;
  }).join("")}</section>`;
}

function glossaryText(
  text: string,
  references: ChapterBundle["facts"][number]["glossaryRefs"]["brief"],
  bundle: ChapterBundle,
): string {
  let cursor = 0;
  let html = "";
  for (const reference of references) {
    if (reference.start < cursor || reference.end > text.length || reference.end <= reference.start) {
      throw new Error(`Invalid glossary offsets in ${bundle.id}.`);
    }
    if (!Object.hasOwn(bundle.glossary, reference.termId)) {
      throw new Error(`Unknown glossary term "${reference.termId}" in ${bundle.id}.`);
    }
    html += renderMarkdownInline(text.slice(cursor, reference.start));
    html += `<span class="chapter-glossary-reference-wrap" data-term="${escapeStaticHtml(reference.termId)}"><button type="button" class="chapter-glossary-reference" data-term-id="${escapeStaticHtml(reference.termId)}" aria-expanded="false">${renderMarkdownInline(text.slice(reference.start, reference.end))}</button></span>`;
    cursor = reference.end;
  }
  return html + renderMarkdownInline(text.slice(cursor));
}

function renderFacts(bundle: ChapterBundle, state: RenderState): string {
  const overview = bundle.outline.find((entry) => entry.id === "chapter-overview");
  const overviewHtml = overview?.brief
    ? `<section class="chapter-reader-fact chapter-reader-overview" data-section-id="chapter-overview">`
      + `<h2>Chapter Brief</h2><p class="chapter-reader-fact-summary">${renderMarkdownInline(overview.brief)}</p></section>`
    : "";
  return `<section class="chapter-reader-facts" data-facts>${overviewHtml}${bundle.facts.map((fact) => {
    const brief = fact.brief
      ? `<div class="chapter-reader-fact-summary"><h3>Summary</h3>`
        + `<p>${glossaryText(fact.brief, fact.glossaryRefs.brief, bundle)}</p></div>`
      : "";
    const points = fact.points.map((point, index) => {
      const references = fact.glossaryRefs.points[index];
      if (!references) throw new Error(`Missing glossary point references in ${bundle.id}.`);
      return `<li>${glossaryText(point, references, bundle)}</li>`;
    }).join("");
    const importantNotes = points
      ? `<div class="chapter-reader-fact-important"><h3>Important Notes</h3><ul>${points}</ul></div>`
      : "";
    return `<section class="chapter-reader-fact" data-section-id="${escapeStaticHtml(fact.sectionId)}">`
      + `<h2>${escapeStaticHtml(fact.sectionId)}</h2>${brief}${importantNotes}`
      + `${renderBlocks(fact.visuals, bundle, false, state)}</section>`;
  }).join("")}</section>`;
}

export function renderChapterFragment(bundle: ChapterBundle): string {
  const data = {
    outline: bundle.outline,
    tree: readerTree(bundle),
    glossary: bundle.glossary,
    searchIndex: [
      ...bundle.outline.map(({ id, brief }) => ({ sectionId: id, blockId: `${id}-brief`, text: brief })),
      ...bundle.facts.map(({ sectionId: id, brief, points }) => ({
        sectionId: id,
        blockId: `${id}-facts`,
        text: [brief, ...points].filter(Boolean).join(" "),
      })),
      ...bundle.examples.map(({ id, title, from }) => ({
        sectionId: from[0] ?? "preamble",
        blockId: id,
        text: title,
      })),
    ],
    noteText: textFromBlocks(bundle.notes.tree),
  };
  const json = `<script type="application/json" data-chapter-data>${safeJson(data)}</script>`;
  const renderState = createRenderState();
  return `<article data-chapter-id="${escapeStaticHtml(bundle.id)}" data-kind="chapter" data-renderer-version="${STATIC_RENDERER_VERSION}">`
    + `<h1 data-chapter-title>${escapeStaticHtml(bundle.title)}</h1>${outlineHtml(bundle)}`
    + `<section class="chapter-reader-content" data-notes>${renderNotes(bundle.notes.tree, bundle, renderState)}</section>`
    + `${renderExamples(bundle, renderState)}${renderFacts(bundle, renderState)}${json}</article>`;
}

export function renderPageFragment(source: string, sourcePath: string): string {
  const rendered = renderMarkdownDocument(source, sourcePath);
  const id = path.basename(sourcePath).replace(/\.(?:md|mdx)$/i, "").toLowerCase();
  const data = safeJson({
    outline: rendered.outline,
    searchIndex: rendered.searchIndex,
    tree: pageReaderTree(rendered.outline),
  });
  return `<article data-chapter-id="${escapeStaticHtml(id)}" data-kind="page" data-renderer-version="${STATIC_RENDERER_VERSION}">`
    + `<section data-content>${rendered.html}</section>`
    + `<script type="application/json" data-chapter-data>${data}</script></article>`;
}

async function loadChapterSources(root: string, chapter: ChapterClassification): Promise<ChapterSources> {
  const directory = path.resolve(root, chapter.directory);
  const [glossary, notes, cnotes] = await Promise.all([
    readFile(path.join(directory, `${chapter.id}-GLOSSARY.mdx`), "utf8"),
    readFile(path.join(directory, `${chapter.id}-NOTES.mdx`), "utf8"),
    readFile(path.join(directory, `${chapter.id}-CNOTES.mdx`), "utf8"),
  ]);
  return { glossary, notes, cnotes };
}

async function listMarkdownSources(root: string): Promise<string[]> {
  const sourceRoot = path.resolve(root, "src");
  const files: string[] = [];

  async function visit(directory: string, prefix: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      const relativePath = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        await visit(path.join(directory, entry.name), relativePath);
      } else if (entry.isFile() && /\.(?:md|mdx)$/i.test(entry.name)) {
        files.push(relativePath);
      }
    }
  }

  await visit(sourceRoot, "src");
  return files;
}

function isChapterSource(sourcePath: string, chapters: ChapterClassification[]): boolean {
  const normalizedPath = sourcePath.toLocaleUpperCase("en");
  return chapters.some((chapter) => {
    const directory = chapter.directory.toLocaleUpperCase("en");
    const prefix = `${directory}/${chapter.id.toLocaleUpperCase("en")}-`;
    if (!normalizedPath.startsWith(prefix)) return false;
    return /^(?:GLOSSARY|NOTES|CNOTES)\.(?:MD|MDX)$/.test(normalizedPath.slice(prefix.length));
  });
}

function chapterOutputPath(chapter: ChapterClassification): string {
  const sourceDirectory = chapter.directory.replace(/^src\//, "");
  const parent = path.posix.dirname(sourceDirectory);
  return path.posix.join(parent === "." ? "" : parent, `${chapter.id}.html`);
}

function isManifest(value: unknown): value is HtmlManifest {
  if (typeof value !== "object" || value === null || !("rendererVersion" in value) || !("files" in value)) {
    return false;
  }
  const files = value.files;
  return typeof value.rendererVersion === "string"
    && typeof files === "object"
    && files !== null
    && Object.values(files).every((record) => (
      typeof record === "object"
      && record !== null
      && "kind" in record
      && (record.kind === "chapter" || record.kind === "page")
      && "FilePaths" in record
      && Array.isArray(record.FilePaths)
      && "FileSHAs" in record
      && typeof record.FileSHAs === "object"
      && record.FileSHAs !== null
    ));
}

export async function buildStaticHtml(
  root: string,
  outputDirectory: string,
  options: StaticBuildOptions = {},
): Promise<StaticBuildResult> {
  const validation = await validateSourceTree(root);
  if (validation.errors.length > 0) {
    throw new Error(validation.errors
      .map(({ file, line, reason }) => `${file}:${line}: ${reason}`)
      .join("\n"));
  }
  const sourcePaths = await listMarkdownSources(root);
  const chapters = validation.chapters;
  const selectedChapters = chapters.filter((chapter) =>
    chapter.status === "migrated" && (!options.chapterId || chapter.id === options.chapterId));
  if (options.chapterId && selectedChapters.length === 0) {
    throw new Error(`No migrated chapter was found for "${options.chapterId}".`);
  }
  const pagePaths = sourcePaths.filter((sourcePath) =>
    !isChapterSource(sourcePath, chapters)
    && (!options.plainSourcePath || sourcePath === options.plainSourcePath));
  if (options.plainSourcePath && pagePaths.length === 0) {
    throw new Error(`No standalone Markdown source was found at "${options.plainSourcePath}".`);
  }

  const files: HtmlManifest["files"] = {};
  const generated = new Map<string, string>();
  const warnings: StaticBuildResult["warnings"] = [];

  for (const chapter of selectedChapters) {
    const sources = await loadChapterSources(root, chapter);
    const { bundle, warnings: chapterWarnings } = await buildChapter(chapter.id, sources);
    const chapterSourcePaths = (["GLOSSARY", "NOTES", "CNOTES"] as const)
      .map((role) => `${chapter.directory}/${chapter.id}-${role}.mdx`);
    const outputPath = chapterOutputPath(chapter);
    files[outputPath] = {
      kind: "chapter",
      FilePaths: chapterSourcePaths,
      FileSHAs: bundle.sourceShas,
    };
    generated.set(outputPath, renderChapterFragment(bundle));
    warnings.push(...chapterWarnings);
  }

  for (const sourcePath of pagePaths) {
    const source = await readFile(path.resolve(root, sourcePath), "utf8");
    const outputPath = sourcePath.replace(/^src\//, "").replace(/\.(?:md|mdx)$/i, ".html");
    files[outputPath] = {
      kind: "page",
      FilePaths: [sourcePath],
      FileSHAs: { source: sha256(source) },
    };
    generated.set(outputPath, renderPageFragment(source, sourcePath));
  }

  const manifest: HtmlManifest = { rendererVersion: STATIC_RENDERER_VERSION, files };
  const previousManifestPath = path.join(outputDirectory, "manifest.json");
  let previous: HtmlManifest | undefined;
  try {
    const parsed: unknown = JSON.parse(await readFile(previousManifestPath, "utf8"));
    if (!isManifest(parsed)) throw new Error(`${previousManifestPath} has an invalid HTML manifest shape.`);
    previous = parsed;
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error && error.code === "ENOENT")) throw error;
  }

  const written: string[] = [];
  const skipped: string[] = [];
  await mkdir(outputDirectory, { recursive: true });
  for (const [relativePath, content] of generated) {
    const target = path.join(outputDirectory, relativePath);
    const currentRecord = files[relativePath];
    const oldRecord = previous?.files[relativePath];
    let unchanged = previous?.rendererVersion === STATIC_RENDERER_VERSION
      && JSON.stringify(oldRecord) === JSON.stringify(currentRecord);
    if (unchanged) {
      try {
        await readFile(target);
      } catch (error) {
        if (!(error instanceof Error) || !("code" in error && error.code === "ENOENT")) throw error;
        unchanged = false;
      }
    }
    if (unchanged) {
      skipped.push(relativePath);
      continue;
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${content}\n`, "utf8");
    written.push(relativePath);
  }

  for (const stalePath of Object.keys(previous?.files ?? {}).filter((filePath) => !files[filePath])) {
    const target = path.resolve(outputDirectory, stalePath);
    const relativeTarget = path.relative(outputDirectory, target);
    if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget) || !/\.html$/i.test(target)) {
      throw new Error(`The previous manifest contains an unsafe output path: ${stalePath}`);
    }
    await rm(target, { force: true });
  }

  await writeFile(previousManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { outputDirectory, manifest, written, skipped, warnings };
}

async function main(): Promise<void> {
  const root = process.cwd();
  const outputArgument = process.argv.find((argument) => argument.startsWith("--out-dir="));
  const outputDirectory = path.resolve(
    outputArgument?.slice("--out-dir=".length) ?? path.join(os.tmpdir(), "notebooks-mdx-v2"),
  );
  const result = await buildStaticHtml(root, outputDirectory);
  for (const output of result.written) console.info(`Built ${output}.`);
  for (const output of result.skipped) console.info(`Skipped unchanged ${output}.`);
  for (const warning of result.warnings) {
    console.warn(`${warning.file}:${warning.line}: ${warning.message}`);
  }
  for (const [output, record] of Object.entries(result.manifest.files)) {
    if (record.kind === "chapter" && output.startsWith("AI-NOTES/")) {
      console.info(`Built chapter record from ${record.FilePaths.length} sources.`);
    }
  }
  console.info(`Static HTML output: ${result.outputDirectory}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
