import type { ExampleSpec } from "./common.ts";
import { writeSpec } from "./common.ts";
import type { CompositionStore } from "../store.ts";

export const spec: ExampleSpec = {
  name: "Broken script",
  description: "A script that throws so validate fails.",
  body: "",
  css: "html, body { margin: 0; }\n",
  js: `throw new Error("proof-throw");
`,
};

export function write(store: CompositionStore) {
  return writeSpec(store, spec);
}
