import type http from "node:http";
import path from "node:path";
import { AppError } from "@shared/errors.ts";
import { isCompositorLayerKind, isImageKind, isVideoKind } from "@shared/media.ts";
import { documentFrameSrc, musicAssetFromPath, musicRuntimeKind } from "@shared/music-paths.ts";
import type { Composition, MediaDocument, MediaTrack } from "@shared/schemas.ts";
import { pathExists } from "./fs.ts";
import { sendFile } from "./http-files.ts";
import { musicRuntimeFile } from "./music-template.ts";
import { injectRuntime, runtimeAssetRoot } from "./runtime.ts";
import type { CompositionStore } from "./store.ts";

export function compositorHtml(composition: Composition, media: MediaDocument): string {
  const background =
    composition.background === "transparent" ? "transparent" : composition.background;
  const layers = media.tracks
    .filter((track) => isCompositorLayerKind(track.kind))
    .toSorted((left, right) => left.lane - right.lane || left.start - right.start)
    .map((track) => compositorLayer(composition, track))
    .join("");
  return `<!doctype html>
<html lang="en" data-automedia-compositor="true">
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; overflow: hidden; background: ${background}; width: ${composition.width}px; height: ${composition.height}px; }
      #stack { position: relative; width: ${composition.width}px; height: ${composition.height}px; }
      .block-frame, .music-frame, .image-layer, .video-layer { position: absolute; inset: 0; border: 0; display: none; }
      .image-layer, .video-layer { width: 100%; height: 100%; object-fit: contain; }
      .block-frame[data-active="true"], .image-layer[data-active="true"], .video-layer[data-active="true"] { display: block; }
      .music-frame[data-active="true"] { display: block; opacity: 0; pointer-events: none; }
    </style>
  </head>
  <body>
    <div id="stack">${layers}</div>
  </body>
</html>
`;
}

function compositorLayer(composition: Composition, track: MediaTrack): string {
  if (isImageKind(track.kind)) {
    const src = `assets/${encodeURIComponent(track.asset)}`;
    return `<img class="image-layer" data-track="${track.id}" data-asset="${encodeURIComponent(track.asset)}" src="${src}" width="${composition.width}" height="${composition.height}" alt="" />`;
  }
  if (isVideoKind(track.kind)) {
    const src = `assets/${encodeURIComponent(track.asset)}`;
    const muted = track.mute ? " muted" : "";
    return `<video class="video-layer" data-track="${track.id}" data-automedia-media-id="${track.id}" data-asset="${encodeURIComponent(track.asset)}" src="${src}" width="${composition.width}" height="${composition.height}" playsinline${muted}></video>`;
  }
  if (track.kind === "music") {
    return `<iframe class="music-frame" data-track="${track.id}" data-music="${track.asset}" src="${documentFrameSrc(track)}" width="${composition.width}" height="${composition.height}" sandbox="allow-scripts allow-same-origin"></iframe>`;
  }
  return `<iframe class="block-frame" data-track="${track.id}" data-block="${track.asset}" src="${documentFrameSrc(track)}" width="${composition.width}" height="${composition.height}" sandbox="allow-scripts allow-same-origin"></iframe>`;
}

export async function serveCompositionContent(
  store: CompositionStore,
  compositionId: string,
  relativePath: string,
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  const composition = await store.get(compositionId);
  const decoded = decodeURIComponent(relativePath);
  const [media, controls] = await Promise.all([
    store.getMedia(compositionId),
    store.getControls(compositionId),
  ]);
  if (decoded === "" || decoded === "index.html") {
    const injected = injectRuntime(compositorHtml(composition, media), composition, {
      tracks: media.tracks,
      controls: controls.controls,
    });
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(injected);
    return;
  }
  const generated = generatedMusicRuntime(decoded, media);
  if (generated) {
    if (generated.contentType.startsWith("text/html")) {
      const injected = injectRuntime(generated.content, composition, {
        tracks: media.tracks,
        controls: controls.controls,
      });
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(injected);
      return;
    }
    response.writeHead(200, { "content-type": generated.contentType });
    response.end(generated.content);
    return;
  }
  const file = await store.readFile(compositionId, decoded);
  const absolute = path.join(store.compositionDir(compositionId), decoded);
  if (decoded.endsWith(".html")) {
    const html =
      file.encoding === "utf8"
        ? file.content
        : Buffer.from(file.content, "base64").toString("utf8");
    const injected = injectRuntime(html, composition, {
      tracks: media.tracks,
      controls: controls.controls,
    });
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(injected);
    return;
  }
  await sendFile(request, response, absolute, {
    "cross-origin-resource-policy": "cross-origin",
  });
}

export async function serveRuntimeAsset(
  relativePath: string,
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  const decoded = decodeURIComponent(relativePath);
  const parts = decoded.split("/");
  const scoped = decoded.startsWith("@") && parts.length >= 2;
  const library = scoped ? `${parts[0]}/${parts[1]}` : (parts[0] ?? "");
  const rest = parts.slice(scoped ? 2 : 1).join("/");
  const root = runtimeAssetRoot(library);
  const absolute = path.resolve(root, rest);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    throw new AppError("invalid_path", "runtime path escapes the package");
  }
  if (!(await pathExists(absolute))) {
    throw new AppError("not_found", decoded);
  }
  await sendFile(request, response, absolute);
}

function generatedMusicRuntime(
  relativePath: string,
  media: MediaDocument,
): { contentType: string; content: string } | null {
  const kind = musicRuntimeKind(relativePath);
  const asset = musicAssetFromPath(relativePath);
  if (!kind || !asset) return null;
  const track = media.tracks.find((item) => item.kind === "music" && item.asset === asset);
  if (!track) return null;
  return musicRuntimeFile(kind, track.name?.trim() || "Music");
}
