import type { ExampleSpec } from "./common.ts";
import { writeSpec } from "./common.ts";
import type { CompositionStore } from "../store.ts";

export const spec: ExampleSpec = {
  name: "Tailwind page",
  description: "Tailwind browser utilities paint in the preview.",
  settings: { width: 640, height: 360, fps: 30, durationSeconds: 1, background: "#0f172a" },
  body: '<p id="label" class="text-4xl font-bold text-amber-400">TW</p>',
  css: `html,
body {
  margin: 0;
  width: 640px;
  height: 360px;
}
body {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0f172a;
}
`,
  js: "\n",
};

export function write(store: CompositionStore) {
  return writeSpec(store, spec);
}
