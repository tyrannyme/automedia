import type { ExampleSpec } from "./common.ts";
import { writeSpec } from "./common.ts";
import type { CompositionStore } from "../store.ts";

export const spec: ExampleSpec = {
  name: "Renderer clock",
  description: "A registered renderer that reads context.frame.",
  settings: { width: 640, height: 360, fps: 30, durationSeconds: 2, background: "#102030" },
  body: '<canvas id="c" width="640" height="360"></canvas>',
  css: `html,
body {
  margin: 0;
  overflow: hidden;
  background: #102030;
}
canvas {
  display: block;
}
`,
  js: `const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
window.automedia.registerRenderer((context) => {
  ctx.fillStyle = "#102030";
  ctx.fillRect(0, 0, 640, 360);
  ctx.fillStyle = "rgb(255, 0, 0)";
  ctx.fillRect(context.frame * 8, 164, 32, 32);
});
`,
};

export function write(store: CompositionStore) {
  return writeSpec(store, spec);
}
