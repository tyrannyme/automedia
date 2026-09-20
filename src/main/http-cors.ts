import type http from "node:http";
import { sendJson } from "./http-files.ts";

/**
 * The renderer runs on a loopback origin in development while the desktop
 * server binds to 127.0.0.1. EventSource does a CORS check even though it is
 * a simple GET, so allow only HTTP loopback origins (plus packaged Electron's
 * opaque `null` origin) and echo the origin that was actually supplied. There
 * are intentionally no credentials or wildcard CORS headers here.
 */
export function isAllowedLoopbackOrigin(origin: string): boolean {
  // Packaged Electron loads the renderer from file://, which reports the
  // opaque origin `null`. This exact value is allowed for the local desktop
  // client; arbitrary web origins remain rejected.
  if (origin === "null") return true;
  try {
    const parsed = new URL(origin);
    return (
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.pathname === "/" &&
      parsed.search === "" &&
      parsed.hash === ""
    );
  } catch {
    return false;
  }
}

export function applyEventsCors(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): boolean {
  const origin = request.headers.origin;
  if (origin === undefined) return true;

  // The response varies based on the request origin. Keep this on both
  // allowed and rejected responses so an intermediary cannot reuse one
  // origin's decision for another.
  response.setHeader("vary", "Origin");
  if (!isAllowedLoopbackOrigin(origin)) {
    sendJson(response, 403, { code: "forbidden", message: "Origin not allowed" });
    return false;
  }
  response.setHeader("access-control-allow-origin", origin);
  return true;
}
