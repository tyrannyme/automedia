import { createReadStream, statSync } from "node:fs";
import type http from "node:http";
import path from "node:path";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".wgsl": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".opus": "audio/opus",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
} as const;

export function contentTypeFor(extension: string): string {
  for (const [key, value] of Object.entries(contentTypes)) {
    if (key === extension) {
      return value;
    }
  }
  return "application/octet-stream";
}

export function sendJson(
  response: http.ServerResponse,
  status: number,
  body: { ok: true; cdp?: string } | { code: string; message: string },
): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

export async function sendFile(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  filePath: string,
  extraHeaders: Record<string, string> = {},
): Promise<void> {
  const info = statSync(filePath);
  const type = contentTypeFor(path.extname(filePath).toLowerCase());
  const range = request.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      response.writeHead(416);
      response.end();
      return;
    }
    const start = match[1] === "" ? 0 : Number(match[1]);
    const end = match[2] === "" ? info.size - 1 : Number(match[2]);
    if (start > end || end >= info.size) {
      response.writeHead(416);
      response.end();
      return;
    }
    response.writeHead(206, {
      ...extraHeaders,
      "content-type": type,
      "content-range": `bytes ${start}-${end}/${info.size}`,
      "accept-ranges": "bytes",
      "content-length": end - start + 1,
    });
    createReadStream(filePath, { start, end }).pipe(response);
    return;
  }
  response.writeHead(200, {
    ...extraHeaders,
    "content-type": type,
    "accept-ranges": "bytes",
    "content-length": info.size,
  });
  createReadStream(filePath).pipe(response);
}
