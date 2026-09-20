import { isBlockKind } from "@shared/media.ts";

export type CodeFile = "html" | "css" | "js";

export type BlockPaths = {
  html: string;
  css: string;
  js: string;
};

export function blockDirectory(asset: string): string {
  return `blocks/${asset}`;
}

export function blockPaths(dir: string): BlockPaths {
  return { html: `${dir}/index.html`, css: `${dir}/style.css`, js: `${dir}/script.js` };
}

export function codeFileFromPath(path: string): CodeFile | null {
  if (!path.startsWith("blocks/")) return null;
  if (path.endsWith("/index.html")) return "html";
  if (path.endsWith("/style.css")) return "css";
  if (path.endsWith("/script.js")) return "js";
  return null;
}

export function firstBlockDirectory(
  tracks: readonly { id: string; kind: string; asset: string }[],
  selectedTrackId: string | null,
): string | null {
  const selected = tracks.find((track) => track.id === selectedTrackId && isBlockKind(track.kind));
  if (selected) return blockDirectory(selected.asset);
  const first = tracks.find((track) => isBlockKind(track.kind));
  return first ? blockDirectory(first.asset) : null;
}
