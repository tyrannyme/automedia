import type { ExampleSpec } from "./common.ts";
import { writeSpec } from "./common.ts";
import type { CompositionStore } from "../store.ts";

export const spec: ExampleSpec = {
  name: "Controls knobs",
  description: "Range, color, toggle, and select write into the renderer.",
  settings: { width: 640, height: 360, fps: 30, durationSeconds: 1, background: "#111111" },
  body: '<div id="panel"></div>',
  css: `html,
body {
  margin: 0;
  overflow: hidden;
  background: #111111;
}
#panel {
  width: 640px;
  height: 360px;
}
`,
  js: `window.automedia.registerRenderer((context) => {
  const panel = document.getElementById("panel");
  panel.style.background = String(context.controls.tint);
  panel.style.opacity = String(context.controls.gain);
  panel.style.display = context.controls.show ? "block" : "none";
  panel.textContent = String(context.controls.mode);
});
`,
  controls: [
    { id: "gain", type: "range", label: "Gain", value: 1, min: 0, max: 1, step: 0.05 },
    { id: "tint", type: "color", label: "Tint", value: "#3366ff" },
    { id: "show", type: "toggle", label: "Show", value: true },
    {
      id: "mode",
      type: "select",
      label: "Mode",
      value: "one",
      options: [
        { value: "one", label: "One" },
        { value: "two", label: "Two" },
      ],
    },
  ],
};

export function write(store: CompositionStore) {
  return writeSpec(store, spec);
}
