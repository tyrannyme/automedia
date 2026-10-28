export function compositionThumbnailSrc(
  origin: string,
  compositionId: string,
  revision: number,
): string {
  const base = `${origin.replace(/\/$/, "")}/compositions/${encodeURIComponent(compositionId)}/thumbnail.png`;
  return `${base}?rev=${revision}`;
}

/** One filmstrip frame: the composition at a time, rendered `height` pixels tall. */
export function compositionFrameSrc(
  origin: string,
  compositionId: string,
  revision: number,
  timeSeconds: number,
  height: number,
): string {
  const time = Number(Math.max(0, timeSeconds).toFixed(4));
  return `${compositionThumbnailSrc(origin, compositionId, revision)}&t=${time}&h=${Math.round(height)}`;
}

export type FilmTile = { time: number; left: number; width: number };

/** More than this many frames for one clip is a stripe, not a filmstrip. */
export const FILMSTRIP_MAX_TILES = 48;

/**
 * The frames a clip shows at the current zoom, only where the lanes are
 * visible. Tiles sit on a power-of-two grid of absolute time, so a clip that
 * moves or trims, or a zoom that changes a little, asks for frames it already has.
 */
export function filmstripTiles(options: {
  start: number;
  duration: number;
  pixelsPerSecond: number;
  tileWidth: number;
  visibleFrom: number;
  visibleTo: number;
  fps: number;
}): FilmTile[] {
  const { start, duration, pixelsPerSecond, tileWidth, fps } = options;
  if (duration <= 0 || pixelsPerSecond <= 0 || tileWidth <= 0 || fps <= 0) return [];
  const end = start + duration;
  const ideal = tileWidth / pixelsPerSecond;
  const step = Math.max(1 / fps, 2 ** Math.round(Math.log2(ideal)));
  const from = Math.max(start, options.visibleFrom);
  const to = Math.min(end, options.visibleTo);
  if (to <= from) return [];
  const tiles: FilmTile[] = [];
  const first = Math.floor(from / step + 1e-9);
  for (let k = first; k * step < to && tiles.length < FILMSTRIP_MAX_TILES; k += 1) {
    const tileStart = Math.max(start, k * step);
    const tileEnd = Math.min(end, (k + 1) * step);
    if (tileEnd - tileStart <= 1e-9) continue;
    tiles.push({
      time: Math.round(tileStart * fps) / fps,
      left: (tileStart - start) * pixelsPerSecond,
      width: (tileEnd - tileStart) * pixelsPerSecond,
    });
  }
  return tiles;
}
