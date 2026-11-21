import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";

type HtmlNode = DefaultTreeAdapterMap["node"];
type HtmlElement = DefaultTreeAdapterMap["element"];
type Manifest = { files: Record<string, unknown> };
type HtmlAuditResult = {
  file: string;
  headings: number;
  examples: number;
  glossaryReferences: number;
  diagrams: number;
  desmos: number;
};

function isElement(node: HtmlNode): node is HtmlElement {
  return "tagName" in node;
}

function children(node: HtmlNode): HtmlNode[] {
  return "childNodes" in node ? node.childNodes : [];
}

function elements(node: HtmlNode): HtmlElement[] {
  const found: HtmlElement[] = [];
  const visit = (current: HtmlNode) => {
    if (isElement(current)) found.push(current);
    for (const child of children(current)) visit(child);
  };
  visit(node);
  return found;
}

function attribute(element: HtmlElement, name: string): string | undefined {
  return element.attrs.find((item) => item.name === name)?.value;
}

function hasAttribute(element: HtmlElement, name: string): boolean {
  return element.attrs.some((item) => item.name === name);
}

function textContent(node: HtmlNode): string {
  if ("value" in node) return node.value;
  return children(node).map(textContent).join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pathWithin(directory: string, relativePath: string): string {
  const root = path.resolve(directory);
  const result = path.resolve(root, relativePath);
  if (result === root || !result.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Manifest path escapes the build directory: ${relativePath}`);
  }
  return result;
}

export function auditHtmlFragment(html: string, file: string): HtmlAuditResult {
  const parseErrors: string[] = [];
  const document = parseFragment(html, {
    onParseError: (error) => parseErrors.push(`${error.code} at ${error.startLine}:${error.startCol}`),
  });
  const all = elements(document);
  const errors = parseErrors.map((error) => `${file}: invalid HTML (${error})`);
  const articles = all.filter((element) => element.tagName === "article" && hasAttribute(element, "data-chapter-id"));
  if (articles.length !== 1) errors.push(`${file}: expected exactly one reader article.`);
  const article = articles[0];
  if (!article) throw new Error(errors.join("\n"));

  const kind = attribute(article, "data-kind");
  if (kind !== "chapter" && kind !== "page") errors.push(`${file}: reader article has an invalid data-kind.`);
  if (!attribute(article, "data-renderer-version")) errors.push(`${file}: reader article has no renderer version.`);

  const inside = elements(article);
  const chapterDataBlocks = inside.filter((element) => hasAttribute(element, "data-chapter-data"));
  if (chapterDataBlocks.length !== 1 || chapterDataBlocks[0]?.tagName !== "script") {
    errors.push(`${file}: expected exactly one JSON chapter-data script.`);
  }
  let chapterData: unknown;
  if (chapterDataBlocks.length === 1) {
    const dataBlock = chapterDataBlocks[0];
    if (attribute(dataBlock, "type") !== "application/json") {
      errors.push(`${file}: chapter data must be an inert application/json script.`);
    }
    try {
      chapterData = JSON.parse(textContent(dataBlock));
    } catch {
      errors.push(`${file}: chapter data is not valid JSON.`);
    }
  }
  const glossary = isRecord(chapterData) && isRecord(chapterData.glossary) ? chapterData.glossary : {};

  if (kind === "chapter") {
    for (const hook of ["data-outline", "data-notes", "data-facts", "data-examples"]) {
      if (!inside.some((element) => hasAttribute(element, hook))) {
        errors.push(`${file}: chapter is missing the ${hook} region.`);
      }
    }
  } else if (!inside.some((element) => hasAttribute(element, "data-content"))) {
    errors.push(`${file}: plain page is missing its data-content region.`);
  }

  const scripts = inside.filter((element) => element.tagName === "script");
  for (const script of scripts) {
    if (attribute(script, "type") !== "application/json") {
      errors.push(`${file}: executable or unsupported script tag found.`);
    }
  }

  const headingElements = inside.filter((element) => /^h[1-6]$/.test(element.tagName)
    && hasAttribute(element, "data-chapter-heading"));
  const sectionIds = new Set<string>();
  const anchorIds = new Set(inside.map((element) => attribute(element, "id")).filter((id): id is string => Boolean(id)));
  const duplicateSectionIds = new Set<string>();
  for (const heading of headingElements) {
    const id = attribute(heading, "id");
    if (!id) {
      errors.push(`${file}: chapter heading has no anchor ID.`);
      continue;
    }
    if (sectionIds.has(id)) duplicateSectionIds.add(id);
    sectionIds.add(id);
  }
  for (const id of duplicateSectionIds) errors.push(`${file}: duplicate section ID "${id}".`);
  for (const link of inside.filter((element) => element.tagName === "a")) {
    const href = attribute(link, "href");
    if (!href?.startsWith("#")) continue;
    let target: string;
    try {
      target = decodeURIComponent(href.slice(1));
    } catch {
      errors.push(`${file}: anchor link has invalid encoding.`);
      continue;
    }
    if (target && !anchorIds.has(target)) errors.push(`${file}: anchor "#${target}" does not resolve.`);
  }

  const exampleIds = new Set(inside
    .filter((element) => hasAttribute(element, "data-example-id"))
    .map((element) => attribute(element, "data-example-id"))
    .filter((id): id is string => Boolean(id)));
  for (const button of inside.filter((element) => hasAttribute(element, "data-example-target"))) {
    const target = attribute(button, "data-example-target");
    if (!target || !exampleIds.has(target)) errors.push(`${file}: example link does not resolve.`);
  }
  const exampleReturns = inside.filter((element) => hasAttribute(element, "data-return-section"));
  for (const button of exampleReturns) {
    const target = attribute(button, "data-return-section");
    if (!target || !sectionIds.has(target)) errors.push(`${file}: return-to-section link does not resolve.`);
  }

  const glossaryReferences = inside.filter((element) => hasAttribute(element, "data-term-id"));
  for (const reference of glossaryReferences) {
    const term = attribute(reference, "data-term-id");
    if (!term || !Object.hasOwn(glossary, term)) errors.push(`${file}: glossary reference has no definition.`);
  }

  const diagrams = inside.filter((element) => element.tagName === "figure" && hasAttribute(element, "data-diagram"));
  const diagramIds = new Set<string>();
  for (const diagram of diagrams) {
    const id = attribute(diagram, "data-diagram-id");
    if (!id) errors.push(`${file}: diagram has no ID.`);
    else if (diagramIds.has(id)) errors.push(`${file}: duplicate diagram ID "${id}".`);
    else diagramIds.add(id);
    if (!inside.some((element) => element.tagName === "svg" && isDescendant(element, diagram))) {
      errors.push(`${file}: diagram ${id || "(unknown)"} has no rendered SVG.`);
    }
  }
  const svgElements = inside.filter((element) => element.tagName === "svg");
  for (const svg of svgElements) {
    if (!children(svg).some(isElement)) errors.push(`${file}: empty SVG found.`);
  }

  const desmosBlocks = inside.filter((element) => hasAttribute(element, "data-desmos"));
  const desmosBlockIds = new Set<string>();
  for (const block of desmosBlocks) {
    const blockId = attribute(block, "data-id");
    if (!blockId) {
      errors.push(`${file}: Desmos block has no ID.`);
    } else if (desmosBlockIds.has(blockId)) {
      errors.push(`${file}: duplicate Desmos block ID "${blockId}".`);
    } else {
      desmosBlockIds.add(blockId);
    }
    const kindValue = attribute(block, "data-kind");
    if (kindValue !== "2d" && kindValue !== "3d") errors.push(`${file}: Desmos block has an invalid kind.`);
    const requests = inside.filter((element) => element.tagName === "script"
      && hasAttribute(element, "data-desmos-request") && isDescendant(element, block));
    if (requests.length !== 1) {
      errors.push(`${file}: Desmos block ${blockId || "(unknown)"} must contain one request.`);
      continue;
    }
    try {
      const request: unknown = JSON.parse(textContent(requests[0]));
      if (!isRecord(request) || !Array.isArray(request.expressions)) {
        errors.push(`${file}: Desmos block ${blockId || "(unknown)"} has an invalid request.`);
        continue;
      }
      const expressionIds = new Set<string>();
      for (const [index, expression] of request.expressions.entries()) {
        if (!isRecord(expression)) {
          errors.push(`${file}: Desmos block ${blockId || "(unknown)"} expression ${index + 1} is invalid.`);
          continue;
        }
        if (typeof expression.id !== "string" || !expression.id.trim()) {
          errors.push(`${file}: Desmos block ${blockId || "(unknown)"} expression ${index + 1} has no ID.`);
        } else if (expressionIds.has(expression.id)) {
          errors.push(`${file}: Desmos block ${blockId || "(unknown)"} has duplicate expression ID "${expression.id}".`);
        } else {
          expressionIds.add(expression.id);
        }
      }
      for (const field of ["options", "settings", "bounds"] as const) {
        if (request[field] !== undefined && !isRecord(request[field])) {
          errors.push(`${file}: Desmos block ${blockId || "(unknown)"} has invalid ${field}.`);
        }
      }
    } catch {
      errors.push(`${file}: Desmos block ${blockId || "(unknown)"} request is not valid JSON.`);
    }
  }

  if (errors.length) throw new Error(errors.join("\n"));
  return {
    file,
    headings: headingElements.length,
    examples: exampleIds.size,
    glossaryReferences: glossaryReferences.length,
    diagrams: diagrams.length,
    desmos: desmosBlocks.length,
  };
}

function isDescendant(element: HtmlElement, ancestor: HtmlElement): boolean {
  return elements(ancestor).includes(element) && element !== ancestor;
}

export async function auditHtmlDirectory(outputDirectory: string): Promise<HtmlAuditResult[]> {
  const manifestPath = path.join(outputDirectory, "manifest.json");
  const manifestValue: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!isRecord(manifestValue) || !isRecord(manifestValue.files)) {
    throw new Error(`${manifestPath} has an invalid files manifest.`);
  }
  const manifest = manifestValue as Manifest;
  const results: HtmlAuditResult[] = [];
  for (const relativePath of Object.keys(manifest.files).sort()) {
    if (!relativePath.endsWith(".html")) throw new Error(`${manifestPath} contains a non-HTML build record.`);
    const filePath = pathWithin(outputDirectory, relativePath);
    const html = await readFile(filePath, "utf8");
    results.push(auditHtmlFragment(html, relativePath));
  }
  return results;
}

async function main(): Promise<void> {
  const outputArgument = process.argv.find((argument) => argument.startsWith("--out-dir="));
  const outputDirectory = path.resolve(
    outputArgument?.slice("--out-dir=".length) ?? path.join(process.env.TMPDIR || "/tmp", "notebooks-mdx-v2"),
  );
  const results = await auditHtmlDirectory(outputDirectory);
  const totals = results.reduce((sum, result) => ({
    headings: sum.headings + result.headings,
    examples: sum.examples + result.examples,
    glossaryReferences: sum.glossaryReferences + result.glossaryReferences,
    diagrams: sum.diagrams + result.diagrams,
    desmos: sum.desmos + result.desmos,
  }), { headings: 0, examples: 0, glossaryReferences: 0, diagrams: 0, desmos: 0 });
  console.info(
    `HTML audit passed: ${results.length} file(s), ${totals.headings} headings, ${totals.examples} examples, `
    + `${totals.diagrams} SVG diagrams, ${totals.desmos} Desmos blocks.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
