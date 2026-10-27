import type { ExampleId } from "../../engine/examples/index.ts";

export type ExampleKind =
  | "motion"
  | "page"
  | "still"
  | "controls"
  | "media"
  | "silent"
  | "music"
  | "check";

/** An engine example as the New sheet shows it. Sizes mirror each example's settings. */
export type ExampleTemplate = {
  id: ExampleId;
  name: string;
  description: string;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  /** The composition background, so a tile shows the frame's real shape and ground. */
  background: string;
  kind: ExampleKind;
};

const t = (
  id: ExampleId,
  name: string,
  description: string,
  [width, height, durationSeconds]: [number, number, number],
  background: string,
  kind: ExampleKind,
): ExampleTemplate => ({
  id,
  name,
  description,
  width,
  height,
  fps: 30,
  durationSeconds,
  background,
  kind,
});

export const exampleTemplates: ExampleTemplate[] = [
  t(
    "css-clock",
    "CSS clock",
    "CSS animation that seek can land on.",
    [640, 360, 2],
    "#202020",
    "motion",
  ),
  t(
    "renderer-clock",
    "Renderer clock",
    "A registered renderer that reads context.frame.",
    [640, 360, 2],
    "#102030",
    "motion",
  ),
  t(
    "three-clock",
    "Three clock",
    "Three.js cube driven by context.timeSeconds.",
    [640, 360, 2],
    "#101018",
    "motion",
  ),
  t(
    "vgpu-shader",
    "vGPU shader",
    "Deterministic WGSL plasma rendered with vGPU and the Automedia frame clock.",
    [640, 360, 4],
    "#040619",
    "motion",
  ),
  t(
    "motion-clock",
    "Motion clock",
    "Motion playback.time set from the automedia clock.",
    [640, 360, 2],
    "#181818",
    "motion",
  ),
  t(
    "tailwind-page",
    "Tailwind page",
    "Tailwind browser utilities paint in the preview.",
    [640, 360, 1],
    "#0f172a",
    "page",
  ),
  t(
    "media-pair",
    "Media pair",
    "A video element plus a wav track with no element.",
    [640, 360, 2],
    "#101018",
    "media",
  ),
  t(
    "controls-knobs",
    "Controls knobs",
    "Range, color, toggle, and select write into the renderer.",
    [640, 360, 1],
    "#111111",
    "controls",
  ),
  t(
    "alpha-still",
    "Alpha still",
    "Transparent background with a translucent square.",
    [256, 256, 1],
    "transparent",
    "still",
  ),
  t(
    "silent-video",
    "Silent video",
    "A muted video track and no wav, so the MP4 has no audio.",
    [640, 360, 2],
    "#101018",
    "silent",
  ),
  t(
    "strudel-music",
    "Strudel music",
    "A music clip with a managed Strudel pattern.",
    [640, 360, 4],
    "#111111",
    "music",
  ),
  t(
    "broken-script",
    "Broken script",
    "A script that throws so validate fails.",
    [800, 600, 3],
    "transparent",
    "check",
  ),
  t(
    "proof",
    "Proof",
    "CSS, a renderer, video, and wav on one clock.",
    [640, 360, 2],
    "#101018",
    "check",
  ),
];

/** The engine's blank composition: what store.create() makes. */
export const blankTemplate = {
  name: "Blank",
  description: "An empty composition with a transparent background.",
  width: 800,
  height: 600,
  fps: 30,
  durationSeconds: 3,
  background: "transparent",
} as const;

export type ExampleGroup = { title: string; note?: string; ids: ExampleId[] };

/** Grouped by what each example teaches. The checks exist to test the studio, so they go last. */
export const exampleGroups: ExampleGroup[] = [
  {
    title: "Motion on the clock",
    ids: ["css-clock", "motion-clock", "renderer-clock", "three-clock", "vgpu-shader"],
  },
  { title: "Pages, stills and controls", ids: ["tailwind-page", "alpha-still", "controls-knobs"] },
  { title: "Media and music", ids: ["media-pair", "silent-video", "strudel-music"] },
  { title: "Checks", note: "for testing", ids: ["broken-script", "proof"] },
];

export function exampleTemplate(id: ExampleId): ExampleTemplate {
  const found = exampleTemplates.find((item) => item.id === id);
  if (!found) throw new Error(`unknown example ${id}`);
  return found;
}

export function matchesTemplate(
  item: { name: string; description: string },
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${item.name} ${item.description}`.toLowerCase().includes(needle);
}
