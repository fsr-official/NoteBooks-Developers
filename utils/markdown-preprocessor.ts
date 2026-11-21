import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

type FrontmatterWindow = {
  obsidianParseFrontmatter?: (source: string) => { content: string };
};

const rendererPath = fileURLToPath(new URL("../public/js/obsidian-markdown-it.js", import.meta.url));

function loadFrontmatterParser(): NonNullable<FrontmatterWindow["obsidianParseFrontmatter"]> {
  const sandbox: { window: FrontmatterWindow } = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(rendererPath, "utf8"), sandbox, { filename: rendererPath });
  if (typeof sandbox.window.obsidianParseFrontmatter !== "function") {
    throw new Error(`The public Markdown renderer did not expose frontmatter parsing: ${path.basename(rendererPath)}`);
  }
  return sandbox.window.obsidianParseFrontmatter;
}

const parseFrontmatter = loadFrontmatterParser();

export function preprocessMarkdown(source: string): string {
  const result = parseFrontmatter(source);
  if (!result || typeof result.content !== "string") {
    throw new Error("The public Markdown frontmatter parser returned an invalid result.");
  }
  return result.content;
}
