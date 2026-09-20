import { existsSync } from "node:fs";
import { readFile, rm, mkdtemp } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { type ExportJob } from "./export.ts";
import { type LoopbackServer } from "./http.ts";
import { startLoopbackStack } from "./loopback-stack.ts";
import type { Control, MediaTrack } from "@shared/schemas.ts";

type JsonRpcResponse = {
  result?: {
    protocolVersion?: string;
    structuredContent?: unknown;
    content?: Array<{ type: string; text?: string }>;
  };
  error?: { code: number; message: string; data?: unknown };
};
type McpCallParams = {
  name: string;
  arguments: {
    compositionId?: string;
    name?: string;
    path?: string;
    jobId?: string;
    format?: string;
    example?: string;
    encoding?: "utf8" | "base64";
    content?: string;
    expectedEtag?: string;
    track?: MediaTrack;
    control?: Control;
  };
};

let requestId = 0;

function hasBinary(binary: string): boolean {
  return spawnSync(binary, ["-version"], { stdio: "ignore" }).status === 0;
}

const missing = [
  ...(hasBinary("ffmpeg") ? [] : ["ffmpeg"]),
  ...(hasBinary("ffprobe") ? [] : ["ffprobe"]),
  ...(existsSync(chromium.executablePath()) ? [] : ["Playwright Chromium"]),
];
const prerequisiteMessage = missing.length > 0 ? `missing ${missing.join(", ")}` : "";

function parseJsonRpcResponse(raw: string, contentType: string | null): JsonRpcResponse {
  if (contentType?.includes("text/event-stream")) {
    const messages = raw
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        // SAFETY: The MCP transport emits one JSON-RPC object per `data:` event.
        return JSON.parse(line) as JsonRpcResponse;
      });
    const message = messages.at(-1);
    if (!message) {
      throw new Error("MCP response did not contain a JSON-RPC message");
    }
    return message;
  }
  if (raw.trim() === "") {
    return {};
  }
  // SAFETY: The MCP transport's JSON response body is a JSON-RPC object.
  return JSON.parse(raw) as JsonRpcResponse;
}

async function mcpRequest<T>(
  server: LoopbackServer,
  method: string,
  params: McpCallParams,
  protocolVersion?: string,
): Promise<T> {
  const id = ++requestId;
  const headers = new Headers({
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
  });
  if (protocolVersion) {
    headers.set("MCP-Protocol-Version", protocolVersion);
  }
  const response = await fetch(`${server.url}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const message = parseJsonRpcResponse(await response.text(), response.headers.get("content-type"));
  if (!response.ok || message.error) {
    throw new Error(message.error?.message ?? `MCP request failed with HTTP ${response.status}`);
  }
  const result = message.result;
  if (!result) {
    throw new Error(`MCP request ${method} returned no result`);
  }
  if (result.structuredContent !== undefined) {
    // SAFETY: Each registered tool returns the requested domain value in structuredContent.
    return result.structuredContent as T;
  }
  const text = result.content?.find((block) => block.type === "text")?.text;
  if (text === undefined) {
    throw new Error(`MCP request ${method} returned no structured content`);
  }
  // SAFETY: Each registered tool's text fallback is JSON.stringify of the requested domain value.
  return JSON.parse(text) as T;
}

async function initializeMcp(server: LoopbackServer): Promise<string> {
  const id = ++requestId;
  const response = await fetch(`${server.url}/mcp`, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "automedia-agent-loop-test", version: "0.1.0" },
      },
    }),
  });
  const message = parseJsonRpcResponse(await response.text(), response.headers.get("content-type"));
  if (!response.ok || message.error || !message.result) {
    throw new Error(message.error?.message ?? `MCP initialize failed with HTTP ${response.status}`);
  }
  if (!message.result.protocolVersion) {
    throw new Error("MCP initialize response did not include a protocol version");
  }
  return message.result.protocolVersion;
}

async function notifyInitialized(server: LoopbackServer, protocolVersion: string): Promise<void> {
  const response = await fetch(`${server.url}/mcp`, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "MCP-Protocol-Version": protocolVersion,
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
  if (!response.ok) {
    throw new Error(`MCP initialized notification failed with HTTP ${response.status}`);
  }
  await response.arrayBuffer();
}

async function pollExport(server: LoopbackServer, jobId: string): Promise<ExportJob> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const job = await mcpRequest<ExportJob>(server, "tools/call", {
      name: "get_export",
      arguments: { jobId },
    });
    if (job.phase === "completed" || job.phase === "failed" || job.phase === "canceled") {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`export ${jobId} did not finish within the polling bound`);
}

const roots: string[] = [];
const servers: LoopbackServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("agent loop integration prerequisites", () => {
  it.skipIf(missing.length > 0)(
    prerequisiteMessage || "ffmpeg, ffprobe, and Playwright Chromium are available",
    () => expect(missing).toEqual([]),
  );
});

describe("agent loop integration", () => {
  it.skipIf(missing.length > 0)(
    prerequisiteMessage || "creates, authors, validates, and exports through MCP",
    async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "automedia-agent-loop-"));
      roots.push(root);
      const stack = await startLoopbackStack(root);
      const server = stack.server;
      servers.push(server);
      const protocolVersion = await initializeMcp(server);
      await notifyInitialized(server, protocolVersion);

      const proof = await mcpRequest<{ id: string; name: string }>(
        server,
        "tools/call",
        {
          name: "create_composition",
          arguments: { example: "proof", name: "Review proof" },
        },
        protocolVersion,
      );
      expect(proof.id).toMatch(/^c[a-z0-9]+$/);
      expect(proof.name).toBe("Review proof");

      const first = await mcpRequest<{ id: string }>(
        server,
        "tools/call",
        {
          name: "create_composition",
          arguments: { example: "css-clock" },
        },
        protocolVersion,
      );
      const files = await mcpRequest<{ files: string[] }>(
        server,
        "tools/call",
        {
          name: "list_files",
          arguments: { compositionId: first.id },
        },
        protocolVersion,
      );
      const htmlPath = files.files.find(
        (file) => file.startsWith("blocks/") && file.endsWith("/index.html"),
      );
      expect(htmlPath).toBeDefined();
      const firstFile = await mcpRequest<{ content: string }>(
        server,
        "tools/call",
        {
          name: "read_file",
          arguments: { compositionId: first.id, path: htmlPath ?? "" },
        },
        protocolVersion,
      );
      expect(firstFile.content).toContain('id="box"');

      const firstValidation = await mcpRequest<{ ok: boolean }>(
        server,
        "tools/call",
        {
          name: "validate",
          arguments: { compositionId: first.id },
        },
        protocolVersion,
      );
      expect(firstValidation.ok).toBe(true);

      const firstStarted = await mcpRequest<ExportJob>(
        server,
        "tools/call",
        {
          name: "start_export",
          arguments: { compositionId: first.id, format: "png" },
        },
        protocolVersion,
      );
      const firstCompleted = await pollExport(server, firstStarted.id);
      expect(firstCompleted.phase).toBe("completed");
      expect(firstCompleted.contentUrl).toContain(`${server.url}/compositions/`);
      const firstBytes = await fetch(firstCompleted.contentUrl!);
      expect(firstBytes.status).toBe(200);
      expect(firstBytes.headers.get("content-type")).toContain("image/png");
      await firstBytes.arrayBuffer();

      const second = await mcpRequest<{ id: string }>(
        server,
        "tools/call",
        {
          name: "create_composition",
          arguments: {},
        },
        protocolVersion,
      );
      const fixture = await readFile(path.resolve("fixtures/beat-ident.ogg"));
      await mcpRequest(
        server,
        "tools/call",
        {
          name: "write_file",
          arguments: {
            compositionId: second.id,
            path: "assets/beat-ident.ogg",
            encoding: "base64",
            content: fixture.toString("base64"),
            expectedEtag: "",
          },
        },
        protocolVersion,
      );
      await mcpRequest(
        server,
        "tools/call",
        {
          name: "put_track",
          arguments: {
            compositionId: second.id,
            track: {
              id: "track-audio",
              kind: "audio",
              asset: "beat-ident.ogg",
              start: 0,
              duration: 3,
              trimStart: 0,
              rate: 1,
              volume: 1,
              mute: false,
              lane: 0,
            },
          },
        },
        protocolVersion,
      );
      await mcpRequest(
        server,
        "tools/call",
        {
          name: "put_control",
          arguments: {
            compositionId: second.id,
            control: {
              id: "gain",
              type: "range",
              label: "Gain",
              value: 1,
              min: 0,
              max: 2,
              step: 0.1,
            },
          },
        },
        protocolVersion,
      );

      const secondStarted = await mcpRequest<ExportJob>(
        server,
        "tools/call",
        {
          name: "start_export",
          arguments: { compositionId: second.id, format: "png" },
        },
        protocolVersion,
      );
      const secondCompleted = await pollExport(server, secondStarted.id);
      expect(secondCompleted.phase).toBe("completed");
      expect(secondCompleted.contentUrl).toContain(`${server.url}/compositions/`);
      const secondBytes = await fetch(secondCompleted.contentUrl!);
      expect(secondBytes.status).toBe(200);
      expect(secondBytes.headers.get("content-type")).toContain("image/png");
      await secondBytes.arrayBuffer();

      const activity = await mcpRequest<{ entries: Array<{ operation: string }> }>(
        server,
        "tools/call",
        { name: "get_activity", arguments: { compositionId: second.id } },
        protocolVersion,
      );
      expect(activity.entries.map((entry) => entry.operation)).toEqual(
        expect.arrayContaining(["write_file", "start_export"]),
      );
    },
    60_000,
  );
});
