export function compositionThumbnailSrc(
  origin: string,
  compositionId: string,
  revision: number,
): string {
  const base = `${origin.replace(/\/$/, "")}/compositions/${encodeURIComponent(compositionId)}/thumbnail.png`;
  return `${base}?rev=${revision}`;
}
