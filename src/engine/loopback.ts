import { loopbackHost, loopbackPort } from "@shared/limits.ts";
import { resolvePort } from "@shared/ports.ts";

export type LoopbackUrlSource = () => string | undefined;

export function resolveLoopbackPort(raw = process.env.AUTOMEDIA_LOOPBACK_PORT): number {
  return resolvePort(raw, loopbackPort);
}

export function defaultLoopbackUrl(raw = process.env.AUTOMEDIA_LOOPBACK_PORT): string {
  return `http://${loopbackHost}:${resolveLoopbackPort(raw)}`;
}

export function resolveLoopbackUrl(source?: LoopbackUrlSource): string {
  const value = source?.();
  return (value ?? defaultLoopbackUrl()).replace(/\/$/, "");
}

export function compositionContentUrl(baseUrl: string, compositionId: string): string {
  const origin = baseUrl.replace(/\/$/, "");
  return `${origin}/compositions/${encodeURIComponent(compositionId)}/content/index.html`;
}

export function compositionExportUrl(
  baseUrl: string,
  compositionId: string,
  jobId: string,
): string {
  const origin = baseUrl.replace(/\/$/, "");
  return `${origin}/compositions/${encodeURIComponent(compositionId)}/exports/${encodeURIComponent(jobId)}`;
}
