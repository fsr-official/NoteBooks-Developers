/// <reference path="./markdown-plugins.d.ts" />

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import MarkdownIt, { type Token } from "markdown-it";
import footnote from "markdown-it-footnote";
import sub from "markdown-it-sub";
import sup from "markdown-it-sup";
import taskLists from "markdown-it-task-lists";
import texmath from "markdown-it-texmath";
import katex from "katex";
import { compileDesmos2D } from "./build-desmos-2d.js";
import { compileDesmos3D } from "./build-desmos-3d.js";
import { preprocessMarkdown } from "./markdown-preprocessor.js";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type MarkdownParser = InstanceType<typeof MarkdownIt>;
type SectionOutline = { id: string; number: string; title: string; level: number };
type SearchBlock = { sectionId: string; blockId: string; text: string };
type RenderEnvironment = {
  filePath?: string;
  sectionId?: string;
  blockNumber?: number;
  outline?: SectionOutline[];
  searchIndex?: SearchBlock[];
  figures?: Array<{ id: string; type: "mermaid" | "tikz" | "desmos" | "desmos3d"; source: string }>;
  desmos?: Array<{ id: string; kind: "2d" | "3d"; data: Json }>;
};

type ObsidianWindow = {
  obsidianPlugin?: (md: MarkdownParser, options?: Record<string, unknown>) => void;
  obsidianGetCSS?: () => string;
};

export type RenderedMarkdown = {
  html: string;
  outline: SectionOutline[];
  searchIndex: SearchBlock[];
  figures: NonNullable<RenderEnvironment["figures"]>;
  desmos: NonNullable<RenderEnvironment["desmos"]>;
};

const rendererPath = fileURLToPath(new URL("./obsidian-markdown-it.js", import.meta.url));
const obsidianWindow: ObsidianWindow = loadObsidianWindow(rendererPath);

function loadObsidianWindow(sourcePath: string): ObsidianWindow {
  const sandbox: { window: ObsidianWindow } = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(sourcePath, "utf8"), sandbox, { filename: sourcePath });
  if (typeof sandbox.window.obsidianPlugin !== "function") {
    throw new Error(`The shared Markdown renderer did not expose its required API: ${path.basename(sourcePath)}`);
  }
  return sandbox.window;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function toJson(value: unknown): Json {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) return value.map(toJson);
  if (typeof value !== "object") throw new Error("Desmos compiler returned a non-JSON value.");
  return Object.fromEntries(
    Object.entries(value).filter(([, child]) => child !== undefined).map(([key, child]) => [key, toJson(child)]),
  );
}

function idFor(type: "diagram" | "desmos", source: string): string {
  return `${type}-${createHash("sha256").update(source).digest("hex").slice(0, 12)}`;
}

function plainInlineText(tokens: Token[]): string {
  return tokens.flatMap((token) => {
    const calloutTitle = token.meta?.calloutTitle;
    if (typeof calloutTitle === "string") return [calloutTitle];
    const obsidianText = token.meta?.obsidianText;
    if (typeof obsidianText === "string") return [obsidianText];
    if (token.type === "math_inline" || token.type === "math_block") return [];
    if (token.type === "text" || token.type === "code_inline" || token.type === "image") {
      return [token.type === "image" ? token.content : token.content];
    }
    if (token.type === "html_inline") {
      return [token.content.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")];
    }
    if (token.type === "softbreak" || token.type === "hardbreak") return [" "];
    if (token.type === "inline") return plainInlineText(token.children ?? []);
    return [];
  }).join("").replace(/\s+/g, " ").trim();
}

function slugify(title: string): string {
  return title.toLowerCase().normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "") || "section";
}

function addSectionMetadata(md: MarkdownParser): void {
  md.core.ruler.push("notebooks_static_metadata", (state) => {
    const env = state.env as RenderEnvironment;
    env.outline = [];
    env.searchIndex = [];
    env.figures ??= [];
    env.desmos ??= [];
    const idCounts = new Map<string, number>();
    let activeSection = "preamble";
    let blockNumber = 0;
    let previousOpen = "";

    for (let index = 0; index < state.tokens.length; index += 1) {
      const token = state.tokens[index];
      if (token.type === "heading_open") {
        const inline = state.tokens[index + 1];
        const rawTitle = inline?.type === "inline" ? plainInlineText(inline.children ?? []) : "";
        const numberedTitle = rawTitle.match(/^\s*(?:§\s*)?(\d+(?:\.\d+)*)(?:[.)])?\s+(.+)$/);
        const topSection = rawTitle.match(/^\s*SECTION\s+(\d+)\b\s*(.*)$/i);
        const number = topSection ? `SECTION-${topSection[1]}` : numberedTitle?.[1] ?? "";
        const title = topSection
          ? topSection[2].replace(/^[\s—–:-]+/, "").trim()
          : numberedTitle?.[2] ?? rawTitle;
        const base = slugify(title);
        const occurrence = (idCounts.get(base) ?? 0) + 1;
        idCounts.set(base, occurrence);
        const id = occurrence === 1 ? base : `${base}-${occurrence}`;
        activeSection = number || id;
        token.attrSet("id", id);
        token.attrSet("data-section-id", activeSection);
        token.attrSet("data-block-id", `${id}-heading`);
        env.outline.push({
          id: activeSection,
          number: number || activeSection,
          title: title || "Untitled section",
          level: Number(token.tag.slice(1)),
        });
        if (title) env.searchIndex.push({ sectionId: activeSection, blockId: `${id}-heading`, text: title });
        previousOpen = token.type;
        continue;
      }

      if (token.type === "paragraph_open") {
        blockNumber += 1;
        token.attrSet("data-section-id", activeSection);
        token.attrSet("data-block-id", `${activeSection}-block-${blockNumber}`);
        previousOpen = token.type;
        continue;
      }

      if (token.type === "inline") {
        const text = plainInlineText(token.children ?? []);
        if (text && previousOpen !== "heading_open") {
          env.searchIndex.push({
            sectionId: activeSection,
            blockId: `${activeSection}-block-${blockNumber}`,
            text,
          });
        }
      }

      if (token.nesting === -1) previousOpen = "";
      else if (token.nesting === 1 && token.type !== "heading_open" && token.type !== "paragraph_open") {
        previousOpen = token.type;
      }
    }
  });
}

function markdownParser(): MarkdownParser {
  const md = new MarkdownIt({ html: false, linkify: true, typographer: true });
  md.use(footnote).use(sub).use(sup).use(taskLists, { enabled: true });
  md.use(texmath, {
    engine: katex,
    delimiters: ["dollars", "brackets", "beg_end"],
    katexOptions: { throwOnError: false, strict: "ignore", output: "html" },
  });
  md.use(obsidianWindow.obsidianPlugin!, {
    enableMath: false,
    enableTikz: true,
    enableMermaid: true,
    resolveWikilink: (target: string, _alias: string | null, anchor: string | null) =>
      `#${encodeURIComponent(target)}${anchor ? `%23${encodeURIComponent(anchor)}` : ""}`,
    resolveEmbed: (fileName: string) => fileName,
    resolveTag: (tag: string) => `#tag-${encodeURIComponent(tag)}`,
  });

  const originalFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, index, options, env, renderer) => {
    const token = tokens[index];
    const language = token.info.trim().split(/\s+/)[0]?.toLowerCase();
    const renderPluginFence = () => originalFence
      ? originalFence(tokens, index, options, env, renderer)
      : renderer.renderToken(tokens, index, options);
    const renderEnv = (env ?? {}) as RenderEnvironment;

    if (language === "mermaid" || language === "tikz") {
      const id = idFor("diagram", `${language}\n${token.content}`);
      renderEnv.figures?.push({ id, type: language, source: token.content });
      return `<figure data-diagram data-diagram-id="${id}" data-diagram-kind="${language}">${renderPluginFence()}</figure>\n`;
    }

    if (language === "desmos" || language === "desmos3d") {
      const kind = language === "desmos" ? "2d" : "3d";
      const compiled = kind === "2d" ? compileDesmos2D(token.content) : compileDesmos3D(token.content);
      if (!compiled.ok) {
        const sourceLine = (token.map?.[0] ?? 0) + 1;
        const diagnostic = compiled.diagnostics.find((item) => item.severity === "error");
        throw new Error(
          `${renderEnv.filePath ?? "Markdown"}:${sourceLine + (diagnostic?.line ?? 1) - 1}: `
          + `${diagnostic?.code ?? "DESMOS_COMPILE_FAILED"}: ${diagnostic?.message ?? "Desmos compilation failed."}`,
        );
      }
      const id = idFor("desmos", `${kind}\n${token.content}`);
      const data = toJson(compiled.output);
      renderEnv.desmos?.push({ id, kind, data });
      const serialized = JSON.stringify(data).replace(/</g, "\\u003c");
      return `<div data-desmos data-id="${id}" data-kind="${kind}">`
        + `<script type="application/json" data-desmos-request>${serialized}</script></div>\n`;
    }

    return renderPluginFence();
  };

  addSectionMetadata(md);
  return md;
}

export function renderMarkdownDocument(source: string, filePath?: string): RenderedMarkdown {
  const env: RenderEnvironment = {
    filePath,
    outline: [],
    searchIndex: [],
    figures: [],
    desmos: [],
  };
  const md = markdownParser();
  const tokens = md.parse(preprocessMarkdown(source), env);
  const html = md.renderer.render(tokens, md.options, env)
    .replace(/("task-list-item-checkbox")(type=)/g, "$1 $2")
    .replace(/(checked="")(type=)/g, "$1 $2");
  return {
    html,
    outline: env.outline ?? [],
    searchIndex: env.searchIndex ?? [],
    figures: env.figures ?? [],
    desmos: env.desmos ?? [],
  };
}

export function renderMarkdownInline(source: string): string {
  const md = markdownParser();
  return md.renderInline(source);
}

export function obsidianRendererCss(): string {
  return obsidianWindow.obsidianGetCSS?.() ?? "";
}

export function escapeStaticHtml(value: string): string {
  return escapeHtml(value);
}
