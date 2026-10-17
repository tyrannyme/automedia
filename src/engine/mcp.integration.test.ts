import { existsSync } from "node:fs";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { startEngine, type RunningEngine } from "./engine.ts";
import type { ExportJob } from "./export.ts";
import type { ValidationReport } from "./validate.ts";

const missing = existsSync(chromium.executablePath()) ? [] : ["Playwright Chromium"];

type ToolArgs = Record<string, string | number | boolean>;
type ToolError = { code: string; message: string };
type AgentComposition = { compositionId: string; name: string };
type AgentJob = Omit<ExportJob, "id"> & { jobId: string };
type WorkspaceStatus = {
  exports: AgentJob[];
  compositions: Array<{ compositionId: string; name: string }>;
};

let engine: RunningEngine;
let root: string;
let scratch: string;
let requestId = 0;

/** Calls one MCP tool over the engine's HTTP endpoint, like a connected agent. */
async function call<T>(name: string, args: ToolArgs = {}): Promise<{ isError: boolean; data: T }> {
  const response = await fetch(`${engine.server.url}/mcp`, {
    method: "POST",
    headers: { accept: "application/json, text/event-stream", "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ++requestId,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const raw = await response.text();
  const line = raw
    .split("\n")
    .filter((entry) => entry.startsWith("data:"))
    .at(-1);
  const message = JSON.parse(line ? line.slice("data:".length) : raw);
  const text = message.result?.content?.[0]?.text;
  if (text === undefined) throw new Error(`${name} returned no result: ${raw}`);
  // SAFETY: a tool's text is JSON.stringify of its result (or of its error
  // object), including the arrays some tools return; callers name that type.
  return { isError: message.result.isError === true, data: JSON.parse(text) as T };
}

async function ok<T>(name: string, args: ToolArgs = {}): Promise<T> {
  const result = await call<T>(name, args);
  expect(result.isError, JSON.stringify(result.data)).toBe(false);
  return result.data;
}

/** Adds a block at `start` and replaces the given files in its folder. */
async function writeBlock(compositionId: string, start: number, files: Record<string, string>) {
  const track = await ok<{ asset: string }>("create_block", { compositionId, start });
  for (const [name, content] of Object.entries(files)) {
    const file = `blocks/${track.asset}/${name}`;
    const current = await call<{ etag: string }>("read_file", { compositionId, path: file });
    await ok("write_file", {
      compositionId,
      path: file,
      encoding: "utf8",
      content,
      expectedEtag: current.isError ? "" : current.data.etag,
    });
  }
  return track;
}

async function finished(jobId: string) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const job = await ok<AgentJob>("get_export", { jobId });
    if (job.phase === "completed" || job.phase === "failed" || job.phase === "canceled") {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`export ${jobId} did not finish`);
}

const html = (body: string) =>
  `<!doctype html><html><head><link rel="stylesheet" href="style.css" /></head><body>${body}<script type="module" src="script.js"></script></body></html>`;

describe.skipIf(missing.length > 0)("MCP tools agents use for game UI art", () => {
  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "automedia-mcp-"));
    scratch = await mkdtemp(path.join(os.tmpdir(), "automedia-mcp-files-"));
    engine = await startEngine(root, { port: 0 });
  });

  afterAll(async () => {
    await engine?.close();
    await rm(root, { recursive: true, force: true });
    await rm(scratch, { recursive: true, force: true });
  });

  it("imports an image and a font from a filesystem path into assets/", async () => {
    const { compositionId } = await ok<AgentComposition>("create_composition", {});
    const font = path.join(scratch, "Title.woff2");
    await copyFile("src/renderer/fonts/poppins-latin-400-normal.woff2", font);
    const image = path.join(scratch, "frame.svg");
    await writeFile(image, '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>');

    expect(await ok("import_asset", { compositionId, path: font })).toEqual({
      asset: "title.woff2",
    });
    expect(await ok("import_asset", { compositionId, path: image })).toEqual({
      asset: "frame.svg",
    });
    const { files } = await ok<{ files: string[] }>("list_files", { compositionId });
    expect(files).toEqual(expect.arrayContaining(["assets/title.woff2", "assets/frame.svg"]));
    const copied = await readFile(
      path.join(engine.store.compositionDir(compositionId), "assets", "title.woff2"),
    );
    expect(copied.equals(await readFile(font))).toBe(true);

    const text = path.join(scratch, "notes.txt");
    await writeFile(text, "not an asset");
    const rejected = await call<ToolError>("import_asset", { compositionId, path: text });
    expect(rejected.isError).toBe(true);
    expect(rejected.data.code).toBe("invalid_asset");
  });

  it("names the field when a WebP export gets a PNG-only option", async () => {
    const { compositionId } = await ok<AgentComposition>("create_composition", {
      example: "alpha-still",
    });
    const result = await call<ToolError>("start_export", {
      compositionId,
      format: "webp",
      timeSeconds: 0,
    });
    expect(result.isError).toBe(true);
    expect(result.data.code).toBe("invalid_input");
    expect(result.data.message).toContain("timeSeconds");
    expect(result.data.message).not.toContain("Expected Object but received Object");
  });

  it("saves a finished WebP export to the requested path", async () => {
    const { compositionId } = await ok<AgentComposition>("create_composition", {
      example: "alpha-still",
    });
    const destination = path.join(scratch, "out", "panel.webp");
    const started = await ok<AgentJob>("start_export", {
      compositionId,
      format: "webp",
      quality: 50,
      path: destination,
    });
    expect(started.jobId).toEqual(expect.any(String));
    expect(started.path).toBe(destination);
    const job = await finished(started.jobId);
    expect(job.phase, JSON.stringify(job.error)).toBe("completed");
    const bytes = await readFile(destination);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
    expect(bytes.equals(await readFile(job.outputPath ?? ""))).toBe(true);
  }, 120_000);

  it("reports late, renderer, and later-clip script errors from validate", async () => {
    const { compositionId } = await ok<AgentComposition>("create_composition", {});
    await writeBlock(compositionId, 0, {
      "script.js": `setTimeout(() => { throw new Error("late-throw"); }, 50);
Promise.reject(new Error("rejected-promise"));
window.automedia.registerRenderer(async () => { throw new Error("renderer-throw"); });`,
    });
    await writeBlock(compositionId, 1, {
      "script.js": `window.automedia.registerRenderer(() => { throw new Error("later-clip-throw"); });`,
    });

    const report = await ok<ValidationReport>("validate", { compositionId });
    expect(report.ok).toBe(false);
    const messages = report.issues.map((issue) => issue.message);
    for (const expected of ["late-throw", "rejected-promise", "renderer-throw", "later-clip"]) {
      expect(messages.filter((message) => message.includes(expected))).toHaveLength(1);
    }
    expect(messages).toContainEqual(expect.stringContaining("later-clip-throw"));
    // create_block places the second clip after the first, at 3s.
    expect(messages).toContainEqual(
      expect.stringMatching(/later-clip-throw \(seeking to [1-9][\d.]*s\)/),
    );
  }, 60_000);

  it("runs renderers only after the block's fonts load", async () => {
    const { compositionId } = await ok<AgentComposition>("create_composition", {});
    const font = path.join(scratch, "probe.woff2");
    await copyFile("src/renderer/fonts/nunito-latin-600-normal.woff2", font);
    await ok("import_asset", { compositionId, path: font });
    await writeBlock(compositionId, 0, {
      "index.html": html("<p>Measured title</p>"),
      "style.css": `@font-face { font-family: Probe; src: url(../../assets/probe.woff2); }
body { font-family: Probe; }`,
      "script.js": `window.automedia.registerRenderer(() => {
  if (!document.fonts.check("16px Probe")) throw new Error("font-not-loaded");
});`,
    });

    const report = await ok<ValidationReport>("validate", { compositionId });
    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
  }, 60_000);

  it("names compositions compositionId in results as in inputs", async () => {
    const created = await ok<AgentComposition>("create_composition", { name: "Inventory slot" });
    expect(created.compositionId).toEqual(expect.any(String));
    expect(created).not.toHaveProperty("id");
    const rows = await ok<AgentComposition[]>("list_compositions");
    expect(rows.find((row) => row.compositionId === created.compositionId)).toMatchObject({
      name: "Inventory slot",
    });
    expect(rows.every((row) => !("id" in row))).toBe(true);
    const fetched = await ok<AgentComposition>("get_composition", {
      compositionId: created.compositionId,
    });
    expect(fetched.compositionId).toBe(created.compositionId);
  });

  it("filters workspace_status to one composition", async () => {
    const first = await ok<AgentComposition>("create_composition", { name: "Health bar" });
    await ok<AgentComposition>("create_composition", { name: "Mana bar" });
    const all = await ok<WorkspaceStatus>("workspace_status");
    expect(all.compositions.length).toBeGreaterThan(1);
    const one = await ok<WorkspaceStatus>("workspace_status", {
      compositionId: first.compositionId,
    });
    expect(one.compositions).toEqual([
      expect.objectContaining({ compositionId: first.compositionId, name: "Health bar" }),
    ]);
    expect(one.exports.every((job) => job.compositionId === first.compositionId)).toBe(true);
  });
});
