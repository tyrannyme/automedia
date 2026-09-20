import type { ExampleId } from "../../main/examples/index.ts";

export type ExampleChoice = { value: ExampleId | "blank"; label: string };

export const exampleChoices: ExampleChoice[] = [
  { value: "blank", label: "Blank composition" },
  { value: "css-clock", label: "CSS clock" },
  { value: "renderer-clock", label: "Renderer clock" },
  { value: "three-clock", label: "Three clock" },
  { value: "vgpu-shader", label: "vGPU shader" },
  { value: "motion-clock", label: "Motion clock" },
  { value: "tailwind-page", label: "Tailwind page" },
  { value: "media-pair", label: "Media pair" },
  { value: "controls-knobs", label: "Controls knobs" },
  { value: "alpha-still", label: "Alpha still" },
  { value: "silent-video", label: "Silent video" },
  { value: "strudel-music", label: "Strudel music" },
  { value: "broken-script", label: "Broken script" },
  { value: "proof", label: "Proof" },
];
