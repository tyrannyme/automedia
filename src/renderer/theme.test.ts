import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

function srgbToLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].toSorted(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

describe("theme tokens", () => {
  it("keeps the light timeline a step darker than inspector, not a pit", () => {
    const css = read("src/renderer/index.css");
    const design = read("DESIGN.md");
    const token = css.match(/--canvas-timeline:\s*light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/);
    const lightDesign = design.match(/light-canvas-timeline:\s*"(#[0-9A-F]{6})"/);
    const muted = css.match(/--muted-foreground:\s*light-dark\((#[0-9a-f]{6}),/);

    expect(token?.[1]).toBe("#e0e0e0");
    expect(token?.[2]).toBe("#0c0c0c");
    expect(lightDesign?.[1]).toBe("#E0E0E0");
    expect(muted?.[1]).toBe("#525252");
    expect(contrast("#525252", "#e0e0e0")).toBeGreaterThanOrEqual(4.5);
  });
});
