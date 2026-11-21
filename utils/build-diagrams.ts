import { createServer } from "node:http";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

type DiagramCounts = { mermaid: number; tikz: number };

declare global {
  interface Window {
    mermaid?: { initialize: (options: Record<string, unknown>) => void };
    obsidianInitMermaid?: (root?: Element) => Promise<void> | void;
    obsidianInitTikz?: (root?: Element) => void;
  }
}

function contentType(filePath: string): string {
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".ttf")) return "font/ttf";
  return "application/octet-stream";
}

async function htmlFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return htmlFiles(filePath);
    return entry.isFile() && entry.name.endsWith(".html") ? [filePath] : [];
  }));
  return nested.flat();
}

function svgWithThemeColors(value: string): string {
  return value
    .replace(/\b(fill|stroke|color)=(["'])\s*(?:black|#000(?:000)?|rgb\(0,\s*0,\s*0\))\s*\2/gi, '$1="currentColor"')
    .replace(/\b(fill|stroke|color)=(["'])\s*(?:white|#fff(?:fff)?|rgb\(255,\s*255,\s*255\))\s*\2/gi, '$1="var(--reader-surface)"')
    .replace(/(fill|stroke|color)\s*:\s*(?:black|#000(?:000)?|rgb\(0,\s*0,\s*0\))/gi, "$1:currentColor")
    .replace(/(fill|stroke|color)\s*:\s*(?:white|#fff(?:fff)?|rgb\(255,\s*255,\s*255\))/gi, "$1:var(--reader-surface)");
}

async function createAssetServer(root: string, mermaidPath: string): Promise<{
  server: ReturnType<typeof createServer>;
  origin: string;
}> {
  const pluginPath = path.join(root, "utils/obsidian-markdown-it.js");
  const tikzPath = path.join(root, "utils/tikzjax/output/tikzjax.js");
  const fontPath = path.join(root, "utils/tikzjax/css/bakoma/ttf/cmr10.ttf");
  const assets = new Map([
    ["/obsidian-markdown-it.js", pluginPath],
    ["/mermaid.min.js", mermaidPath],
    ["/tikzjax.js", tikzPath],
    ["/cmr10.ttf", fontPath],
  ]);
  const server = createServer(async (request, response) => {
    try {
      const requestPath = new URL(request.url || "/", "http://127.0.0.1").pathname;
      const filePath = assets.get(requestPath);
      if (!filePath) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      const content = await readFile(filePath);
      response.writeHead(200, { "content-type": contentType(filePath) });
      response.end(content);
    } catch (error) {
      response.writeHead(500);
      response.end(error instanceof Error ? error.message : String(error));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to start diagram asset server.");
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function renderFile(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  origin: string,
  filePath: string,
): Promise<{ html: string; counts: DiagramCounts }> {
  const source = await readFile(filePath, "utf8");
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  try {
    await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
    await page.setContent(
      `<!doctype html><html data-mode="light"><head><base href="${origin}/"></head>`
      + `<body><main id="render-root">${source}</main></body></html>`,
      { waitUntil: "domcontentloaded" },
    );
    await page.addStyleTag({
      content: "@font-face{font-family:cmr10;src:url('/cmr10.ttf') format('truetype');font-display:block}",
    });
    await page.addScriptTag({ url: `${origin}/obsidian-markdown-it.js` });
    await page.addScriptTag({ url: `${origin}/mermaid.min.js` });
    await page.addScriptTag({ url: `${origin}/tikzjax.js` });
    await page.evaluate(() => {
      if (!window.mermaid) throw new Error("The pinned Mermaid browser bundle did not initialize.");
      window.mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        themeVariables: {
          primaryColor: "#f7f8fa",
          primaryTextColor: "#172033",
          primaryBorderColor: "#3569cc",
          lineColor: "#3569cc",
          secondaryColor: "#edf2fb",
          tertiaryColor: "#ffffff",
          background: "#ffffff",
        },
      });
    });

    const figures = page.locator("figure[data-diagram]");
    const count = await figures.count();
    const counts: DiagramCounts = { mermaid: 0, tikz: 0 };
    for (let index = 0; index < count; index += 1) {
      const figure = figures.nth(index);
      const id = await figure.getAttribute("data-diagram-id");
      const kind = await figure.getAttribute("data-diagram-kind");
      if (!id || (kind !== "mermaid" && kind !== "tikz")) {
        throw new Error(`${filePath}: diagram ${index + 1} has missing or unsupported metadata.`);
      }
      try {
        if (kind === "mermaid") {
          await figure.evaluate(async (element) => {
            await window.obsidianInitMermaid?.(element);
          });
        } else {
          await figure.evaluate((element) => {
            window.obsidianInitTikz?.(element);
          });
        }
        await page.waitForFunction((diagramId) => {
          const element = [...document.querySelectorAll("figure[data-diagram]")].find(
            (figureElement) => figureElement.getAttribute("data-diagram-id") === diagramId,
          );
          return Boolean(element?.querySelector("svg, .tikz-error"));
        }, id, { timeout: 90_000 });
        const result = await figure.evaluate((element) => {
          const svg = element.querySelector("svg");
          if (!svg) {
            const error = element.querySelector(".tikz-error");
            throw new Error(error?.textContent?.trim() || "renderer produced no SVG.");
          }
          const markup = svg.outerHTML;
          const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
          if (parsed.querySelector("parsererror") || parsed.documentElement.localName !== "svg") {
            throw new Error("renderer produced invalid SVG XML.");
          }
          if (!parsed.documentElement.childElementCount) throw new Error("renderer produced an empty SVG.");
          return markup;
        });
        const themed = svgWithThemeColors(result);
        await figure.evaluate((element, svgMarkup) => {
          const container = document.createElement("div");
          container.className = "diagram-svg-container";
          container.innerHTML = svgMarkup;
          element.replaceChildren(container);
        }, themed);
        counts[kind] += 1;
      } catch (error) {
        throw new Error(
          `${filePath}: ${kind} diagram ${id} failed: ${error instanceof Error ? error.message : String(error)}`
          + `${consoleErrors.length ? ` Browser errors: ${consoleErrors.join(" | ")}` : ""}`,
        );
      }
    }
    const html = await page.locator("#render-root").innerHTML();
    return { html, counts };
  } finally {
    await page.close();
  }
}

export async function buildDiagrams(root: string, outputDirectory: string): Promise<{
  files: number;
  mermaid: number;
  tikz: number;
}> {
  const files = await htmlFiles(outputDirectory);
  const mermaidPath = path.join(path.dirname(fileURLToPath(import.meta.resolve("mermaid"))), "mermaid.min.js");
  const { server, origin } = await createAssetServer(root, mermaidPath);
  const browser = await chromium.launch({ headless: true });
  const totals = { files: 0, mermaid: 0, tikz: 0 };

  try {
    for (const filePath of files) {
      const source = await readFile(filePath, "utf8");
      if (!/<figure\b[^>]*\bdata-diagram(?:\s|>)/i.test(source) || source.includes("diagram-svg-container")) continue;
      const rendered = await renderFile(browser, origin, filePath);
      await writeFile(filePath, `${rendered.html}\n`, "utf8");
      totals.files += 1;
      totals.mermaid += rendered.counts.mermaid;
      totals.tikz += rendered.counts.tikz;
    }
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
  return totals;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const outputArgument = process.argv.find((argument) => argument.startsWith("--out-dir="));
  const outputDirectory = path.resolve(
    outputArgument?.slice("--out-dir=".length) ?? path.join(process.env.TMPDIR || "/tmp", "notebooks-mdx-v2"),
  );
  const result = await buildDiagrams(root, outputDirectory);
  console.info(
    `Rendered ${result.mermaid} Mermaid and ${result.tikz} TikZ diagrams across ${result.files} HTML files.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
