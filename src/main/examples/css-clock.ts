import type { ExampleSpec } from "./common.ts";
import { writeSpec } from "./common.ts";
import type { CompositionStore } from "../store.ts";

export const spec: ExampleSpec = {
  name: "CSS clock",
  description: "CSS animation that seek can land on.",
  settings: { width: 640, height: 360, fps: 30, durationSeconds: 2, background: "#202020" },
  body: '<div id="box"></div>',
  css: `html,
body {
  margin: 0;
  background: #202020;
  overflow: hidden;
}
#box {
  position: absolute;
  top: 140px;
  left: 0;
  width: 80px;
  height: 80px;
  background: #ff4d00;
  animation: slide 2s linear forwards;
}
@keyframes slide {
  from {
    left: 0;
  }
  to {
    left: 560px;
  }
}
`,
  js: "\n",
};

export function write(store: CompositionStore) {
  return writeSpec(store, spec);
}
