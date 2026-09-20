import { cdpHost, cdpPort as defaultCdpPort } from "@shared/limits.ts";
import { resolvePort } from "@shared/ports.ts";

export function resolveCdpPort(raw = process.env.AUTOMEDIA_CDP_PORT): number {
  return resolvePort(raw, defaultCdpPort);
}

export function cdpOrigin(raw = process.env.AUTOMEDIA_CDP_PORT): string {
  return `http://${cdpHost}:${resolveCdpPort(raw)}`;
}
