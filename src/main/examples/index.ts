import { AppError } from "@shared/errors.ts";
import type { Composition } from "@shared/schemas.ts";
import type { CompositionStore } from "../store.ts";
import * as alphaStill from "./alpha-still.ts";
import * as brokenScript from "./broken-script.ts";
import * as controlsKnobs from "./controls-knobs.ts";
import * as cssClock from "./css-clock.ts";
import * as mediaPair from "./media-pair.ts";
import * as motionClock from "./motion-clock.ts";
import * as proof from "./proof.ts";
import * as rendererClock from "./renderer-clock.ts";
import * as silentVideo from "./silent-video.ts";
import * as strudelMusic from "./strudel-music.ts";
import * as tailwindPage from "./tailwind-page.ts";
import * as threeClock from "./three-clock.ts";
import * as vgpuShader from "./vgpu-shader.ts";
import { copyMediaFixtures } from "./common.ts";

export const exampleIds = [
  "css-clock",
  "renderer-clock",
  "three-clock",
  "vgpu-shader",
  "motion-clock",
  "tailwind-page",
  "media-pair",
  "controls-knobs",
  "alpha-still",
  "silent-video",
  "strudel-music",
  "broken-script",
  "proof",
] as const;
export type ExampleId = (typeof exampleIds)[number];

const examples = {
  "css-clock": { ...cssClock.spec, write: cssClock.write },
  "renderer-clock": { ...rendererClock.spec, write: rendererClock.write },
  "three-clock": { ...threeClock.spec, write: threeClock.write },
  "vgpu-shader": { ...vgpuShader.spec, write: vgpuShader.write },
  "motion-clock": { ...motionClock.spec, write: motionClock.write },
  "tailwind-page": { ...tailwindPage.spec, write: tailwindPage.write },
  "media-pair": { ...mediaPair.spec, write: mediaPair.write },
  "controls-knobs": { ...controlsKnobs.spec, write: controlsKnobs.write },
  "alpha-still": { ...alphaStill.spec, write: alphaStill.write },
  "silent-video": { ...silentVideo.spec, write: silentVideo.write },
  "strudel-music": { ...strudelMusic.spec, write: strudelMusic.write },
  "broken-script": { ...brokenScript.spec, write: brokenScript.write },
  proof: { ...proof.spec, write: proof.write },
} satisfies Record<
  ExampleId,
  { name: string; description: string; write: (store: CompositionStore) => Promise<Composition> }
>;

export async function writeExample(
  store: CompositionStore,
  example: ExampleId,
): Promise<Composition> {
  const item = examples[example];
  if (!Object.hasOwn(examples, example)) {
    throw new AppError("unknown_example", `unknown example ${example}`);
  }
  return item.write(store);
}

export function listExamples(): { id: ExampleId; name: string; description: string }[] {
  return exampleIds.map((id) => ({
    id,
    name: examples[id].name,
    description: examples[id].description,
  }));
}

export { copyMediaFixtures };
