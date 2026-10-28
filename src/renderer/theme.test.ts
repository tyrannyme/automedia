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

function lightDark(css: string, token: string): [string, string] {
  const match = css.match(
    new RegExp(`--${token}:\\s*light-dark\\((#[0-9a-f]{6}),\\s*(#[0-9a-f]{6})\\)`),
  );
  if (!match?.[1] || !match[2]) throw new Error(`missing token ${token}`);
  return [match[1], match[2]];
}

describe("theme tokens", () => {
  it("keeps the CSS canvases in step with DESIGN.md", () => {
    const css = read("src/renderer/index.css");
    const design = read("DESIGN.md");
    for (const token of [
      "canvas-preview",
      "canvas-inspector",
      "canvas-timeline",
      "raised",
      "dim",
      "faint",
    ]) {
      const [light, dark] = lightDark(css, token);
      expect(design).toContain(`light-${token}: "${light.toUpperCase()}"`);
      expect(design).toContain(`  ${token}: "${dark.toUpperCase()}"`);
    }
  });

  it("keeps secondary text readable on every canvas", () => {
    const css = read("src/renderer/index.css");
    const [lightMuted, darkMuted] = lightDark(css, "muted-foreground");
    const [lightDim, darkDim] = lightDark(css, "dim");
    for (const canvas of ["canvas-preview", "canvas-inspector", "canvas-timeline"]) {
      const [light, dark] = lightDark(css, canvas);
      expect(contrast(lightMuted, light)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(darkMuted, dark)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(lightDim, light)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(darkDim, dark)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
