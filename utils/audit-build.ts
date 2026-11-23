import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import type { BlockNode, ChapterBundle, ChapterManifest, InlineNode, SectionId } from "../src/research-and-development/schema/chapter.js";

type HtmlNode = DefaultTreeAdapterMap["node"];
type HtmlElement = DefaultTreeAdapterMap["element"];
type AuditResult = {
  chapterId: string;
  htmlPath: string;
  headings: number;
  examples: number;
  glossaryReferences: number;
  diagrams: number;
  compiledDiagrams: number;
  desmosSkipped: number;
  compiledDesmos: number;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function safeHref(href: string): string | null {
  return /^(?:javascript|data|vbscript):/i.test(href.trim()) ? null : href;
}

function inlineText(nodes: InlineNode[]): string {
  return nodes.map((node) => {
    if ("value" in node) return node.value;
    return inlineText(node.children);
  }).join("");
}

function sectionId(node: BlockNode): string | undefined {
  if (node.type !== "heading") return undefined;
  if (node.id) return node.id;
  const match = inlineText(node.children).match(/^SECTION\s+(\d+)\b/i);
  return match ? `SECTION-${match[1]}` : undefined;
}

function isSectionId(value: string): value is SectionId {
  return /^\d+\.\d+(?:\.\d+)?$/.test(value);
}

function renderInline(nodes: InlineNode[], bundle: ChapterBundle): string {
  return nodes.map((node) => {
    switch (node.type) {
      case "text":
        return escapeHtml(node.value);
      case "inlineCode":
        return `<code>${escapeHtml(node.value)}</code>`;
      case "mathInline":
        return `<span class="chapter-math-inline" data-tex="${escapeAttribute(node.value)}">${escapeHtml(node.value)}</span>`;
      case "emphasis":
        return `<em>${renderInline(node.children, bundle)}</em>`;
      case "strong":
        return `<strong>${renderInline(node.children, bundle)}</strong>`;
      case "link": {
        const children = renderInline(node.children, bundle);
        const href = safeHref(node.href);
        if (href === null) return `<span>${children}</span>`;
        const title = node.title === undefined ? "" : ` title="${escapeAttribute(node.title)}"`;
        const external = /^https?:\/\//i.test(href);
        return `<a href="${escapeAttribute(href)}"${title}${external ? ' target="_blank" rel="noreferrer"' : ""}>${children}</a>`;
      }
      case "glossaryRef": {
        if (!Object.hasOwn(bundle.glossary, node.termId)) {
          throw new Error(`Unknown glossary term "${node.termId}" in ${bundle.id}.`);
        }
        return `<span class="chapter-glossary-reference-wrap"><button type="button" class="chapter-glossary-reference" data-term-id="${escapeAttribute(node.termId)}" aria-expanded="false">${renderInline(node.children, bundle)}</button></span>`;
      }
    }
  }).join("");
}

function renderBlocks(
  nodes: BlockNode[],
  bundle: ChapterBundle,
  options: { includeHeadingIds?: boolean } = {},
): string {
  return nodes.map((node) => renderBlock(node, bundle, options)).join("");
}

function renderBlock(
  node: BlockNode,
  bundle: ChapterBundle,
  options: { includeHeadingIds?: boolean },
): string {
  switch (node.type) {
    case "paragraph":
      return `<p>${renderInline(node.children, bundle)}</p>`;
    case "heading": {
      const id = sectionId(node);
      const attributes = options.includeHeadingIds === false || !id
        ? ""
        : ` id="${escapeAttribute(id)}" data-chapter-heading="true"`;
      return `<h${node.depth}${attributes}>${renderInline(node.children, bundle)}</h${node.depth}>`;
    }
    case "list": {
      const tag = node.ordered ? "ol" : "ul";
      const start = node.ordered && node.start !== undefined && node.start !== 1
        ? ` start="${node.start}"`
        : "";
      return `<${tag}${start}>${renderBlocks(node.children, bundle, options)}</${tag}>`;
    }
    case "listItem":
      return `<li>${renderBlocks(node.children, bundle, options)}</li>`;
    case "table":
      return `<div class="markdown-table-scroll"><table><tbody>${renderBlocks(node.children, bundle, options)}</tbody></table></div>`;
    case "tableRow":
      return `<tr>${renderBlocks(node.children, bundle, options)}</tr>`;
    case "tableCell":
      return `<td>${renderInline(node.children, bundle)}</td>`;
    case "blockquote":
      return `<blockquote>${renderBlocks(node.children, bundle, options)}</blockquote>`;
    case "thematicBreak":
      return "<hr>";
    case "codeBlock":
      return `<pre><code${node.lang ? ` class="language-${escapeAttribute(node.lang)}"` : ""}>${escapeHtml(node.value)}</code></pre>`;
    case "mathBlock":
      return `<div class="chapter-math-block" data-tex="${escapeAttribute(node.value)}">${escapeHtml(node.value)}</div>`;
    case "image":
      return safeHref(node.src) === null
        ? `<span>Image blocked: ${escapeHtml(node.alt || node.src)}</span>`
        : `<a class="chapter-image-link" href="${escapeAttribute(node.src)}" title="${escapeAttribute(node.title ?? "")}">Open image: ${escapeHtml(node.alt || node.src)}</a>`;
    case "component":
      switch (node.name) {
        case "Callout":
          return `<aside class="chapter-callout chapter-callout-${node.props.type}"><strong>${node.props.type}</strong>${renderBlocks(node.children ?? [], bundle, options)}</aside>`;
        case "Example":
          return `<details class="chapter-inline-example"><summary>${escapeHtml(node.props.title)}</summary>${renderBlocks(node.props.question, bundle, options)}<details><summary>Show answer</summary>${renderBlocks(node.props.answer, bundle, options)}</details></details>`;
        case "Diagram": {
          const diagram = bundle.diagrams.find((item) => item.id === node.props.id);
          if (!diagram || diagram.kind !== node.props.kind) {
            throw new Error(`Missing or mismatched compiled diagram "${node.props.id}" in ${bundle.id}.`);
          }
          const title = node.props.title ?? diagram.title ?? `${diagram.kind} diagram`;
          return `<figure data-diagram-id="${escapeAttribute(diagram.id)}" data-diagram-kind="${diagram.kind}"><button type="button" aria-label="Open ${escapeAttribute(title)}">${escapeHtml(title)}</button><pre class="chapter-diagram-source">${escapeHtml(diagram.source)}</pre></figure>`;
        }
        case "Desmos": {
          const graph = bundle.desmos.find((item) => item.id === node.props.id);
          if (!graph || graph.kind !== node.props.kind) {
            throw new Error(`Missing or mismatched compiled Desmos block "${node.props.id}" in ${bundle.id}.`);
          }
          return `<figure data-desmos-skipped="true" data-desmos-id="${escapeAttribute(graph.id)}"><figcaption>Desmos excluded from build audit</figcaption></figure>`;
        }
      }
  }
}

function sectionNodes(nodes: BlockNode[], targetId: string): BlockNode[] {
  const start = nodes.findIndex((node) => node.type === "heading" && sectionId(node) === targetId);
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

function renderNotes(nodes: BlockNode[], bundle: ChapterBundle): string {
  let html = "";
  let index = 0;
  while (index < nodes.length) {
    const node = nodes[index];
    const id = sectionId(node);
    const examples = id && isSectionId(id)
      ? bundle.examples.filter((example) => example.from.includes(id))
      : [];
    if (node.type !== "heading" || !id || examples.length === 0) {
      html += renderBlock(node, bundle, {});
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < nodes.length) {
      const following = nodes[end];
      if (following.type === "heading" && following.depth <= node.depth) break;
      end += 1;
    }
    html += renderBlocks(nodes.slice(index, end), bundle);
    html += `<div class="chapter-example-links">${examples.map((example) => (
      `<button type="button" data-example-target="${escapeAttribute(example.id)}">Go to example: ${escapeHtml(example.title)}</button>`
    )).join("")}</div>`;
    index = end;
  }
  return html;
}

function renderExamples(bundle: ChapterBundle): string {
  return `<section class="chapter-example-list"><h2>Worked examples</h2>${bundle.examples.map((example) => {
    const concepts = example.concepts.map((id) => {
      const nodes = sectionNodes(bundle.notes.tree, id);
      return `<section class="chapter-example-concept" data-concept-id="${escapeAttribute(id)}"><h4>${escapeHtml(id)}</h4>${renderBlocks(nodes, bundle, { includeHeadingIds: false })}</section>`;
    }).join("");
    const from = example.from.map((id) => `<span data-example-section="${escapeAttribute(id)}">${escapeHtml(id)}</span>`).join("");
    return `<article class="chapter-example-card" id="chapter-example-${escapeAttribute(example.id)}"><h3>${escapeHtml(example.title)}</h3><div class="chapter-example-columns"><section>${from}</section><section class="chapter-example-question">${renderBlocks(example.question, bundle)}<details class="chapter-example-answer"><summary>Reveal answer</summary>${renderBlocks(example.answer, bundle)}</details></section><section>${concepts}</section></div></article>`;
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
    html += escapeHtml(text.slice(cursor, reference.start));
    html += `<span class="chapter-glossary-reference-wrap"><button type="button" class="chapter-glossary-reference" data-term-id="${escapeAttribute(reference.termId)}" aria-expanded="false">${escapeHtml(text.slice(reference.start, reference.end))}</button></span>`;
    cursor = reference.end;
  }
  return html + escapeHtml(text.slice(cursor));
}

export function renderChapterHtml(bundle: ChapterBundle): string {
  const facts = bundle.facts.map((fact) => {
    const brief = fact.brief
      ? `<p>${glossaryText(fact.brief, fact.glossaryRefs.brief, bundle)}</p>`
      : "";
    const points = fact.points.map((point, index) => {
      const references = fact.glossaryRefs.points[index];
      if (!references) throw new Error(`Missing glossary point references in ${bundle.id}.`);
      return `<li>${glossaryText(point, references, bundle)}</li>`;
    }).join("");
    return `<section class="chapter-reader-fact"><h2>${escapeHtml(fact.sectionId)}</h2>${brief}<ul>${points}</ul></section>`;
  }).join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(bundle.title)}</title></head><body><main data-chapter-id="${escapeAttribute(bundle.id)}"><h1>${escapeHtml(bundle.title)}</h1><article class="chapter-reader-content">${renderNotes(bundle.notes.tree, bundle)}${renderExamples(bundle)}</article><aside class="chapter-reader-facts">${facts}</aside></main></body></html>`;
}

function isElement(node: HtmlNode): node is HtmlElement {
  return "tagName" in node;
}

function walkHtml(node: HtmlNode, visit: (node: HtmlNode) => void): void {
  visit(node);
  if ("childNodes" in node) node.childNodes.forEach((child) => walkHtml(child, visit));
  if ("content" in node && node.nodeName === "template") {
    node.content.childNodes.forEach((child) => walkHtml(child, visit));
  }
}

function referencedVisualIds(
  nodes: BlockNode[],
  kind: "Diagram" | "Desmos",
  ids = new Set<string>(),
): Set<string> {
  for (const node of nodes) {
    if (node.type !== "component") {
      if ("children" in node && node.type !== "paragraph" && node.type !== "heading" && node.type !== "tableCell") {
        referencedVisualIds(node.children, kind, ids);
      }
      continue;
    }
    if (node.name === kind) ids.add(node.props.id);
    if (node.name === "Example") {
      referencedVisualIds(node.props.question, kind, ids);
      referencedVisualIds(node.props.answer, kind, ids);
    }
    if (node.children) referencedVisualIds(node.children, kind, ids);
  }
  return ids;
}

function glossaryReferenceCount(nodes: BlockNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.type === "paragraph" || node.type === "heading" || node.type === "tableCell") {
      const countInline = (inline: InlineNode[]): number => inline.reduce((total, item) => {
        if (item.type === "glossaryRef") return total + 1;
        if (item.type === "emphasis" || item.type === "strong") return total + countInline(item.children);
        if (item.type === "link") return total + countInline(item.children);
        return total;
      }, 0);
      count += countInline(node.children);
    } else if (node.type === "component") {
      if (node.name === "Example") {
        count += glossaryReferenceCount(node.props.question);
        count += glossaryReferenceCount(node.props.answer);
      }
      if (node.children) count += glossaryReferenceCount(node.children);
    } else if ("children" in node) {
      count += glossaryReferenceCount(node.children);
    }
  }
  return count;
}

function attribute(element: HtmlElement, name: string): string | undefined {
  return element.attrs.find((item) => item.name === name)?.value;
}

export function auditRenderedHtml(
  bundle: ChapterBundle,
  html: string,
): Omit<AuditResult, "chapterId" | "htmlPath"> {
  const parseErrors: string[] = [];
  const document = parse(html, { onParseError: (error) => parseErrors.push(error.code) });
  if (parseErrors.length > 0) {
    throw new Error(`${bundle.id} rendered invalid HTML: ${parseErrors.join(", ")}`);
  }

  const elements: HtmlElement[] = [];
  walkHtml(document, (node) => {
    if (!isElement(node)) return;
    if (["script", "iframe", "object", "embed"].includes(node.tagName)) {
      throw new Error(`${bundle.id} audit HTML contains forbidden <${node.tagName}> markup.`);
    }
    elements.push(node);
  });
  const count = (predicate: (element: HtmlElement) => boolean) => elements.filter(predicate).length;
  const ids = elements.map((element) => attribute(element, "id")).filter((id): id is string => Boolean(id));
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${bundle.id} rendered duplicate HTML IDs.`);
  }

  const exampleIds = new Set(elements
    .map((element) => attribute(element, "id"))
    .filter((id): id is string => id?.startsWith("chapter-example-") ?? false));
  for (const example of bundle.examples) {
    if (!exampleIds.has(`chapter-example-${example.id}`)) {
      throw new Error(`${bundle.id} HTML is missing example "${example.id}".`);
    }
  }

  const diagramIds = new Set(elements
    .map((element) => attribute(element, "data-diagram-id"))
    .filter((id): id is string => Boolean(id)));
  const referencedDiagrams = referencedVisualIds(bundle.notes.tree, "Diagram");
  for (const example of bundle.examples) {
    referencedVisualIds(example.question, "Diagram", referencedDiagrams);
    referencedVisualIds(example.answer, "Diagram", referencedDiagrams);
  }
  for (const id of referencedDiagrams) {
    if (!diagramIds.has(id)) throw new Error(`${bundle.id} HTML is missing diagram "${id}".`);
  }
  const desmosSkippedIds = new Set(elements
    .filter((element) => attribute(element, "data-desmos-skipped") === "true")
    .map((element) => attribute(element, "data-desmos-id"))
    .filter((id): id is string => Boolean(id)));
  const referencedDesmos = referencedVisualIds(bundle.notes.tree, "Desmos");
  for (const example of bundle.examples) {
    referencedVisualIds(example.question, "Desmos", referencedDesmos);
    referencedVisualIds(example.answer, "Desmos", referencedDesmos);
  }
  for (const id of referencedDesmos) {
    if (!desmosSkippedIds.has(id)) {
      throw new Error(`${bundle.id} HTML audit did not account for Desmos block "${id}".`);
    }
  }

  const expectedHeadingIds = new Set<string>();
  const visitBlocks = (nodes: BlockNode[]) => {
    for (const node of nodes) {
      if (node.type === "heading") {
        const id = sectionId(node);
        if (id) expectedHeadingIds.add(id);
      }
      if (node.type === "component") {
        if (node.name === "Example") {
          visitBlocks(node.props.question);
          visitBlocks(node.props.answer);
        }
        if (node.children) visitBlocks(node.children);
      } else if ("children" in node) {
        if (node.type !== "heading" && node.type !== "paragraph" && node.type !== "tableCell") {
          visitBlocks(node.children);
        }
      }
    }
  };
  visitBlocks(bundle.notes.tree);
  const renderedHeadingIds = new Set(elements
    .filter((element) => attribute(element, "data-chapter-heading") === "true")
    .map((element) => attribute(element, "id"))
    .filter((id): id is string => Boolean(id)));
  for (const id of expectedHeadingIds) {
    if (!renderedHeadingIds.has(id)) throw new Error(`${bundle.id} HTML is missing section heading "${id}".`);
  }

  const expectedGlossaryReferences = bundle.facts.reduce((total, fact) => (
    total + fact.glossaryRefs.brief.length + fact.glossaryRefs.points.reduce((count, refs) => count + refs.length, 0)
  ), glossaryReferenceCount(bundle.notes.tree)
    + bundle.examples.reduce((total, example) => (
      total + glossaryReferenceCount(example.question) + glossaryReferenceCount(example.answer)
    ), 0));
  const glossaryReferences = count((element) => element.attrs.some(
    (item) => item.name === "class" && item.value.split(/\s+/).includes("chapter-glossary-reference"),
  ));
  if (glossaryReferences < expectedGlossaryReferences) {
    throw new Error(`${bundle.id} HTML is missing rendered glossary references.`);
  }
  if (elements.some((element) => element.tagName === "a" && attribute(element, "href")?.startsWith("javascript:"))) {
    throw new Error(`${bundle.id} HTML contains an unsafe JavaScript link.`);
  }

  return {
    headings: renderedHeadingIds.size,
    examples: exampleIds.size,
    glossaryReferences,
    diagrams: referencedDiagrams.size,
    compiledDiagrams: bundle.diagrams.length,
    desmosSkipped: desmosSkippedIds.size,
    compiledDesmos: bundle.desmos.length,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSourceShas(value: unknown): value is ChapterBundle["sourceShas"] {
  return isRecord(value)
    && ["glossary", "notes", "cnotes"].every((key) => (
      typeof value[key] === "string" && /^[a-f0-9]{64}$/.test(value[key])
    ));
}

function isOutlineId(value: unknown): value is ChapterBundle["outline"][number]["id"] {
  return typeof value === "string"
    && (value === "chapter-overview"
      || /^SECTION-\d+$/.test(value)
      || /^\d+\.\d+(?:\.\d+)?$/.test(value));
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isGlossaryMatch(value: unknown): boolean {
  return isRecord(value)
    && typeof value.start === "number"
    && Number.isInteger(value.start)
    && typeof value.end === "number"
    && Number.isInteger(value.end)
    && typeof value.termId === "string";
}

function isVisualNode(value: unknown): value is ChapterBundle["facts"][number]["visuals"][number] {
  if (!isRecord(value)
    || value.type !== "component"
    || value.name === undefined
    || !isRecord(value.props)
    || value.props.name !== value.name) return false;

  if (value.name === "Diagram") {
    return isRecord(value.props)
      && value.props.name === "Diagram"
      && typeof value.props.id === "string"
      && value.props.id.trim().length > 0
      && (value.props.kind === "mermaid" || value.props.kind === "tikz")
      && (value.props.title === undefined || typeof value.props.title === "string");
  }
  if (value.name === "Desmos") {
    return isRecord(value.props)
      && value.props.name === "Desmos"
      && typeof value.props.id === "string"
      && value.props.id.trim().length > 0
      && (value.props.kind === "2d" || value.props.kind === "3d")
      && "data" in value.props
      && isJsonValue(value.props.data);
  }
  return false;
}

function isManifest(value: unknown): value is ChapterManifest {
  return isRecord(value)
    && value.schemaVersion === 3
    && typeof value.rendererVersion === "string"
    && value.rendererVersion.trim().length > 0
    && Array.isArray(value.chapters)
    && value.chapters.every((entry) => isRecord(entry)
      && typeof entry.id === "string"
      && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)
      && entry.bundle === `${entry.id}.json`
      && typeof entry.title === "string"
      && isSourceShas(entry.sourceShas));
}

function isBundle(value: unknown): value is ChapterBundle {
  return isRecord(value)
    && value.schemaVersion === 3
    && typeof value.id === "string"
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id)
    && typeof value.title === "string"
    && typeof value.rendererVersion === "string"
    && isSourceShas(value.sourceShas)
    && Array.isArray(value.outline)
    && value.outline.every((entry) => isRecord(entry)
      && isOutlineId(entry.id)
      && typeof entry.title === "string"
      && Number.isInteger(entry.importance)
      && Number(entry.importance) >= 0
      && Number(entry.importance) <= 3
      && typeof entry.brief === "string")
    && isRecord(value.notes)
    && Array.isArray(value.notes.tree)
    && Array.isArray(value.facts)
    && value.facts.every((fact) => isRecord(fact)
      && typeof fact.sectionId === "string"
      && isSectionId(fact.sectionId)
      && typeof fact.brief === "string"
      && Array.isArray(fact.points)
      && fact.points.every((point) => typeof point === "string")
      && Array.isArray(fact.visuals)
      && fact.visuals.every(isVisualNode)
      && isRecord(fact.glossaryRefs)
      && Array.isArray(fact.glossaryRefs.brief)
      && fact.glossaryRefs.brief.every(isGlossaryMatch)
      && Array.isArray(fact.glossaryRefs.points)
      && fact.glossaryRefs.points.every((points) => Array.isArray(points)
        && points.every(isGlossaryMatch)))
    && Array.isArray(value.examples)
    && isRecord(value.glossary)
    && Array.isArray(value.diagrams)
    && Array.isArray(value.desmos);
}

export async function auditBuildDirectory(
  buildDirectory: string,
  htmlDirectory: string,
): Promise<AuditResult[]> {
  const manifestPath = path.join(buildDirectory, "manifest.json");
  const manifestValue: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!isManifest(manifestValue) || manifestValue.chapters.length === 0) {
    throw new Error("Generated manifest is invalid or contains no chapters.");
  }
  const chapterIds = new Set<string>();
  const results: AuditResult[] = [];
  await mkdir(htmlDirectory, { recursive: true });
  const expectedBundles = new Set(["manifest.json", ...manifestValue.chapters.map(({ bundle }) => bundle)]);
  const unexpectedBundles = (await readdir(buildDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && !expectedBundles.has(entry.name))
    .map((entry) => entry.name);
  if (unexpectedBundles.length > 0) {
    throw new Error(`Build directory contains unlisted JSON bundles: ${unexpectedBundles.join(", ")}`);
  }

  for (const entry of manifestValue.chapters) {
    if (chapterIds.has(entry.id)) throw new Error(`Generated manifest repeats chapter "${entry.id}".`);
    chapterIds.add(entry.id);

    const bundlePath = path.join(buildDirectory, entry.bundle);
    const bundleValue: unknown = JSON.parse(await readFile(bundlePath, "utf8"));
    if (!isBundle(bundleValue)) throw new Error(`Generated bundle "${entry.id}" has an invalid shape.`);
    if (bundleValue.id !== entry.id
      || bundleValue.title !== entry.title
      || bundleValue.rendererVersion !== manifestValue.rendererVersion
      || JSON.stringify(bundleValue.sourceShas) !== JSON.stringify(entry.sourceShas)) {
      throw new Error(`Generated bundle "${entry.id}" does not match its manifest entry.`);
    }

    const html = renderChapterHtml(bundleValue);
    const audited = auditRenderedHtml(bundleValue, html);
    const htmlPath = path.join(htmlDirectory, `${entry.id}.html`);
    await writeFile(htmlPath, `${html}\n`, "utf8");
    results.push({ chapterId: entry.id, htmlPath, ...audited });
  }
  return results;
}

async function main(): Promise<void> {
  const buildArgument = process.argv.find((argument) => argument.startsWith("--build-dir="));
  const htmlArgument = process.argv.find((argument) => argument.startsWith("--html-dir="));
  const buildDirectory = path.resolve(buildArgument?.slice("--build-dir=".length) ?? "build");
  const htmlDirectory = path.resolve(htmlArgument?.slice("--html-dir=".length) ?? "build-audit");
  const results = await auditBuildDirectory(buildDirectory, htmlDirectory);
  for (const result of results) {
    console.info(
      `Audited ${result.chapterId}: ${result.headings} headings, ${result.examples} examples, `
      + `${result.glossaryReferences} glossary references, ${result.diagrams} diagrams, `
      + `${result.compiledDiagrams} compiled diagrams, ${result.desmosSkipped} rendered Desmos blocks excluded `
      + `(${result.compiledDesmos} compiled). HTML: ${result.htmlPath}`,
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
