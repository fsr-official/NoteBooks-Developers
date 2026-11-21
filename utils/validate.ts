import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "@mdx-js/mdx";
import type { Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { COMPONENT_PROP_SCHEMAS, type ComponentName } from "../src/research-and-development/schema/chapter.js";

type AstNode = {
  type: string;
  name?: string | null;
  value?: unknown;
  children?: AstNode[];
  attributes?: AstNode[];
  position?: { start: { line: number; column: number } };
};

type Diagnostic = {
  file: string;
  line: number;
  reason: string;
};

function isAstNode(value: unknown): value is AstNode {
  return typeof value === "object"
    && value !== null
    && "type" in value
    && typeof value.type === "string";
}

function errorLine(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if ("line" in error && typeof error.line === "number") return error.line;
  if (!("position" in error) || typeof error.position !== "object" || error.position === null) return undefined;
  if (!("start" in error.position) || typeof error.position.start !== "object" || error.position.start === null) {
    return undefined;
  }
  return "line" in error.position.start && typeof error.position.start.line === "number"
    ? error.position.start.line
    : undefined;
}

export type ChapterSources = {
  glossary: string;
  notes: string;
  cnotes: string;
};

export type ValidationReport = {
  errors: Diagnostic[];
  notesOnlySections: string[];
  chapters: ChapterClassification[];
};

export type ChapterClassification = {
  id: string;
  directory: string;
  status: "migrated" | "not migrated" | "failing";
};

type SourceEntry = {
  absolute: string;
  relative: string;
  directory: boolean;
};

type TriadFiles = {
  id: string;
  directory: string;
  files: Partial<Record<"GLOSSARY" | "NOTES" | "CNOTES", Partial<Record<"md" | "mdx", SourceEntry>>>>;
};

const COMPONENT_NAMES = Object.keys(COMPONENT_PROP_SCHEMAS) as ComponentName[];
const CALLOUT_TYPES = new Set(["example", "important", "note", "tip", "warning"]);
const SECTION_ID = /^(\d+\.\d+(?:\.\d+)?)\b/;
const SECTION_ID_LIST = /^\d+\.\d+(?:\.\d+)?$/;
const TOP_SECTION_ID = /^(?:SECTION\s+|§\s*)(\d+)\b/i;
const TRIAD_SOURCE = /^(.+)-(GLOSSARY|NOTES|CNOTES)\.(md|mdx)$/i;
const BUILD_ONLY_SOURCE = "research-and-development/schema/chapter.ts";
const IGNORED_ROOT_DIRECTORIES = new Set([".git", "build", "node_modules", ".next"]);

function parser() {
  return unified().use(remarkParse).use(remarkMdx).use(remarkGfm).use(remarkMath);
}

function markdownParser() {
  return unified().use(remarkParse).use(remarkGfm).use(remarkMath);
}

async function listTree(directory: string, prefix = ""): Promise<SourceEntry[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const result: SourceEntry[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      result.push({ absolute: path.join(directory, entry.name), relative, directory: true });
      result.push(...await listTree(path.join(directory, entry.name), relative));
    } else {
      result.push({ absolute: path.join(directory, entry.name), relative, directory: false });
    }
  }
  return result;
}

function findTriads(files: SourceEntry[]): Map<string, TriadFiles> {
  const triads = new Map<string, TriadFiles>();
  for (const file of files) {
    if (file.directory) continue;
    const basename = path.posix.basename(file.relative);
    const match = basename.match(TRIAD_SOURCE);
    if (!match) continue;
    const [, id, roleValue, extensionValue] = match;
    const role = roleValue.toUpperCase();
    const extension = extensionValue.toLowerCase();
    const directory = path.posix.dirname(file.relative);
    const key = `${directory}/${id}`;
    let triad = triads.get(key);
    if (!triad) {
      triad = {
        id,
        directory,
        files: {},
      };
      triads.set(key, triad);
    }
    const roleFiles = triad.files[role as "GLOSSARY" | "NOTES" | "CNOTES"] ??= {};
    roleFiles[extension as "md" | "mdx"] = file;
  }
  return triads;
}

async function listRootEntries(root: string): Promise<SourceEntry[]> {
  const entries: SourceEntry[] = [];
  async function visit(directory: string, prefix = ""): Promise<void> {
    const children = await readdir(directory, { withFileTypes: true });
    for (const child of children) {
      if (!prefix && (child.name === "src" || IGNORED_ROOT_DIRECTORIES.has(child.name))) continue;
      const relative = prefix ? `${prefix}/${child.name}` : child.name;
      const isDirectory = child.isDirectory();
      entries.push({ absolute: path.join(directory, child.name), relative, directory: isDirectory });
      if (isDirectory) await visit(path.join(directory, child.name), relative);
    }
  }
  await visit(root);
  return entries;
}

function checkCaseCollisions(entries: SourceEntry[], errors: Diagnostic[]): void {
  const seen = new Map<string, string>();
  for (const entry of entries) {
    const parts = entry.relative.split("/");
    for (let index = 0; index < parts.length; index += 1) {
      const prefix = parts.slice(0, index + 1).join("/");
      const normalized = prefix.toLocaleLowerCase("en");
      const previous = seen.get(normalized);
      if (previous && previous !== prefix) {
        errors.push({
          file: entry.relative,
          line: 1,
          reason: `case-insensitive path collision with "${previous}"`,
        });
        break;
      }
      seen.set(normalized, prefix);
    }
  }
}

function isMarkdown(file: SourceEntry): boolean {
  return !file.directory && /\.(?:md|mdx)$/i.test(file.relative);
}

function outputFiles(
  files: SourceEntry[],
  triads: Map<string, TriadFiles>,
): Map<string, SourceEntry> {
  const outputs = new Map<string, SourceEntry>();
  const triadSources = new Set<string>();
  for (const triad of triads.values()) {
    for (const roleFiles of Object.values(triad.files)) {
      for (const file of Object.values(roleFiles ?? {})) {
        if (file) triadSources.add(file.relative);
      }
    }
    const allMarkdown = (["GLOSSARY", "NOTES", "CNOTES"] as const)
      .map((role) => triad.files[role]?.mdx ?? triad.files[role]?.md);
    if (allMarkdown.every(Boolean) && allMarkdown.every((file) => file?.relative.toLowerCase().endsWith(".mdx"))) {
      const parent = triad.directory === "." ? "" : `${triad.directory}/`;
      outputs.set(`${parent}${triad.id}.html`, allMarkdown[0]!);
    }
  }

  const ordinaryMarkdown = new Map<string, SourceEntry>();
  for (const file of files) {
    if (file.directory || file.relative === BUILD_ONLY_SOURCE || triadSources.has(file.relative)) continue;
    if (isMarkdown(file)) {
      const output = `${file.relative.replace(/\.(?:md|mdx)$/i, "")}.html`;
      const previous = ordinaryMarkdown.get(output);
      if (!previous || file.relative.toLowerCase().endsWith(".mdx")) ordinaryMarkdown.set(output, file);
    } else {
      outputs.set(file.relative, file);
    }
  }
  for (const [output, file] of ordinaryMarkdown) outputs.set(output, file);
  return outputs;
}

function checkOutputCollisions(
  rootEntries: SourceEntry[],
  outputs: Map<string, SourceEntry>,
  errors: Diagnostic[],
): void {
  const rootByPath = new Map(rootEntries.map((entry) => [entry.relative.toLocaleLowerCase("en"), entry]));
  const outputOwners = new Map<string, string>();
  for (const [output, source] of outputs) {
    const normalized = output.toLocaleLowerCase("en");
    const previousOutput = outputOwners.get(normalized);
    if (previousOutput && previousOutput !== output) {
      errors.push({
        file: source.relative,
        line: 1,
        reason: `mirrored output path "${output}" collides with "${previousOutput}"`,
      });
    } else {
      outputOwners.set(normalized, output);
    }

    const existing = rootByPath.get(normalized);
    if (existing) {
      errors.push({
        file: source.relative,
        line: 1,
        reason: `mirrored output path "${output}" collides with existing root path "${existing.relative}"`,
      });
    }
    const parts = output.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      const parent = parts.slice(0, index).join("/").toLocaleLowerCase("en");
      const existingParent = rootByPath.get(parent);
      if (existingParent && !existingParent.directory) {
        errors.push({
          file: source.relative,
          line: 1,
          reason: `mirrored output path "${output}" has a file blocking parent path "${existingParent.relative}"`,
        });
        break;
      }
    }
  }
}
function walk(node: AstNode, visit: (node: AstNode) => void): void {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
  for (const attribute of node.attributes ?? []) {
    if (isAstNode(attribute.value)) {
      walk(attribute.value, visit);
    }
  }
}

function textContent(node: AstNode): string {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(textContent).join("");
}

function lineOf(node: AstNode): number {
  return node.position?.start.line ?? 1;
}

function sectionHeadingLines(tree: Root): Array<{ id: string; line: number }> {
  const headings: Array<{ id: string; line: number }> = [];
  walk(tree as AstNode, (node) => {
    if (node.type !== "heading") return;
    const text = textContent(node).trim();
    const topSection = text.match(TOP_SECTION_ID);
    const subsection = text.match(SECTION_ID);
    const id = topSection?.[1] ?? subsection?.[1];
    if (id) headings.push({ id, line: lineOf(node) });
  });
  return headings;
}

function attributeMap(node: AstNode): Map<string, string> | null {
  const values = new Map<string, string>();
  for (const attribute of node.attributes ?? []) {
    if (attribute.type !== "mdxJsxAttribute" || !attribute.name) return null;
    if (typeof attribute.value !== "string") return null;
    values.set(attribute.name, attribute.value);
  }
  return values;
}

function normalizedGlossaryTerms(tree: Root): Array<{ term: string; line: number }> {
  const terms: Array<{ term: string; line: number }> = [];
  walk(tree as AstNode, (node) => {
    if (node.type !== "paragraph") return;
    const first = node.children?.[0];
    if (first?.type !== "strong") return;
    const term = textContent(first).trim();
    if (term) terms.push({ term, line: lineOf(node) });
  });
  return terms;
}

function addMdxDiagnostics(
  tree: Root,
  file: string,
  knownSections: Set<string>,
  errors: Diagnostic[],
): void {
  const exampleIds = new Set<string>();

  walk(tree as AstNode, (node) => {
    if (node.type === "blockquote") {
      const marker = textContent(node).trim().match(/^\[!([a-z][a-z0-9_-]*)\]/i);
      if (marker && !CALLOUT_TYPES.has(marker[1].toLowerCase())) {
        errors.push({ file, line: lineOf(node), reason: `unknown callout type "${marker[1]}"` });
      }
    }

    if (node.type === "mdxjsEsm") {
      errors.push({ file, line: lineOf(node), reason: "import/export statements are not allowed" });
      return;
    }

    if (node.type === "mdxFlowExpression" || node.type === "mdxTextExpression") {
      errors.push({ file, line: lineOf(node), reason: "JavaScript expressions are not allowed in the data tree" });
      return;
    }

    if (node.type !== "mdxJsxFlowElement" && node.type !== "mdxJsxTextElement") return;

    const name = node.name;
    if (!name || !COMPONENT_NAMES.includes(name as ComponentName)) {
      errors.push({
        file,
        line: lineOf(node),
        reason: `unknown component "${name ?? "(fragment)"}"`,
      });
      return;
    }

    const componentName = name as ComponentName;
    const schema = COMPONENT_PROP_SCHEMAS[componentName];
    const attributes = attributeMap(node);
    if (!attributes) {
      errors.push({ file, line: lineOf(node), reason: `${componentName} props must be static string values` });
      return;
    }

    const allowed = new Set([...schema.required, ...schema.optional]);
    for (const propName of attributes.keys()) {
      if (!allowed.has(propName)) {
        errors.push({
          file,
          line: lineOf(node),
          reason: `${componentName} has unknown prop "${propName}"`,
        });
      }
    }
    for (const propName of schema.required) {
      if (!attributes.has(propName) || !attributes.get(propName)?.trim()) {
        errors.push({ file, line: lineOf(node), reason: `${componentName} is missing required prop "${propName}"` });
      }
    }
    for (const propName of Object.keys(schema.values ?? {})) {
      const permitted = schema.values?.[propName];
      const value = attributes.get(propName);
      if (permitted && value !== undefined && !permitted.includes(value)) {
        errors.push({
          file,
          line: lineOf(node),
          reason: `${componentName}.${propName} must be one of: ${permitted.join(", ")}`,
        });
      }
    }

    if (componentName !== "Example") return;
    const id = attributes.get("id");
    if (id) {
      if (exampleIds.has(id)) errors.push({ file, line: lineOf(node), reason: `duplicate example id "${id}"` });
      exampleIds.add(id);
    }
    for (const propName of ["from", "concepts"] as const) {
      const references = attributes.get(propName)?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
      for (const sectionId of references) {
        if (!SECTION_ID_LIST.test(sectionId)) {
          errors.push({
            file,
            line: lineOf(node),
            reason: `Example ${propName} contains invalid section id "${sectionId}"`,
          });
        } else if (!knownSections.has(sectionId)) {
          errors.push({
            file,
            line: lineOf(node),
            reason: `Example ${propName} references missing NOTES section "${sectionId}"`,
          });
        }
      }
    }
  });
}

export async function validateSources(
  chapterId: string,
  sources: ChapterSources,
): Promise<ValidationReport> {
  const errors: Diagnostic[] = [];
  const parsed = new Map<keyof ChapterSources, Root>();

  for (const key of ["glossary", "notes", "cnotes"] as const) {
    const file = `${chapterId}-${key.toUpperCase()}.mdx`;
    try {
      parsed.set(key, parser().parse(sources[key]));
    } catch (error) {
      const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
      errors.push({ file, line: errorLine(error) ?? 1, reason });
    }
  }

  const notesTree = parsed.get("notes");
  const cnotesTree = parsed.get("cnotes");
  const glossaryTree = parsed.get("glossary");
  if (!notesTree || !cnotesTree || !glossaryTree) {
    return { errors, notesOnlySections: [], chapters: [] };
  }

  const notesHeadings = sectionHeadingLines(notesTree);
  const cnotesHeadings = sectionHeadingLines(cnotesTree);
  const notesSections = new Set(notesHeadings.map(({ id }) => id));
  const cnotesSections = new Set(cnotesHeadings.map(({ id }) => id));
  for (const [file, headings] of [
    [`${chapterId}-NOTES.mdx`, notesHeadings],
    [`${chapterId}-CNOTES.mdx`, cnotesHeadings],
  ] as const) {
    const seen = new Set<string>();
    for (const { id, line } of headings) {
      if (seen.has(id)) errors.push({ file, line, reason: `duplicate section ID "${id}"` });
      seen.add(id);
    }
  }
  for (const { id: sectionId, line } of cnotesHeadings) {
    if (!notesSections.has(sectionId)) {
      errors.push({
        file: `${chapterId}-CNOTES.mdx`,
        line,
        reason: `CNOTES section "${sectionId}" is missing from NOTES`,
      });
    }
  }
  for (const { id: sectionId, line } of notesHeadings) {
    if (!cnotesSections.has(sectionId)) {
      errors.push({
        file: `${chapterId}-NOTES.mdx`,
        line,
        reason: `NOTES section "${sectionId}" is missing from CNOTES`,
      });
    }
  }

  addMdxDiagnostics(notesTree, `${chapterId}-NOTES.mdx`, notesSections, errors);
  addMdxDiagnostics(cnotesTree, `${chapterId}-CNOTES.mdx`, notesSections, errors);
  addMdxDiagnostics(glossaryTree, `${chapterId}-GLOSSARY.mdx`, notesSections, errors);

  const seenTerms = new Set<string>();
  const glossaryTerms = normalizedGlossaryTerms(glossaryTree);
  const alphabetizedTerms = [...glossaryTerms].sort((left, right) =>
    left.term.localeCompare(right.term, "en", { sensitivity: "base" }));
  for (let index = 0; index < glossaryTerms.length; index += 1) {
    const { term, line } = glossaryTerms[index];
    const normalized = term.toLocaleLowerCase("en").replace(/\s+/g, " ");
    if (seenTerms.has(normalized)) {
      errors.push({
        file: `${chapterId}-GLOSSARY.mdx`,
        line,
        reason: `duplicate glossary entry "${term}"`,
      });
    }
    seenTerms.add(normalized);
    if (term !== alphabetizedTerms[index]?.term) {
      errors.push({
        file: `${chapterId}-GLOSSARY.mdx`,
        line,
        reason: `glossary entry "${term}" is out of alphabetical order`,
      });
    }
    const paragraph = glossaryTree.children.find((node) =>
      node.type === "paragraph" && textContent(node as AstNode).includes(term));
    const definition = paragraph ? textContent(paragraph as AstNode) : "";
    if (!/§\s*\d/.test(definition) && !/\bsee\b/i.test(definition)) {
      errors.push({
        file: `${chapterId}-GLOSSARY.mdx`,
        line,
        reason: `glossary entry "${term}" must reference a NOTES section with §`,
      });
    }
  }

  for (const key of ["glossary", "notes", "cnotes"] as const) {
    if (!parsed.has(key)) continue;
    const file = `${chapterId}-${key.toUpperCase()}.mdx`;
    try {
      await compile(sources[key], { remarkPlugins: [remarkGfm, remarkMath] });
    } catch (error) {
      const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
      errors.push({ file, line: errorLine(error) ?? 1, reason });
    }
  }

  return {
    errors,
    notesOnlySections: [...notesSections].filter((sectionId) => !cnotesSections.has(sectionId)).sort(),
    chapters: [],
  };
}

export async function validateSourceTree(root = process.cwd()): Promise<ValidationReport> {
  const sourceRoot = path.resolve(root, "src");
  let files: SourceEntry[];
  try {
    files = await listTree(sourceRoot);
  } catch (error) {
    return {
      errors: [{
        file: "src",
        line: 1,
        reason: error instanceof Error ? error.message : String(error),
      }],
      notesOnlySections: [],
      chapters: [],
    };
  }

  const errors: Diagnostic[] = [];
  checkCaseCollisions(
    files.map((entry) => ({ ...entry, relative: `src/${entry.relative}` })),
    errors,
  );
  const triads = findTriads(files);

  for (const file of files) {
    if (!isMarkdown(file)) continue;
    const extension = path.extname(file.relative).toLowerCase();
    try {
      const source = await readFile(file.absolute, "utf8");
      if (extension === ".mdx") {
        await compile(source, { remarkPlugins: [remarkGfm, remarkMath] });
      } else {
        markdownParser().parse(source);
      }
    } catch (error) {
      errors.push({
        file: `src/${file.relative}`,
        line: errorLine(error) ?? 1,
        reason: error instanceof Error ? error.message.split("\n")[0] : String(error),
      });
    }
  }

  const chapters: ChapterClassification[] = [];
  const notesOnlySections: string[] = [];
  for (const triad of [...triads.values()].sort((left, right) =>
    `${left.directory}/${left.id}`.localeCompare(`${right.directory}/${right.id}`, "en"))) {
    const sourcePrefix = `src/${triad.directory}/`;
    const hadSourceError = errors.some((diagnostic) => diagnostic.file.startsWith(sourcePrefix));
    const chapterErrors: Diagnostic[] = [];
    const baseName = path.posix.basename(triad.directory);
    if (baseName !== triad.id) {
      chapterErrors.push({
        file: `src/${triad.directory}`,
        line: 1,
        reason: `triad filename ID "${triad.id}" must match its folder "${baseName}"`,
      });
    }
    const missingRoles = (["GLOSSARY", "NOTES", "CNOTES"] as const)
      .filter((role) => !triad.files[role]?.md && !triad.files[role]?.mdx);
    for (const role of missingRoles) {
      chapterErrors.push({
        file: `src/${triad.directory}/${triad.id}-${role}`,
        line: 1,
        reason: `triad is missing its ${role} source`,
      });
    }

    const chosenFiles = (["GLOSSARY", "NOTES", "CNOTES"] as const)
      .map((role) => triad.files[role]?.mdx ?? triad.files[role]?.md);
    const complete = chosenFiles.every(Boolean);
    const allMdx = complete && chosenFiles.every((file) =>
      file?.relative.toLowerCase().endsWith(".mdx"));
    const allMd = complete && chosenFiles.every((file) =>
      file?.relative.toLowerCase().endsWith(".md"));

    if (complete && !allMdx && !allMd) {
      chapterErrors.push({
        file: `src/${triad.directory}`,
        line: 1,
        reason: "a migrated triad must provide all three sources as .mdx files",
      });
    }

    if (allMdx) {
      const paths = chosenFiles as SourceEntry[];
      const contents = await Promise.all(paths.map((file) => readFile(file.absolute, "utf8")));
      const report = await validateSources(triad.id, {
        glossary: contents[0],
        notes: contents[1],
        cnotes: contents[2],
      });
      chapterErrors.push(...report.errors.map((diagnostic) => {
        const role = diagnostic.file.match(/-(GLOSSARY|NOTES|CNOTES)\.mdx$/)?.[1];
        const source = role
          ? triad.files[role as "GLOSSARY" | "NOTES" | "CNOTES"]?.mdx
          : undefined;
        return {
          ...diagnostic,
          file: source ? `src/${source.relative}` : `src/${triad.directory}/${diagnostic.file}`,
        };
      }));
      notesOnlySections.push(...report.notesOnlySections);
    }

    errors.push(...chapterErrors);
    chapters.push({
      id: triad.id,
      directory: `src/${triad.directory}`,
      status: chapterErrors.length > 0 || hadSourceError
        ? "failing"
        : allMdx
          ? "migrated"
          : allMd
            ? "not migrated"
            : "failing",
    });
  }

  const rootEntries = await listRootEntries(root);
  const outputs = outputFiles(files, triads);
  checkOutputCollisions(rootEntries, outputs, errors);

  return {
    errors,
    notesOnlySections: [...new Set(notesOnlySections)].sort(),
    chapters,
  };
}

export async function validateChapter(
  chapterId = "PHYSICS06-SYSTEM_OF_PARTICLES_AND_ROTATIONAL_MOTION",
  root = process.cwd(),
): Promise<ValidationReport> {
  const chapterDir = path.resolve(root, "src/AI-NOTES", chapterId);
  const errors: Diagnostic[] = [];
  const files = {
    glossary: `${chapterId}-GLOSSARY`,
    notes: `${chapterId}-NOTES`,
    cnotes: `${chapterId}-CNOTES`,
  };
  const sources: Partial<ChapterSources> = {};
  let available: Set<string>;
  try {
    available = new Set(await readdir(chapterDir));
  } catch (error) {
    return {
      errors: [{
        file: `src/AI-NOTES/${chapterId}`,
        line: 1,
        reason: error instanceof Error ? error.message : String(error),
      }],
      notesOnlySections: [],
      chapters: [],
    };
  }

  for (const key of ["glossary", "notes", "cnotes"] as const) {
    const stem = files[key];
    const sourcePath = [".mdx", ".md"]
      .map((extension) => `${stem}${extension}`)
      .find((file) => available.has(file));
    if (!sourcePath) {
      errors.push({ file: `src/AI-NOTES/${chapterId}/${stem}.mdx`, line: 1, reason: "source file is missing" });
      continue;
    }
    try {
      sources[key] = await readFile(path.join(chapterDir, sourcePath), "utf8");
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      errors.push({ file: `src/AI-NOTES/${chapterId}/${sourcePath}`, line: 1, reason });
    }
  }

  if (errors.length > 0) return { errors, notesOnlySections: [], chapters: [] };
  const { glossary, notes, cnotes } = sources;
  if (glossary === undefined || notes === undefined || cnotes === undefined) {
    return {
      errors: [{ file: chapterId, line: 1, reason: "a chapter source file is missing" }],
      notesOnlySections: [],
      chapters: [],
    };
  }
  return validateSources(chapterId, {
    glossary,
    notes,
    cnotes,
  });
}

async function main(): Promise<void> {
  const report = await validateSourceTree();
  for (const chapter of report.chapters) {
    console.info(`${chapter.directory}: ${chapter.status}`);
  }
  for (const error of report.errors) {
    console.error(`${error.file}:${error.line}: ${error.reason}`);
  }
  if (report.notesOnlySections.length > 0) {
    console.error(`NOTES sections missing from CNOTES: ${report.notesOnlySections.join(", ")}`);
  }
  if (report.errors.length > 0) {
    console.error(`Validation failed with ${report.errors.length} error(s).`);
    process.exitCode = 1;
    return;
  }
  console.info(`Validated source tree: ${report.chapters.filter(({ status }) => status === "migrated").length} migrated, ${report.chapters.filter(({ status }) => status === "not migrated").length} not migrated.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
