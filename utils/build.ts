import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  BlockNode,
  ChapterBundle,
  ChapterManifest,
  ComponentNode,
  InlineNode,
  JsonValue,
  GlossaryMatch,
  SectionId,
  SectionImportance,
} from "../src/research-and-development/schema/chapter.js";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { compileDesmos2D } from "./build-desmos-2d.js";
import { compileDesmos3D } from "./build-desmos-3d.js";
import { preprocessMarkdown } from "./markdown-preprocessor.js";
import { validateSources, type ChapterSources } from "./validate.js";

type AstNode = {
  type: string;
  value?: string;
  depth?: number;
  lang?: string | null;
  ordered?: boolean;
  start?: number | null;
  align?: Array<"left" | "center" | "right" | null> | null;
  url?: string;
  title?: string | null;
  alt?: string | null;
  children?: AstNode[];
  position?: { start: { line: number; column: number } };
};

type BuildWarning = { file: string; line: number; message: string };
type BuildResult = { bundle: ChapterBundle; warnings: BuildWarning[] };
type ExampleSource = "callout" | "strong" | "heading";
type ExampleMetadata = { from: SectionId[]; concepts: SectionId[] };
type RawFact = Omit<ChapterBundle["facts"][number], "glossaryRefs">;
type BuildContext = {
  diagrams: Map<string, ChapterBundle["diagrams"][number]>;
  desmos: Map<string, ChapterBundle["desmos"][number]>;
  warnings: BuildWarning[];
  exampleCounts: Map<string, number>;
};

const RENDERER_VERSION = "0.1.6";
const SECTION_ID = /^(\d+\.\d+(?:\.\d+)?)\b/;
const TOP_SECTION = /^SECTION\s+(\d+)\b/i;
const CALLOUT = /^\[!([a-z][a-z0-9_-]*)\]\s*/i;
const EXAMPLE_METADATA = /\[from=([^;\]]+);\s*concepts=([^\]]+)\]/i;

function isAstNode(value: unknown): value is AstNode {
  return typeof value === "object"
    && value !== null
    && "type" in value
    && typeof value.type === "string";
}

function parseTree(source: string): AstNode {
  const tree = unifiedParser().parse(source);
  if (!isAstNode(tree)) throw new Error("MDX parser returned an invalid syntax tree");
  return tree;
}

function unifiedParser() {
  return processor().use(remarkParse).use(remarkMdx).use(remarkGfm).use(remarkMath);
}

function processor() {
  return unified();
}

function nodeText(node: AstNode): string {
  if (typeof node.value === "string") {
    if (node.type === "inlineMath" || node.type === "math") return `$${node.value}$`;
    if (node.type === "inlineCode") return `\`${node.value}\``;
    return node.value;
  }
  if (node.type === "link") {
    const text = (node.children ?? []).map(nodeText).join("");
    return `[${text}](${node.url ?? ""})`;
  }
  if (node.type === "strong") return `**${(node.children ?? []).map(nodeText).join("")}**`;
  if (node.type === "emphasis") return `*${(node.children ?? []).map(nodeText).join("")}*`;
  if (node.type === "break") return "\n";
  return (node.children ?? []).map(nodeText).join("");
}

function plainText(node: AstNode): string {
  return nodeText(node).replace(/[*`$⭐]/g, "").replace(/\s+/g, " ").trim();
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function idFromSource(prefix: string, source: string): string {
  return `${prefix}-${hash(source).slice(0, 12)}`;
}

function isTopSection(node: AstNode): boolean {
  return node.type === "heading"
    && node.depth === 2
    && TOP_SECTION.test(plainText(node));
}

function isConceptRoadmap(node: AstNode): boolean {
  return node.type === "heading"
    && node.depth === 2
    && plainText(node).replace(/^🗺️\s*/, "").toLowerCase() === "concept roadmap";
}

function sectionId(node: AstNode): SectionId | undefined {
  if (node.type !== "heading") return undefined;
  const match = plainText(node).match(SECTION_ID);
  return match?.[1] as SectionId | undefined;
}

function headingName(node: AstNode): string {
  return plainText(node).replace(/⭐+/g, "").trim().toLowerCase();
}

function isHeading(node: AstNode, value: string): boolean {
  return node.type === "heading" && node.depth === 2 && headingName(node) === value.toLowerCase();
}

function sectionRange(nodes: AstNode[], title: string): { start: number; end: number } | undefined {
  for (let start = 0; start < nodes.length; start += 1) {
    if (!isHeading(nodes[start], title)) continue;
    let end = start + 1;
    while (end < nodes.length && !(nodes[end].type === "heading" && nodes[end].depth === 2)) end += 1;
    return { start, end };
  }
  return undefined;
}

function sectionParagraph(nodes: AstNode[], title: string): string {
  const range = sectionRange(nodes, title);
  if (!range) return "";
  for (const node of nodes.slice(range.start + 1, range.end)) {
    if (node.type === "paragraph") return nodeText(node).trim();
  }
  return "";
}

function prepareNotes(nodes: AstNode[]): AstNode[] {
  let retained = [...nodes];
  for (const title of ["Chapter Brief", "Table of Contents", "At a Glance"]) {
    const range = sectionRange(retained, title);
    if (range) retained = [...retained.slice(0, range.start), ...retained.slice(range.end)];
  }

  const roadmap = sectionRange(retained, "🗺️ CONCEPT ROADMAP")
    ?? sectionRange(retained, "CONCEPT ROADMAP");
  if (!roadmap) return retained;

  const roadmapNodes = retained.slice(roadmap.start, roadmap.end);
  const rest = [...retained.slice(0, roadmap.start), ...retained.slice(roadmap.end)];
  const titleNode = rest[0]?.type === "heading" && rest[0]?.depth === 1 ? rest.shift() : undefined;
  return titleNode ? [titleNode, ...roadmapNodes, ...rest] : [...roadmapNodes, ...rest];
}

function component<Name extends ComponentNode["name"]>(
  name: Name,
  props: Extract<ComponentNode["props"], { name: Name }>,
  children?: BlockNode[],
): ComponentNode {
  return { type: "component", name, props, ...(children ? { children } : {}) } as ComponentNode;
}

function inline(node: AstNode): InlineNode {
  switch (node.type) {
    case "text":
      return { type: "text", value: node.value ?? "" };
    case "emphasis":
    case "strong":
      return { type: node.type, children: (node.children ?? []).map(inline) };
    case "inlineCode":
      return { type: "inlineCode", value: node.value ?? "" };
    case "inlineMath":
      return { type: "mathInline", value: node.value ?? "" };
    case "link":
      return {
        type: "link",
        href: node.url ?? "",
        ...(node.title ? { title: node.title } : {}),
        children: (node.children ?? []).map(inline),
      };
    default:
      throw new Error(`Unsupported inline Markdown node: ${node.type}`);
  }
}

function inlineChildren(nodes: AstNode[]): InlineNode[] {
  return nodes.map(inline);
}

function stripPrefix(nodes: InlineNode[], prefix: string): InlineNode[] {
  let remaining = prefix;
  const result: InlineNode[] = [];
  for (const node of nodes) {
    if (remaining && node.type === "text") {
      const start = node.value.toLowerCase().indexOf(remaining.toLowerCase());
      if (start >= 0) {
        const before = node.value.slice(0, start);
        const after = node.value.slice(start + remaining.length);
        if (before) result.push({ type: "text", value: before });
        if (after) result.push({ type: "text", value: after });
        remaining = "";
        continue;
      }
    }
    result.push(node);
  }
  return result;
}

function calloutType(node: AstNode): string | undefined {
  if (node.type !== "blockquote") return undefined;
  const match = nodeText(node).trim().match(CALLOUT);
  return match?.[1]?.toLowerCase();
}

function cleanCalloutChildren(node: AstNode, context: BuildContext, file: string): BlockNode[] {
  const children = [...(node.children ?? [])];
  const first = children[0];
  const marker = first ? nodeText(first).trim().match(CALLOUT) : undefined;
  if (first?.type === "paragraph" && marker) {
    let remaining = marker[0];
    const cleaned = (first.children ?? []).map((child) => {
      if (remaining && child.type === "text" && child.value) {
        const index = child.value.toLowerCase().indexOf(remaining.toLowerCase());
        if (index >= 0) {
          const value = `${child.value.slice(0, index)}${child.value.slice(index + remaining.length)}`;
          remaining = "";
          return { ...child, value };
        }
      }
      return child;
    }).filter((child) => child.type !== "text" || Boolean(child.value?.trim()));
    if (cleaned.length > 0) {
      children[0] = { ...first, children: cleaned };
    } else {
      children.shift();
    }
  }
  return children.map((child) => serializeBlock(child, context, file));
}

function jsonValue(value: unknown, pathLabel: string): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) return value.map((child, index) => jsonValue(child, `${pathLabel}[${index}]`));
  if (typeof value !== "object") throw new Error(`${pathLabel} is not JSON serializable`);

  const result: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(value)) {
    if (child !== undefined) result[key] = jsonValue(child, `${pathLabel}.${key}`);
  }
  return result;
}

function serializeCode(node: AstNode, context: BuildContext, file: string): BlockNode {
  const language = node.lang?.toLowerCase();
  const source = node.value ?? "";
  if (language === "mermaid" || language === "tikz") {
    const id = idFromSource("diagram", `${language}\n${source}`);
    const kind = language;
    context.diagrams.set(id, { id, kind, source });
    return component("Diagram", { name: "Diagram", id, kind });
  }
  if (language === "desmos" || language === "desmos3d") {
    const result = language === "desmos" ? compileDesmos2D(source) : compileDesmos3D(source);
    const diagnostics = result.diagnostics;
    for (const diagnostic of diagnostics) {
      const diagnosticFile = file;
      const line = (node.position?.start.line ?? 1) + diagnostic.line - 1;
      const message = `${diagnostic.code}: ${diagnostic.message}`;
      if (diagnostic.severity === "error") throw new Error(`${diagnosticFile}:${line}: ${message}`);
      context.warnings.push({ file: diagnosticFile, line, message });
    }
    if (!result.ok) {
      throw new Error(`${file}:${node.position?.start.line ?? 1}: ${language} compiler rejected the block`);
    }

    const kind = language === "desmos" ? "2d" : "3d";
    const id = idFromSource("desmos", `${kind}\n${source}`);
    const data = jsonValue(result.output, `${file}:${node.position?.start.line ?? 1}`);
    context.desmos.set(id, { id, kind, data });
    return component("Desmos", { name: "Desmos", id, kind, data: { ref: id } });
  }
  return { type: "codeBlock", ...(language ? { lang: language } : {}), value: source };
}

function serializeBlock(node: AstNode, context: BuildContext, file: string): BlockNode {
  switch (node.type) {
    case "paragraph":
      return { type: "paragraph", children: inlineChildren(node.children ?? []) };
    case "heading": {
      const depth = node.depth;
      if (depth === undefined || depth < 1 || depth > 6) throw new Error(`${file}: invalid heading depth`);
      const id = isConceptRoadmap(node) ? "chapter-overview" : sectionId(node);
      let children = inlineChildren(node.children ?? []);
      if (isTopSection(node)) {
        const source = nodeText(node);
        children = stripPrefix(children, source.match(/⭐+/)?.[0] ?? "");
      }
      return {
        type: "heading",
        depth: depth as 1 | 2 | 3 | 4 | 5 | 6,
        ...(id ? { id } : {}),
        children,
      };
    }
    case "list":
      return {
        type: "list",
        ordered: Boolean(node.ordered),
        ...(node.start !== null && node.start !== undefined ? { start: node.start } : {}),
        children: (node.children ?? []).map((child) => serializeBlock(child, context, file)),
      };
    case "listItem":
      return { type: "listItem", children: (node.children ?? []).map((child) => serializeBlock(child, context, file)) };
    case "table":
      return {
        type: "table",
        align: node.align ?? [],
        children: (node.children ?? []).map((row) => ({
          type: "tableRow" as const,
          children: (row.children ?? []).map((cell) => ({
            type: "tableCell" as const,
            children: inlineChildren(cell.children ?? []),
          })),
        })),
      };
    case "blockquote": {
      const type = calloutType(node);
      if (type) {
        if (!["example", "important", "note", "tip", "warning"].includes(type)) {
          throw new Error(`${file}:${node.position?.start.line ?? 1}: unknown callout type "${type}"`);
        }
        return component("Callout", { name: "Callout", type: type as "example" | "important" | "note" | "tip" | "warning" }, cleanCalloutChildren(node, context, file));
      }
      return { type: "blockquote", children: (node.children ?? []).map((child) => serializeBlock(child, context, file)) };
    }
    case "thematicBreak":
      return { type: "thematicBreak" };
    case "code":
      return serializeCode(node, context, file);
    case "math":
      return { type: "mathBlock", value: node.value ?? "" };
    case "tableRow":
      return {
        type: "tableRow",
        children: (node.children ?? []).map((cell) => ({
          type: "tableCell" as const,
          children: inlineChildren(cell.children ?? []),
        })),
      };
    case "tableCell":
      return { type: "tableCell", children: inlineChildren(node.children ?? []) };
    default:
      throw new Error(`${file}:${node.position?.start.line ?? 1}: unsupported Markdown node "${node.type}"`);
  }
}

function isExampleCallout(node: AstNode): boolean {
  return calloutType(node) === "example";
}

function strongExampleTitle(node: AstNode): string | undefined {
  if (node.type !== "paragraph" || node.children?.[0]?.type !== "strong") return undefined;
  const title = plainText(node.children[0]);
  return /^Example\b/i.test(title) ? title : undefined;
}

function isExampleHeading(node: AstNode): boolean {
  if (node.type !== "heading" || !node.depth) return false;
  return /\bSolved Example\b/i.test(plainText(node)) && !/\bSolved Examples\b/i.test(plainText(node));
}

function exampleTitle(node: AstNode, source: ExampleSource): string {
  if (source === "heading") return withoutExampleMetadata(plainText(node).replace(/⭐+/g, "").trim());
  if (source === "strong") return withoutExampleMetadata(node.children?.[0] ? plainText(node.children[0]) : "Example");
  const first = node.children?.[0];
  const text = first ? plainText(first) : "Example";
  return withoutExampleMetadata(text.replace(CALLOUT, "").trim()) || "Example";
}

function exampleBody(nodes: AstNode[], source: ExampleSource): AstNode[] {
  const body = source === "callout" ? nodes.slice(1) : nodes;
  return body
    .map(stripExampleMetadata)
    .filter((node): node is AstNode => node !== null);
}

function withoutExampleMetadata(value: string): string {
  return value.replace(EXAMPLE_METADATA, "").replace(/\s+/g, " ").trim();
}

function parseExampleIds(value: string, file: string, line: number, field: string): SectionId[] {
  const ids = value.split(",").map((id) => id.trim());
  if (ids.length === 0 || ids.some((id) => !/^\d+\.\d+(?:\.\d+)?$/.test(id))) {
    throw new Error(`${file}:${line}: example ${field} must contain comma-separated section IDs`);
  }
  return ids as SectionId[];
}

function exampleMetadata(nodes: AstNode[], file: string): ExampleMetadata | undefined {
  const source = nodes.map(nodeText).join("\n");
  if (!source.includes("[from=")) return undefined;
  const match = source.match(EXAMPLE_METADATA);
  if (!match) {
    const line = nodes[0]?.position?.start.line ?? 1;
    throw new Error(`${file}:${line}: malformed example metadata; expected [from=…; concepts=…]`);
  }
  const line = nodes[0]?.position?.start.line ?? 1;
  return {
    from: parseExampleIds(match[1], file, line, "from"),
    concepts: parseExampleIds(match[2], file, line, "concepts"),
  };
}

function stripExampleMetadata(node: AstNode): AstNode | null {
  if (node.type === "text" && node.value) {
    const value = node.value.replace(EXAMPLE_METADATA, "").trim();
    return value ? { ...node, value } : null;
  }
  if (!node.children) return node;
  const children = node.children
    .map(stripExampleMetadata)
    .filter((child): child is AstNode => child !== null);
  if (node.type === "paragraph" && children.length === 0) return null;
  return { ...node, children };
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "example";
}

function exampleRecord(
  node: AstNode,
  following: AstNode[],
  source: ExampleSource,
  section: SectionId | undefined,
  context: BuildContext,
  file: string,
): ChapterBundle["examples"][number] {
  if (!section) throw new Error(`${file}:${node.position?.start.line ?? 1}: example is not inside a numbered subsection`);

  const metadata = exampleMetadata([node, ...following], file);
  const title = exampleTitle(node, source);
  const count = (context.exampleCounts.get(section) ?? 0) + 1;
  context.exampleCounts.set(section, count);
  const id = `ex-${section.replaceAll(".", "-")}-${slug(title)}-${count}`;
  const body = exampleBody(following, source);

  const imperativeTitle = /^(find|calculate|determine|show|prove|what|how|solve)\b/i.test(title);
  let questionNodes: AstNode[];
  let answerNodes: AstNode[];
  if (
    source === "strong"
    || (source === "callout" && (imperativeTitle || body.length <= 1))
  ) {
    questionNodes = [{ type: "paragraph", children: [{ type: "text", value: title }] }];
    answerNodes = body;
  } else {
    questionNodes = body.slice(0, 1);
    answerNodes = body.slice(1);
    if (source === "heading" && body.length === 0) {
      questionNodes = [{ type: "paragraph", children: [{ type: "text", value: title }] }];
    }
  }

  const serialize = (nodes: AstNode[]) => nodes.map((child) => serializeBlock(child, context, file));
  return {
    id,
    from: metadata?.from ?? [section],
    concepts: metadata?.concepts ?? [section],
    title,
    question: serialize(questionNodes),
    answer: serialize(answerNodes),
  };
}

function transformNotes(
  nodes: AstNode[],
  context: BuildContext,
  file: string,
): { tree: BlockNode[]; examples: ChapterBundle["examples"] } {
  const output: BlockNode[] = [];
  const examples: ChapterBundle["examples"] = [];
  let currentSection: SectionId | undefined;

  const enqueue = (example: ChapterBundle["examples"][number]) => {
    examples.push(example);
  };

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.type === "heading") {
      const id = sectionId(node);
      const isTop = isTopSection(node);
      if (id || isTop) {
        currentSection = id;
      }

      if (isExampleHeading(node)) {
        const following: AstNode[] = [];
        let next = index + 1;
        while (next < nodes.length && !(nodes[next].type === "heading" && (nodes[next].depth ?? 7) <= (node.depth ?? 1))) {
          following.push(nodes[next]);
          next += 1;
        }
        const example = exampleRecord(node, following, "heading", id ?? currentSection, context, file);
        enqueue(example);
        output.push(serializeBlock(node, context, file));
        index = next - 1;
        continue;
      }
      output.push(serializeBlock(node, context, file));
      continue;
    }

    if (isExampleCallout(node)) {
      const example = exampleRecord(node, node.children ?? [], "callout", currentSection, context, file);
      enqueue(example);
      continue;
    }

    const title = strongExampleTitle(node);
    if (title) {
      const following: AstNode[] = [];
      let next = index + 1;
      while (
        next < nodes.length
        && nodes[next].type !== "heading"
        && nodes[next].type !== "thematicBreak"
        && !isExampleCallout(nodes[next])
        && !strongExampleTitle(nodes[next])
      ) {
        following.push(nodes[next]);
        next += 1;
      }
      enqueue(exampleRecord(node, following, "strong", currentSection, context, file));
      index = next - 1;
      continue;
    }

    output.push(serializeBlock(node, context, file));
  }
  return { tree: output, examples };
}

function outline(
  nodes: AstNode[],
  chapterBrief: string,
): ChapterBundle["outline"] {
  const result: ChapterBundle["outline"] = [];
  if (chapterBrief) result.push({ id: "chapter-overview", title: "Concept Roadmap", importance: 0, brief: chapterBrief });

  let current: ChapterBundle["outline"][number] | undefined;
  for (const node of nodes) {
    if (isTopSection(node)) {
      const text = plainText(node);
      const match = text.match(TOP_SECTION);
      const importance = Math.min(3, (nodeText(node).match(/⭐/g) ?? []).length) as SectionImportance;
      current = {
        id: `SECTION-${match?.[1] ?? result.length + 1}`,
        title: text.replace(TOP_SECTION, "").replace(/^[\s—–:-]+/, "").trim(),
        importance,
        brief: "",
      };
      result.push(current);
      continue;
    }
    if (current && !current.brief && node.type === "paragraph") {
      current.brief = nodeText(node).trim();
    }
  }
  return result;
}

function factPoints(node: AstNode): string[] {
  if (node.type === "list") return (node.children ?? []).flatMap(factPoints);
  if (node.type === "listItem") {
    const text = (node.children ?? []).map(nodeText).join(" ").replace(/\s+/g, " ").trim();
    return text ? [text] : [];
  }
  if (node.type === "table") {
    return (node.children ?? []).flatMap((row) => {
      const cells = (row.children ?? []).map((cell) => (cell.children ?? []).map(nodeText).join("").trim());
      return cells.some(Boolean) ? [cells.join(" — ")] : [];
    });
  }
  if (node.type === "paragraph" || node.type === "blockquote") {
    const text = nodeText(node).replace(/\s+/g, " ").trim();
    return text ? [text] : [];
  }
  return [];
}

function facts(tree: AstNode, context: BuildContext, file: string): RawFact[] {
  const records = new Map<SectionId, RawFact>();
  const pendingVisuals: RawFact["visuals"] = [];
  let current: SectionId | undefined;
  let mode: "legacy" | "summary" | "important-notes" = "legacy";

  for (const node of tree.children ?? []) {
    if (node.type === "heading") {
      const id = sectionId(node);
      if (id) {
        current = id;
        mode = "legacy";
        const record = records.get(id) ?? { sectionId: id, brief: "", points: [], visuals: [] };
        record.visuals.push(...pendingVisuals);
        pendingVisuals.length = 0;
        records.set(id, record);
      } else if ((node.depth ?? 0) === 4 && current) {
        const label = plainText(node).toLowerCase();
        if (label === "summary") mode = "summary";
        else if (label === "important notes") mode = "important-notes";
      } else if (isTopSection(node) || (node.depth ?? 7) <= 2) {
        if (pendingVisuals.length > 0) {
          throw new Error(`${file}:${node.position?.start.line ?? 1}: visual block is not followed by a numbered subsection`);
        }
        current = undefined;
        mode = "legacy";
      }
      continue;
    }
    if (node.type === "code") {
      const visual = serializeCode(node, context, file);
      if (visual.type === "component" && (visual.name === "Diagram" || visual.name === "Desmos")) {
        if (!current) {
          pendingVisuals.push(visual);
        } else {
          const record = records.get(current) ?? { sectionId: current, brief: "", points: [], visuals: [] };
          record.visuals.push(visual);
          records.set(current, record);
        }
      }
      continue;
    }
    if (!current) continue;

    const points = factPoints(node);
    if (points.length === 0) continue;
    const record = records.get(current) ?? { sectionId: current, brief: "", points: [], visuals: [] };
    if (mode === "summary") {
      record.brief = [record.brief, ...points].filter(Boolean).join(" ");
    } else if (mode === "important-notes") {
      record.points.push(...points);
    } else {
      record.points.push(...points);
      if (!record.brief) record.brief = points[0];
    }
    records.set(current, record);
  }

  if (pendingVisuals.length > 0) {
    throw new Error(`${file}: visual block is not followed by a numbered subsection`);
  }
  return [...records.values()];
}

function termAliases(term: string, definition: string): string[] {
  const aliases = new Set<string>();
  const parentheses = term.match(/\(([^()]*)\)\s*$/);
  if (parentheses) {
    for (const value of parentheses[1].split(",")) {
      const alias = value.replace(/\$/g, "").trim();
      if (alias) aliases.add(alias);
    }
  }
  for (const match of definition.matchAll(/\bSee\s+\*\*([^*]+)\*\*/gi)) aliases.add(match[1].trim());
  return [...aliases];
}

function glossary(tree: AstNode): ChapterBundle["glossary"] {
  const entries: ChapterBundle["glossary"] = {};
  const keyCounts = new Map<string, number>();
  for (const node of tree.children ?? []) {
    if (node.type !== "paragraph" || node.children?.[0]?.type !== "strong") continue;
    const term = plainText(node.children[0]);
    const rest = [...(node.children ?? [])].slice(1);
    const definition = rest.map(nodeText).join("").replace(/^\s*[—–-]\s*/, "").trim();
    const keyBase = slug(term.replace(/\s*\([^)]*\)/, ""));
    const occurrence = (keyCounts.get(keyBase) ?? 0) + 1;
    keyCounts.set(keyBase, occurrence);
    const key = occurrence === 1 ? keyBase : `${keyBase}-${occurrence}`;
    entries[key] = { term, definition, aliases: termAliases(term, definition), common: false };
  }
  return entries;
}

type GlossaryMatcher = {
  pattern: RegExp | null;
  termByForm: Map<string, string>;
};

function glossaryMatcher(entries: ChapterBundle["glossary"]): GlossaryMatcher {
  const termByForm = new Map<string, string>();
  const forms: string[] = [];
  for (const [termId, entry] of Object.entries(entries)) {
    if (entry.common) continue;
    for (const form of [entry.term.replace(/\s*\([^)]*\)/, "").trim(), ...entry.aliases]) {
      const normalized = form.trim().toLowerCase();
      if (!normalized || termByForm.has(normalized)) continue;
      termByForm.set(normalized, termId);
      forms.push(form.trim());
    }
  }
  forms.sort((left, right) => right.length - left.length || left.localeCompare(right));
  if (forms.length === 0) return { pattern: null, termByForm };
  const escaped = forms.map((form) => form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return {
    pattern: new RegExp(`(?<![\\p{L}\\p{N}])(${escaped.join("|")})(?![\\p{L}\\p{N}])`, "giu"),
    termByForm,
  };
}

function annotateGlossaryText(
  value: string,
  matcher: GlossaryMatcher,
  seen: Set<string>,
): InlineNode[] {
  if (!matcher.pattern) return [{ type: "text", value }];
  const result: InlineNode[] = [];
  let cursor = 0;
  matcher.pattern.lastIndex = 0;
  for (const match of value.matchAll(matcher.pattern)) {
    const text = match[0];
    const termId = matcher.termByForm.get(text.toLowerCase());
    const start = match.index;
    if (!termId || seen.has(termId) || start === undefined) continue;
    if (start > cursor) result.push({ type: "text", value: value.slice(cursor, start) });
    result.push({
      type: "glossaryRef",
      termId,
      children: [{ type: "text", value: text }],
    });
    cursor = start + text.length;
    seen.add(termId);
  }
  if (cursor === 0) return [{ type: "text", value }];
  if (cursor < value.length) result.push({ type: "text", value: value.slice(cursor) });
  return result;
}

function annotateGlossaryInline(
  nodes: InlineNode[],
  matcher: GlossaryMatcher,
  seen: Set<string>,
): InlineNode[] {
  return nodes.flatMap((node) => {
    if (node.type === "text") return annotateGlossaryText(node.value, matcher, seen);
    if (node.type === "emphasis" || node.type === "strong") {
      return [{ ...node, children: annotateGlossaryInline(node.children, matcher, seen) }];
    }
    return [node];
  });
}

function annotateGlossaryBlock(node: BlockNode, matcher: GlossaryMatcher, seen: Set<string>): BlockNode {
  switch (node.type) {
    case "paragraph":
    case "tableCell":
      return { ...node, children: annotateGlossaryInline(node.children, matcher, seen) };
    case "list":
    case "listItem":
    case "blockquote":
      return { ...node, children: node.children.map((child) => annotateGlossaryBlock(child, matcher, seen)) };
    case "tableRow":
      return {
        ...node,
        children: node.children.map((cell) => ({
          ...cell,
          children: annotateGlossaryInline(cell.children, matcher, seen),
        })),
      };
    case "table":
      return {
        ...node,
        children: node.children.map((row) => ({
          ...row,
          children: row.children.map((cell) => ({
            ...cell,
            children: annotateGlossaryInline(cell.children, matcher, seen),
          })),
        })),
      };
    case "component":
      return node.children
        ? { ...node, children: node.children.map((child) => annotateGlossaryBlock(child, matcher, seen)) }
        : node;
    default:
      return node;
  }
}

function annotateNotesGlossary(
  nodes: BlockNode[],
  matcher: GlossaryMatcher,
): BlockNode[] {
  let seen = new Set<string>();
  return nodes.map((node) => {
    if (node.type === "heading") {
      const heading = node.children.map((child) => child.type === "text" ? child.value : "").join("");
      const topSection = heading.match(TOP_SECTION);
      if (node.id || topSection) seen = new Set<string>();
      return node;
    }
    return annotateGlossaryBlock(node, matcher, seen);
  });
}

function excludedFactRanges(value: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const pattern of [
    /(`+)[\s\S]*?\1/g,
    /(\${1,2})[\s\S]*?\1/g,
    /\[[^\]]*\]\([^)]*\)/g,
  ]) {
    for (const match of value.matchAll(pattern)) {
      if (match.index !== undefined) ranges.push([match.index, match.index + match[0].length]);
    }
  }
  return ranges;
}

function annotateFactText(
  value: string,
  matcher: GlossaryMatcher,
  seen: Set<string>,
): GlossaryMatch[] {
  if (!matcher.pattern) return [];
  const excluded = excludedFactRanges(value);
  const refs: GlossaryMatch[] = [];
  matcher.pattern.lastIndex = 0;
  for (const match of value.matchAll(matcher.pattern)) {
    const termId = matcher.termByForm.get(match[0].toLowerCase());
    const start = match.index;
    if (!termId || seen.has(termId) || start === undefined) continue;
    const end = start + match[0].length;
    if (excluded.some(([rangeStart, rangeEnd]) => start < rangeEnd && end > rangeStart)) continue;
    refs.push({ start, end, termId });
    seen.add(termId);
  }
  return refs;
}

function annotateFactsGlossary(
  records: RawFact[],
  matcher: GlossaryMatcher,
): ChapterBundle["facts"] {
  return records.map((record) => {
    const seen = new Set<string>();
    const brief = annotateFactText(record.brief, matcher, seen);
    const points = record.points.map((point) => annotateFactText(point, matcher, seen));
    return { ...record, glossaryRefs: { brief, points } };
  });
}

function chapterTitle(tree: AstNode, chapterId: string): string {
  const title = tree.children?.find((node) => node.type === "heading" && node.depth === 1);
  if (!title) return chapterId.replaceAll("_", " ");
  const value = plainText(title);
  const parts = value.split("|").map((part) => part.trim());
  return parts.length >= 3 ? parts.at(-2) ?? value : value;
}

function makeContext(): BuildContext {
  return { diagrams: new Map(), desmos: new Map(), warnings: [], exampleCounts: new Map() };
}

function sourceShas(sources: ChapterSources): ChapterBundle["sourceShas"] {
  return {
    glossary: hash(sources.glossary),
    notes: hash(sources.notes),
    cnotes: hash(sources.cnotes),
  };
}

function chapterSlug(chapterId: string): string {
  return chapterId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function buildChapter(chapterId: string, sources: ChapterSources): Promise<BuildResult> {
  const validation = await validateSources(chapterId, sources);
  if (validation.errors.length > 0) {
    throw new Error(validation.errors.map((error) => `${error.file}:${error.line}: ${error.reason}`).join("\n"));
  }

  const notesAst = parseTree(preprocessMarkdown(sources.notes));
  const cnotesAst = parseTree(preprocessMarkdown(sources.cnotes));
  const glossaryAst = parseTree(preprocessMarkdown(sources.glossary));
  const context = makeContext();
  const chapterBrief = sectionParagraph(cnotesAst.children ?? [], "Chapter Brief");
  const preparedNotes = prepareNotes(notesAst.children ?? []);
  const transformed = transformNotes(preparedNotes, context, `${chapterId}-NOTES.mdx`);
  const glossaryEntries = glossary(glossaryAst);
  const matcher = glossaryMatcher(glossaryEntries);
  const tree = annotateNotesGlossary(transformed.tree, matcher);
  const factsTree = annotateFactsGlossary(
    facts(cnotesAst, context, `${chapterId}-CNOTES.mdx`),
    matcher,
  );

  return {
    bundle: {
      schemaVersion: 2,
      id: chapterSlug(chapterId),
      title: chapterTitle(notesAst, chapterId),
      rendererVersion: RENDERER_VERSION,
      sourceShas: sourceShas(sources),
      outline: outline(preparedNotes, chapterBrief),
      notes: { tree },
      facts: factsTree,
      examples: transformed.examples,
      glossary: glossaryEntries,
      diagrams: [...context.diagrams.values()],
      desmos: [...context.desmos.values()],
    },
    warnings: context.warnings,
  };
}

function sameSourceShas(
  left: ChapterBundle["sourceShas"],
  right: ChapterBundle["sourceShas"],
): boolean {
  return left.glossary === right.glossary && left.notes === right.notes && left.cnotes === right.cnotes;
}

type CompatibleManifest = Omit<ChapterManifest, "schemaVersion"> & { schemaVersion: 1 | 2 };

function validManifest(value: unknown): value is CompatibleManifest {
  if (typeof value !== "object" || value === null || !("chapters" in value) || !Array.isArray(value.chapters)) {
    return false;
  }
  return "schemaVersion" in value
    && (value.schemaVersion === 1 || value.schemaVersion === 2)
    && "rendererVersion" in value
    && typeof value.rendererVersion === "string"
    && value.chapters.every((chapter) => (
      typeof chapter === "object"
      && chapter !== null
      && "id" in chapter
      && typeof chapter.id === "string"
      && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(chapter.id)
      && "title" in chapter
      && typeof chapter.title === "string"
      && "bundle" in chapter
      && chapter.bundle === `${chapter.id}.json`
      && "sourceShas" in chapter
      && typeof chapter.sourceShas === "object"
      && chapter.sourceShas !== null
      && "glossary" in chapter.sourceShas
      && typeof chapter.sourceShas.glossary === "string"
      && /^[a-f0-9]{64}$/.test(chapter.sourceShas.glossary)
      && "notes" in chapter.sourceShas
      && typeof chapter.sourceShas.notes === "string"
      && /^[a-f0-9]{64}$/.test(chapter.sourceShas.notes)
      && "cnotes" in chapter.sourceShas
      && typeof chapter.sourceShas.cnotes === "string"
      && /^[a-f0-9]{64}$/.test(chapter.sourceShas.cnotes)
    ));
}

export async function writeBuild(
  bundle: ChapterBundle,
  outputDirectory: string,
): Promise<{ skipped: boolean; manifest: ChapterManifest }> {
  const manifestPath = path.join(outputDirectory, "manifest.json");
  let previous: CompatibleManifest | undefined;
  try {
    const parsed: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
    if (!validManifest(parsed)) throw new Error(`${manifestPath} has an invalid manifest shape`);
    previous = parsed;
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error && error.code === "ENOENT")) throw error;
  }

  const bundlePath = path.join(outputDirectory, `${bundle.id}.json`);
  const current = previous?.chapters.find((chapter) => chapter.id === bundle.id);
  if (
    previous?.rendererVersion === bundle.rendererVersion
    && previous.schemaVersion === 2
    && current
    && sameSourceShas(current.sourceShas, bundle.sourceShas)
  ) {
    try {
      await readFile(bundlePath);
      return {
        skipped: true,
        manifest: {
          schemaVersion: 2,
          rendererVersion: previous.rendererVersion,
          chapters: previous.chapters,
        },
      };
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error && error.code === "ENOENT")) throw error;
    }
  }

  if (
    previous
    && (previous.rendererVersion !== bundle.rendererVersion || previous.schemaVersion !== 2)
    && previous.chapters.some((chapter) => chapter.id !== bundle.id)
  ) {
    throw new Error("rendererVersion changed; rebuild every manifest chapter before updating the manifest");
  }

  const manifest: ChapterManifest = {
    schemaVersion: 2,
    rendererVersion: bundle.rendererVersion,
    chapters: [
      ...(previous?.chapters.filter((chapter) => chapter.id !== bundle.id) ?? []),
      {
        id: bundle.id,
        title: bundle.title,
        bundle: `${bundle.id}.json`,
        sourceShas: bundle.sourceShas,
      },
    ].sort((left, right) => left.id.localeCompare(right.id)),
  };

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { skipped: false, manifest };
}

