import { loopbackHost, loopbackPort } from "@shared/limits.ts";
import { compositionThumbnailSrc } from "@/lib/thumbnails.ts";

export const loopbackOrigin =
  window.automediaLoopbackOrigin ?? `http://${loopbackHost}:${loopbackPort}`;

export function compositionContentUrl(compositionId: string): string {
  return `${loopbackOrigin}/compositions/${encodeURIComponent(compositionId)}/content/index.html`;
}

export function compositionThumbnailUrl(compositionId: string, revision: number): string {
  return compositionThumbnailSrc(loopbackOrigin, compositionId, revision);
}

export function eventsUrl(): string {
  return `${loopbackOrigin}/events`;
}

export function compositionAssetUrl(compositionId: string, asset: string): string {
  return `${loopbackOrigin}/compositions/${encodeURIComponent(compositionId)}/content/assets/${encodeURIComponent(asset)}`;
}
