import type { ExampleSpec } from "./common.ts";
import { writeSpec } from "./common.ts";
import type { CompositionStore } from "../store.ts";

export const spec: ExampleSpec = {
  name: "Alpha still",
  description: "Transparent background with a translucent square.",
  settings: { width: 256, height: 256, fps: 30, durationSeconds: 1, background: "transparent" },
  body: '<div id="square"></div>',
  css: `html,
body {
  margin: 0;
  width: 256px;
  height: 256px;
  background: transparent;
}
#square {
  position: absolute;
  left: 64px;
  top: 64px;
  width: 128px;
  height: 128px;
  background: #ff000080;
}
`,
  js: "\n",
};

export function write(store: CompositionStore) {
  return writeSpec(store, spec);
}
