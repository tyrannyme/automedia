import type { ExportFormat } from "./schemas.ts";

/** `Four chords` → `four-chords.mp4`; a still adds its frame, a repeat adds `-2`, `-3`. */
export function exportFileName(
  name: string,
  format: ExportFormat,
  options: { frame?: number | undefined; copy?: number } = {},
): string {
  const slug =
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "export";
  const frame = options.frame === undefined ? "" : `-f${options.frame}`;
  const copy = options.copy && options.copy > 1 ? `-${options.copy}` : "";
  return `${slug}${frame}${copy}.${format}`;
}

/** The name the next export will get, skipping names already in the project's exports. */
export function nextExportFileName(
  name: string,
  format: ExportFormat,
  taken: readonly string[],
  frame?: number,
): string {
  for (let copy = 1; ; copy += 1) {
    const candidate = exportFileName(name, format, { frame, copy });
    if (!taken.includes(candidate)) return candidate;
  }
}
