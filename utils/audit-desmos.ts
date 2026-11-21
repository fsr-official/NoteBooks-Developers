import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright";

const DESMOS_API = "https://www.desmos.com/api/v1.11/calculator.js";
const BOOLEAN_FIELDS = new Set([
  "hidden",
  "secret",
  "showLabel",
  "fill",
  "points",
  "lines",
  "degreeMode",
  "showGrid",
  "showXAxis",
  "showYAxis",
  "hardMin",
  "hardMax",
]);
const DEFAULT_TRUE_FIELDS = new Set(["points"]);

type JsonRecord = Record<string, unknown>;
type Expression = JsonRecord & { id?: string; type?: string; latex?: string; text?: string };
type DesmosRequest = {
  expressions: Expression[];
  options?: JsonRecord;
  settings?: JsonRecord;
  bounds?: JsonRecord;
  camera?: unknown;
};
type DesmosBlock = { id: string; kind: "2d" | "3d"; request: DesmosRequest };
type Finding = { severity: "error" | "warning" | "info"; id?: string; message: string };
type AuditResult = { findings: Finding[]; counts: { errors: number; warnings: number; info: number } };
type CalculatorState = {
  expressions?: { list?: unknown[] };
  graph?: { viewport?: JsonRecord; [key: string]: unknown };
};
type ExpressionAnalysis = Record<string, { isError?: boolean; errorMessage?: string } | undefined>;

type BrowserResult = { state: unknown; analysis: ExpressionAnalysis };

type Calculator = {
  setExpressions: (expressions: Expression[]) => void;
  updateSettings?: (settings: JsonRecord) => void;
  setMathBounds?: (bounds: JsonRecord) => void;
  setCamera?: (camera: unknown) => void;
  getState: () => unknown;
  expressionAnalysis?: ExpressionAnalysis;
  destroy?: () => void;
  resize?: () => void;
};

type DesmosApi = {
  GraphingCalculator?: (host: HTMLElement, options: JsonRecord) => Calculator;
  Calculator3D?: (host: HTMLElement, options: JsonRecord) => Calculator;
};

declare global {
  interface Window {
    Desmos?: DesmosApi;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function latexEqual(expected: string, actual: string): boolean {
  const normalize = (value: string) => {
    const textBlocks: string[] = [];
    const source = value.replace(/\\(?:text|operatorname)\{[^{}]*\}/g, (block) => {
      textBlocks.push(normalizeText(block));
      return `__LATEX_BLOCK_${textBlocks.length - 1}__`;
    });
    return { source: source.replace(/\s+/g, ""), textBlocks };
  };
  const left = normalize(expected);
  const right = normalize(actual);
  return left.source === right.source
    && left.textBlocks.length === right.textBlocks.length
    && left.textBlocks.every((block, index) => block === right.textBlocks[index]);
}

function valuesEqual(expected: unknown, actual: unknown): boolean {
  if (typeof expected === "number" && typeof actual === "string" && actual.trim()) {
    return Number.isFinite(Number(actual)) && expected === Number(actual);
  }
  if (typeof actual === "number" && typeof expected === "string" && expected.trim()) {
    return Number.isFinite(Number(expected)) && actual === Number(expected);
  }
  if (typeof expected === "string" && typeof actual === "string") {
    return normalizeText(expected) === normalizeText(actual);
  }
  if (Array.isArray(expected)) {
    return Array.isArray(actual)
      && expected.length === actual.length
      && expected.every((value, index) => valuesEqual(value, actual[index]));
  }
  if (isRecord(expected)) {
    return isRecord(actual) && Object.keys(expected).every((key) => valuesEqual(expected[key], actual[key]));
  }
  return expected === actual;
}

function addCount(counts: AuditResult["counts"], finding: Finding): void {
  counts[finding.severity === "error" ? "errors" : finding.severity === "warning" ? "warnings" : "info"] += 1;
}

function addFieldFinding(
  findings: Finding[],
  expected: unknown,
  actual: unknown,
  id: string | undefined,
  field: string,
  target = "expression",
): void {
  const fieldName = field.slice(field.lastIndexOf(".") + 1);
  if (actual === undefined && expected === false && BOOLEAN_FIELDS.has(fieldName)) return;
  if (actual === undefined && expected === true && DEFAULT_TRUE_FIELDS.has(fieldName)) return;
  if (actual === undefined) {
    findings.push({
      severity: "warning",
      id,
      message: `${id ? `Expression '${id}'` : target} did not expose '${field}'.`,
    });
  } else if (!valuesEqual(expected, actual)) {
    findings.push({
      severity: "warning",
      id,
      message: `${id ? `Expression '${id}'` : target} changed '${field}'.`,
    });
  }
}

export function auditDesmosState(
  expected: DesmosRequest,
  actualValue: unknown,
  analysis: ExpressionAnalysis = {},
): AuditResult {
  const findings: Finding[] = [];
  const actual = isRecord(actualValue) ? actualValue as CalculatorState : undefined;
  const actualExpressions = actual?.expressions?.list;
  if (!Array.isArray(actualExpressions)) {
    const finding = { severity: "error" as const, message: "Calculator state is missing expressions.list." };
    return { findings: [finding], counts: { errors: 1, warnings: 0, info: 0 } };
  }

  const actualById = new Map<string, JsonRecord>();
  actualExpressions.forEach((value, index) => {
    if (!isRecord(value) || typeof value.id !== "string") {
      findings.push({ severity: "error", message: `Calculator expression ${index + 1} has no ID.` });
      return;
    }
    if (actualById.has(value.id)) {
      findings.push({ severity: "error", id: value.id, message: "Calculator state contains a duplicate expression ID." });
      return;
    }
    actualById.set(value.id, value);
  });

  const expectedIds = new Set<string>();
  for (const expression of expected.expressions) {
    const id = expression.id;
    if (typeof id !== "string" || !id) {
      findings.push({ severity: "error", message: "Compiled expression has no ID." });
      continue;
    }
    if (expectedIds.has(id)) {
      findings.push({ severity: "error", id, message: "Compiled request contains a duplicate expression ID." });
      continue;
    }
    expectedIds.add(id);
    const actualExpression = actualById.get(id);
    if (!actualExpression) {
      findings.push({ severity: "error", id, message: "Calculator state is missing the compiled expression." });
      continue;
    }
    if (expression.type !== undefined && expression.type !== actualExpression.type) {
      findings.push({ severity: "error", id, message: "Calculator changed the expression type." });
    }
    for (const field of ["latex", "text"] as const) {
      const expectedValue = expression[field];
      if (expectedValue === undefined) continue;
      const actualValue = actualExpression[field];
      const equal = field === "latex"
        ? typeof actualValue === "string" && latexEqual(expectedValue, actualValue)
        : valuesEqual(expectedValue, actualValue);
      if (!equal) {
        findings.push({
          severity: "error",
          id,
          message: actualValue === undefined
            ? `Calculator state dropped the expression's ${field}.`
            : `Calculator changed the expression's ${field}.`,
        });
      }
    }
    if (Array.isArray(expression.columns)) {
      const actualColumns = actualExpression.columns;
      if (!Array.isArray(actualColumns)) {
        findings.push({ severity: "error", id, message: "Calculator dropped the table columns." });
      } else {
        if (expression.columns.length !== actualColumns.length) {
          findings.push({ severity: "error", id, message: "Calculator changed the table column count." });
        }
        expression.columns.forEach((column, index) => {
          const actualColumn = actualColumns[index];
          if (!isRecord(column) || !isRecord(actualColumn)) return;
          for (const [field, value] of Object.entries(column)) {
            addFieldFinding(findings, value, actualColumn[field], id, `columns[${index}].${field}`);
          }
        });
      }
    }
    for (const [field, expectedValue] of Object.entries(expression)) {
      if (["id", "type", "latex", "text", "columns"].includes(field)) continue;
      if (field === "sliderBounds") {
        const slider = actualExpression.slider;
        if (!isRecord(slider)) {
          addFieldFinding(findings, expectedValue, undefined, id, field);
        } else if (isRecord(expectedValue)) {
          for (const [bound, value] of Object.entries(expectedValue)) {
            addFieldFinding(findings, value, slider[bound], id, `sliderBounds.${bound}`);
          }
        }
        continue;
      }
      addFieldFinding(findings, expectedValue, actualExpression[field], id, field);
    }
    if (expression.type !== "text" && expression.type !== "table") {
      const expressionResult = analysis[id];
      if (expressionResult?.isError) {
        findings.push({
          severity: "error",
          id,
          message: `Desmos reports a math error: ${expressionResult.errorMessage || "invalid expression."}`,
        });
      } else if (!expressionResult) {
        findings.push({ severity: "warning", id, message: "Desmos expression analysis was unavailable." });
      }
    }
  }

  for (const id of actualById.keys()) {
    if (!expectedIds.has(id)) findings.push({ severity: "info", id, message: "Calculator added an extra expression." });
  }
  for (const [field, value] of Object.entries(expected.bounds ?? {})) {
    const viewportField = ({ left: "xmin", right: "xmax", bottom: "ymin", top: "ymax" } as Record<string, string>)[field] ?? field;
    addFieldFinding(findings, value, actual?.graph?.viewport?.[viewportField], undefined, field, "viewport");
  }
  for (const [field, value] of Object.entries(expected.settings ?? {})) {
    addFieldFinding(findings, value, actual?.graph?.[field], undefined, field, "graph settings");
  }
  if (expected.camera !== undefined) {
    findings.push({ severity: "warning", message: "Camera state is not exposed for comparison by getState()." });
  }

  const counts = { errors: 0, warnings: 0, info: 0 };
  for (const finding of findings) addCount(counts, finding);
  return { findings, counts };
}

function requestFrom(value: unknown, file: string, id: string): DesmosRequest {
  if (!isRecord(value) || !Array.isArray(value.expressions)) {
    throw new Error(`${file}: Desmos block ${id} has an invalid embedded request.`);
  }
  if (!value.expressions.every(isRecord)) {
    throw new Error(`${file}: Desmos block ${id} contains an invalid expression.`);
  }
  return {
    expressions: value.expressions as Expression[],
    options: isRecord(value.options) ? value.options : undefined,
    settings: isRecord(value.settings) ? value.settings : undefined,
    bounds: isRecord(value.bounds) ? value.bounds : undefined,
    camera: value.camera,
  };
}

function safeError(error: unknown, apiKey: string): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replaceAll(apiKey, "[REDACTED]").replaceAll(encodeURIComponent(apiKey), "[REDACTED]");
}

async function readApiKey(root: string): Promise<string> {
  if (process.env.DESMOS_API_KEY?.trim()) return process.env.DESMOS_API_KEY.trim();
  let contents: string;
  try {
    contents = await readFile(path.join(root, ".env.local"), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error("DESMOS_API_KEY is missing from the environment and .env.local.");
    }
    throw error;
  }
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*DESMOS_API_KEY\s*=\s*(.*?)\s*$/);
    if (match) {
      const key = match[1].replace(/^(['"])([\s\S]*)\1$/, "$2").trim();
      if (key) return key;
      break;
    }
  }
  throw new Error("DESMOS_API_KEY is missing from the environment and .env.local.");
}

async function createHarnessServer(): Promise<{ server: ReturnType<typeof createServer>; origin: string }> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to start the Desmos audit harness.");
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function extractBlocks(page: Page, html: string, file: string): Promise<DesmosBlock[]> {
  const values: unknown = await page.evaluate((fragment) => {
    const document = new DOMParser().parseFromString(fragment, "text/html");
    return [...document.querySelectorAll("[data-desmos]")].map((block) => {
      const request = block.querySelector("script[data-desmos-request]");
      return {
        id: block.getAttribute("data-id") || "",
        kind: block.getAttribute("data-kind") || "",
        request: request ? JSON.parse(request.textContent || "{}") : null,
      };
    });
  }, html);
  if (!Array.isArray(values)) throw new Error(`${file}: could not read Desmos blocks from the built HTML.`);
  return values.map((value) => {
    if (!isRecord(value) || typeof value.id !== "string" || !value.id
      || (value.kind !== "2d" && value.kind !== "3d")) {
      throw new Error(`${file}: Desmos block metadata is invalid.`);
    }
    return {
      id: value.id,
      kind: value.kind,
      request: requestFrom(value.request, file, value.id),
    };
  });
}

async function renderRequest(page: Page, block: DesmosBlock): Promise<BrowserResult> {
  return page.evaluate(async ({ kind, request }) => {
    const api = window.Desmos;
    if (!api) throw new Error("Desmos API did not initialize.");
    const constructor = kind === "3d" ? api.Calculator3D : api.GraphingCalculator;
    if (typeof constructor !== "function") throw new Error(`Desmos ${kind} calculator is unavailable.`);
    if (kind === "3d") {
      const canvas = document.createElement("canvas");
      if (!canvas.getContext("webgl2") && !canvas.getContext("webgl")) {
        throw new Error("WebGL is unavailable for Desmos 3D.");
      }
    }
    const host = document.createElement("div");
    host.style.cssText = "width:1100px;height:760px;position:absolute;left:-1200px;top:0";
    document.body.append(host);
    const options = Object.fromEntries(
      Object.entries(request.options || {}).filter(([, value]) => typeof value === "boolean"),
    );
    let calculator: Calculator | undefined;
    try {
      calculator = constructor(host, {
        ...options,
        expressions: false,
        settingsMenu: false,
        zoomButtons: false,
        autosize: true,
      });
      if (!calculator) throw new Error("Desmos did not create a calculator.");
      const activeCalculator = calculator;
      if (request.settings && typeof activeCalculator.updateSettings !== "function") {
        throw new Error("Desmos calculator does not support requested settings.");
      }
      if (request.bounds && typeof activeCalculator.setMathBounds !== "function") {
        throw new Error("Desmos calculator does not support requested bounds.");
      }
      activeCalculator.setExpressions(request.expressions);
      if (request.settings) activeCalculator.updateSettings?.(request.settings);
      if (request.bounds) activeCalculator.setMathBounds?.(request.bounds);
      if (request.camera && activeCalculator.setCamera) activeCalculator.setCamera(request.camera);
      activeCalculator.resize?.();
      const expectedIds = request.expressions
        .filter((expression) => expression.type !== "text" && expression.type !== "table")
        .map((expression) => expression.id)
        .filter((id): id is string => typeof id === "string");
      const deadline = Date.now() + 2500;
      while (
        !expectedIds.every((id) => Object.hasOwn(activeCalculator.expressionAnalysis || {}, id))
        && Date.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const analysis: ExpressionAnalysis = {};
      for (const id of expectedIds) {
        const result = activeCalculator.expressionAnalysis?.[id];
        if (result) analysis[id] = { isError: result.isError, errorMessage: result.errorMessage };
      }
      return { state: activeCalculator.getState(), analysis };
    } finally {
      calculator?.destroy?.();
      host.remove();
    }
  }, { kind: block.kind, request: block.request });
}

export async function auditDesmosDirectory(outputDirectory: string, root: string): Promise<{
  files: number;
  blocks: number;
  expressions: number;
  warnings: string[];
}> {
  const key = await readApiKey(root);
  const manifest: unknown = JSON.parse(await readFile(path.join(outputDirectory, "manifest.json"), "utf8"));
  if (!isRecord(manifest) || !isRecord(manifest.files)) throw new Error("Build manifest is invalid.");
  const { server, origin } = await createHarnessServer();
  let browser: Browser | undefined;
  let files = 0;
  let blocks = 0;
  let expressions = 0;
  const warnings: string[] = [];
  try {
    browser = await chromium.launch({ headless: true, args: ["--use-gl=swiftshader", "--enable-webgl"] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.addScriptTag({ url: `${DESMOS_API}?apiKey=${encodeURIComponent(key)}` });
    for (const relativePath of Object.keys(manifest.files).sort()) {
      if (!relativePath.endsWith(".html")) continue;
      const filePath = path.resolve(outputDirectory, relativePath);
      if (!filePath.startsWith(`${path.resolve(outputDirectory)}${path.sep}`)) {
        throw new Error(`Manifest path escapes the build directory: ${relativePath}`);
      }
      const html = await readFile(filePath, "utf8");
      const requests = await extractBlocks(page, html, relativePath);
      if (!requests.length) continue;
      files += 1;
      for (const block of requests) {
        blocks += 1;
        expressions += block.request.expressions.length;
        let rendered: BrowserResult;
        try {
          rendered = await renderRequest(page, block);
        } catch (error) {
          throw new Error(`${relativePath}: Desmos block ${block.id} (${block.kind}) failed: ${safeError(error, key)}`);
        }
        const result = auditDesmosState(block.request, rendered.state, rendered.analysis);
        if (result.counts.errors) {
          const failures = result.findings
            .filter((finding) => finding.severity === "error")
            .map((finding) => `${finding.id ? `${finding.id}: ` : ""}${finding.message}`)
            .join(" | ");
          throw new Error(`${relativePath}: Desmos block ${block.id} (${block.kind}) failed: ${failures}`);
        }
        for (const finding of result.findings) {
          if (finding.severity === "warning") {
            warnings.push(
              `${relativePath}: Desmos block ${block.id}: `
              + `${finding.id ? `${finding.id}: ` : ""}${finding.message}`,
            );
          }
        }
      }
    }
  } catch (error) {
    throw new Error(safeError(error, key));
  } finally {
    await browser?.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  return { files, blocks, expressions, warnings };
}

async function main(): Promise<void> {
  const outputArgument = process.argv.find((argument) => argument.startsWith("--out-dir="));
  const outputDirectory = path.resolve(
    outputArgument?.slice("--out-dir=".length) ?? path.join(os.tmpdir(), "notebooks-mdx-v2"),
  );
  const result = await auditDesmosDirectory(outputDirectory, process.cwd());
  for (const warning of result.warnings) console.warn(`Warning: ${warning}`);
  console.info(
    `Desmos audit passed: ${result.blocks} block(s), ${result.expressions} expression(s) checked in `
    + `${result.files} file(s); ${result.warnings.length} warning(s).`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
