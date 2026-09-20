import type { ExampleSpec } from "./common.ts";
import { writeSpec } from "./common.ts";
import type { CompositionStore } from "../store.ts";

export const spec: ExampleSpec = {
  name: "Motion clock",
  description: "Motion playback.time set from the automedia clock.",
  settings: { width: 640, height: 360, fps: 30, durationSeconds: 2, background: "#181818" },
  body: '<div id="box"></div>',
  css: `html,
body {
  margin: 0;
  background: #181818;
  overflow: hidden;
}
#box {
  position: absolute;
  top: 140px;
  left: 0;
  width: 80px;
  height: 80px;
  background: #00c853;
}
`,
  js: `import { animate } from "motion";

const playback = animate("#box", { left: "560px" }, { duration: 2, ease: "linear" });
playback.pause();
window.automedia.registerRenderer((context) => {
  playback.time = context.timeSeconds;
});
`,
};

export function write(store: CompositionStore) {
  return writeSpec(store, spec);
}
