import http from "node:http";
import {
  localhostHostValidation,
  localhostOriginValidation,
  NodeStreamableHTTPServerTransport,
} from "@modelcontextprotocol/node";
import type { McpServer } from "@modelcontextprotocol/server";
import { AppError } from "@shared/errors.ts";
import { isCompositionId } from "@shared/ids.ts";
import { loopbackHost } from "@shared/limits.ts";
import { cdpOrigin } from "./cdp.ts";
import type { EventBus } from "./events.ts";
import { exportFileExists, type ExportQueue } from "./export.ts";
import { pathExists } from "./fs.ts";
import { serveCompositionContent, serveRuntimeAsset } from "./http-content.ts";
import { applyEventsCors } from "./http-cors.ts";
import { sendFile, sendJson } from "./http-files.ts";
import { resolveLoopbackPort } from "./loopback.ts";
import type { CompositionStore } from "./store.ts";
import { thumbnailPath } from "./thumbnails.ts";

function bindPort(): number {
  return resolveLoopbackPort();
}

export type LoopbackServer = {
  url: string;
  port: number;
  close: () => Promise<void>;
};

export async function startLoopbackServer(options: {
  store: CompositionStore;
  mcp: McpServer;
  events: EventBus;
  exports: ExportQueue;
}): Promise<LoopbackServer> {
  const { store, mcp, events } = options;
  const port = bindPort();
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();
  const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await mcp.connect(transport);

  const server = http.createServer((request, response) => {
    void handleRequest(request, response);
  });

  async function handleRequest(
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ): Promise<void> {
    try {
      const url = new URL(request.url ?? "/", `http://${loopbackHost}:${port}`);
      if (url.pathname === "/mcp") {
        if (!validateHost(request, response) || !validateOrigin(request, response)) {
          return;
        }
        await transport.handleRequest(request, response);
        return;
      }
      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, { ok: true, cdp: cdpOrigin() });
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
    server.listen(port, loopbackHost, () => {
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
          }),
      });
    });
  });
}
