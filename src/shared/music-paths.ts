export function musicDirectory(asset: string): string {
  return `music/${asset}`;
}

export function musicPatternPath(asset: string): string {
  return `music/${asset}/pattern.js`;
}

export function normalizeCompositionPath(relativePath: string): string {
  return relativePath.replaceAll("\\", "/");
}

export function isMusicPatternPath(relativePath: string): boolean {
  return /^music\/[^/]+\/pattern\.js$/.test(normalizeCompositionPath(relativePath));
}

export function isManagedMusicRuntimePath(relativePath: string): boolean {
  return /^music\/[^/]+\/(index\.html|style\.css|script\.js)$/.test(
    normalizeCompositionPath(relativePath),
  );
}

export function musicRuntimeKind(relativePath: string): "html" | "css" | "js" | null {
  const match = /^music\/[^/]+\/(index\.html|style\.css|script\.js)$/.exec(
    normalizeCompositionPath(relativePath),
  );
  if (match?.[1] === "index.html") return "html";
  if (match?.[1] === "style.css") return "css";
  if (match?.[1] === "script.js") return "js";
  return null;
}

export function musicAssetFromPath(relativePath: string): string | null {
  const match = /^music\/([^/]+)\//.exec(normalizeCompositionPath(relativePath));
  return match?.[1] ?? null;
}

export function documentFrameSrc(track: { kind: string; asset: string }): string {
  return track.kind === "music"
    ? `music/${track.asset}/index.html`
    : `blocks/${track.asset}/index.html`;
}

export function firstMusicAsset(
  tracks: readonly { id: string; kind: string; asset: string }[],
  selectedTrackId: string | null,
): string | null {
  const selected = tracks.find((track) => track.id === selectedTrackId && track.kind === "music");
  if (selected) return selected.asset;
  return tracks.find((track) => track.kind === "music")?.asset ?? null;
}
