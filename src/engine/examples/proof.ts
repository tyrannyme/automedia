import type { ExampleSpec } from "./common.ts";
import { writeSpec } from "./common.ts";
import type { CompositionStore } from "../store.ts";

export const spec: ExampleSpec = {
  name: "Proof",
  description: "CSS, a renderer, video, and wav on one clock.",
  settings: { width: 640, height: 360, fps: 30, durationSeconds: 2, background: "#101018" },
  body: `<div id="block"></div>
<canvas id="c" width="640" height="360"></canvas>`,
  css: `html,
body {
  margin: 0;
  overflow: hidden;
  background: transparent;
}
#block {
  position: absolute;
  z-index: 2;
  top: 8px;
  left: 0;
  width: 64px;
  height: 64px;
  background: #ffcc00;
  animation: slide 2s linear forwards;
}
@keyframes slide {
  from {
    left: 0;
  }
  to {
    left: 576px;
  }
}
#c {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}
`,
  js: `const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
window.automedia.registerRenderer((context) => {
  ctx.clearRect(0, 0, 640, 360);
  ctx.fillStyle = "rgb(255, 0, 0)";
  ctx.fillRect(context.frame * 2, 80, 32, 32);
});
`,
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
  controls: [{ id: "gain", type: "range", label: "Gain", value: 1, min: 0, max: 2, step: 0.1 }],
};

export async function write(store: CompositionStore) {
  const composition = await writeSpec(store, spec);
  const media = await store.getMedia(composition.id);
  const block = media.tracks.find((track) => track.kind === "block");
  const video = media.tracks.find((track) => track.kind === "video");
  const audio = media.tracks.find((track) => track.kind === "audio");
  if (!block || !video) return composition;
  await store.putTrack(composition.id, { ...block, lane: 3 });
  await store.putTrack(composition.id, { ...video, lane: 0 });
  await store.putTrack(composition.id, { ...block, lane: 1 });
  if (audio) await store.putTrack(composition.id, { ...audio, lane: 2 });
  return store.get(composition.id);
}
