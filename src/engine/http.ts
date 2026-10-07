import { statSync } from "node:fs";
import http from "node:http";
import * as v from "valibot";
import type { AddressInfo } from "node:net";
import {
  localhostHostValidation,
  localhostOriginValidation,
  NodeStreamableHTTPServerTransport,
} from "@modelcontextprotocol/node";
import type { McpServer } from "@modelcontextprotocol/server";
import { AppError, toErrorObject } from "@shared/errors.ts";
import { isCompositionId } from "@shared/ids.ts";
import { loopbackHost } from "@shared/limits.ts";
import type { EventBus } from "./events.ts";
import { exportFileExists, type ExportQueue } from "./export.ts";
import { pathExists } from "./fs.ts";
import { serveCompositionContent, serveRuntimeAsset } from "./http-content.ts";
import { applyEventsCors } from "./http-cors.ts";
import { sendFile, sendJson } from "./http-files.ts";
import { resolveLoopbackPort } from "./loopback.ts";
import { isOperationName, runOperation, type Caller, type Operations } from "./operations.ts";
import type { CompositionStore } from "./store.ts";
import { thumbnailPath } from "./thumbnails.ts";
import { ownerHeader, type EngineHealth } from "./protocol.ts";
import { engineVersion } from "./version.ts";

/** Lets a client spot an engine still running an older build of its own install. */
const engineBuild = { bundle: __filename, builtAt: statSync(__filename).mtimeMs };

/** Writes to an asset path can carry whole media files as base64. */
const maxApiBodyBytes = 512 * 1024 * 1024;

function callerOf(request: { headers: http.IncomingHttpHeaders }): Caller {
  const header = request.headers[ownerHeader];
  const owner = Array.isArray(header) ? header[0] : header;
  return { owner: owner || "http" };
}

export type LoopbackServer = {
  url: string;
  port: number;
  close: () => Promise<void>;
};

export async function startLoopbackServer(options: {
  store: CompositionStore;
  /**
   * Builds the server for one /mcp request. Stateless MCP over HTTP needs a
   * fresh server and transport per request: one shared pair answers only one
   * client at a time, and the others' requests hang.
   */
  mcp?: (() => McpServer) | undefined;
  /** Served at /api/<operation> for the studio and stdio agents. */
  operations?: Operations | undefined;
  events: EventBus;
  exports: ExportQueue;
  /** 0 picks a free port. */
  port?: number | undefined;
  /** Reports whether work is running, for /health. */
  busy?: (() => boolean) | undefined;
  /** Called on every request, so an idle engine can tell when to exit. */
  onRequest?: (() => void) | undefined;
}): Promise<LoopbackServer> {
  const { store, mcp, events, operations } = options;
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();

  const server = http.createServer((request, response) => {
    void handleRequest(request, response);
  });

  async function handleRequest(
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ): Promise<void> {
    options.onRequest?.();
    try {
      const url = new URL(request.url ?? "/", `http://${loopbackHost}`);
      if (operations && url.pathname.startsWith("/api/")) {
        if (!validateHost(request, response) || !validateOrigin(request, response)) {
          return;
        }
        await handleApi(operations, url.pathname.slice("/api/".length), request, response);
        return;
      }
      if (mcp && url.pathname === "/mcp") {
        if (!validateHost(request, response) || !validateOrigin(request, response)) {
          return;
        }
        await serveMcpRequest(mcp(), request, response);
        return;
      }
      if (request.method === "GET" && url.pathname === "/health") {
        const health: EngineHealth = {
          ok: true,
          name: "automedia",
          version: engineVersion,
          pid: process.pid,
          library: store.root,
          busy: options.busy?.() ?? false,
          ...engineBuild,
        };
        sendJson(response, 200, health);
        return;
      }
      if (request.method === "GET" && url.pathname === "/events") {
        if (!applyEventsCors(request, response)) return;
        response.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        response.write(":\n\n");
        events.add(response);
        return;
      }
      if (request.method === "GET" && url.pathname.startsWith("/runtime/assets/")) {
        await serveRuntimeAsset(url.pathname.slice("/runtime/assets/".length), request, response);
        return;
      }
      const exportMatch = /^\/compositions\/([^/]+)\/exports\/([^/]+)$/.exec(url.pathname);
      if (request.method === "GET" && exportMatch) {
        const filePath = await exportFileExists(store, exportMatch[1] ?? "", exportMatch[2] ?? "");
        await sendFile(request, response, filePath);
        return;
      }
      const thumbnailMatch = /^\/compositions\/([^/]+)\/thumbnail\.png$/.exec(url.pathname);
      if (request.method === "GET" && thumbnailMatch) {
        const compositionId = thumbnailMatch[1] ?? "";
        // Validate the opaque path segment before asking the store to construct
        // any filesystem path from it. This route must never become a path
        // traversal primitive, even if it is called outside the renderer.
        if (!isCompositionId(compositionId)) {
          sendJson(response, 404, { code: "not_found", message: "Not found" });
          return;
        }
        await store.get(compositionId);
        const filePath = thumbnailPath(store, compositionId);
        if (!(await pathExists(filePath))) {
          sendJson(response, 404, { code: "not_found", message: "Thumbnail not found" });
          return;
        }
        await sendFile(request, response, filePath, {
          "cache-control": "no-cache, no-store, must-revalidate",
          "content-security-policy": "default-src 'none'",
          // The renderer may be a Vite origin while the asset is loopback.
          // `same-origin` would prevent the project sidebar from loading it.
          "cross-origin-resource-policy": "cross-origin",
          "x-content-type-options": "nosniff",
        });
        return;
      }
      const contentMatch = /^\/compositions\/([^/]+)\/content\/(.*)$/.exec(url.pathname);
      if (request.method === "GET" && contentMatch) {
        await serveCompositionContent(
          store,
          contentMatch[1] ?? "",
          contentMatch[2] ?? "",
          request,
          response,
        );
        return;
      }
      sendJson(response, 404, { code: "not_found", message: "Not found" });
    } catch (error) {
      if (response.headersSent) {
        response.end();
        return;
      }
      if (error instanceof AppError) {
        sendJson(response, error.code === "not_found" ? 404 : 400, {
          code: error.code,
          message: error.message,
        });
        return;
      }
      sendJson(response, 500, { code: "internal", message: "Unexpected error" });
    }
  }

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? resolveLoopbackPort(), loopbackHost, () => {
      // SAFETY: a TCP listener reports AddressInfo; the string form is for pipes.
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://${loopbackHost}:${port}`,
        port,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
            // Open event streams would hold close() forever while a window
            // is still up, as when an update quits the app.
            server.closeAllConnections();
          }),
      });
    });
  });
}

async function handleApi(
  operations: Operations,
  name: string,
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  if (request.method !== "POST") {
    sendJson(response, 405, { ok: false, error: { code: "method_not_allowed", message: "POST" } });
    return;
  }
  if (!isOperationName(operations, name)) {
    sendJson(response, 404, {
      ok: false,
      error: { code: "not_found", message: `unknown operation ${name}` },
    });
    return;
  }
  try {
    const body = await readBody(request);
    const input = body.length > 0 ? JSON.parse(body) : undefined;
    const data = await runOperation(operations, name, input, callerOf(request));
    sendJson(response, 200, { ok: true, data: data ?? null });
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error("Unexpected error");
    const object = toErrorObject(error);
    const status =
      object.code === "not_found"
        ? 404
        : error instanceof AppError || isParseError(error)
          ? 400
          : 500;
    sendJson(response, status, { ok: false, error: object });
  }
}

function isParseError(error: Error): boolean {
  return error instanceof SyntaxError || error instanceof v.ValiError;
}

async function readBody(request: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    // SAFETY: an IncomingMessage without setEncoding yields Buffers.
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > maxApiBodyBytes) throw new AppError("too_large", "request body is too large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function serveMcpRequest(
  server: McpServer,
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  response.once("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(request, response);
}
