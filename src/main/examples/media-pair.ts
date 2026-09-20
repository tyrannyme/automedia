import type { ExampleSpec } from "./common.ts";
import { writeSpec } from "./common.ts";
import type { CompositionStore } from "../store.ts";

export const spec: ExampleSpec = {
  name: "Media pair",
  description: "A video element plus a wav track with no element.",
  settings: { width: 640, height: 360, fps: 30, durationSeconds: 2, background: "#101018" },
  body: "",
  css: `html,
body {
  margin: 0;
  background: transparent;
  overflow: hidden;
}
`,
  js: "\n",
  media: true,
  tracks: [
    {
      id: "track-video",
      kind: "video",
      asset: "fps-guns.mp4",
      start: 0,
      duration: 2,
      trimStart: 0,
      rate: 1,
      volume: 1,
      mute: true,
      lane: 1,
    },
    {
      id: "track-wav",
      kind: "audio",
      asset: "beat-ident.ogg",
      start: 0,
      duration: 2,
      trimStart: 0,
      rate: 1,
      volume: 1,
      mute: false,
      lane: 2,
    },
  ],
};

export function write(store: CompositionStore) {
  return writeSpec(store, spec);
}
