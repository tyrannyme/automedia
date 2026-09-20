import type { ExampleSpec } from "./common.ts";
import { writeSpec } from "./common.ts";
import type { CompositionStore } from "../store.ts";

export const spec: ExampleSpec = {
  name: "Silent video",
  description: "A muted video track and no wav, so the MP4 has no audio.",
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
  ],
};

export function write(store: CompositionStore) {
  return writeSpec(store, spec);
}
