import type { ExampleSpec } from "./common.ts";
import { writeSpec } from "./common.ts";
import type { CompositionStore } from "../store.ts";

export const spec: ExampleSpec = {
  name: "Three clock",
  description: "Three.js cube driven by context.timeSeconds.",
  settings: { width: 640, height: 360, fps: 30, durationSeconds: 2, background: "#101018" },
  body: "",
  css: `html,
body {
  margin: 0;
  overflow: hidden;
  background: #101018;
}
canvas {
  display: block;
}
`,
  js: `import * as THREE from "three";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101018);
const camera = new THREE.PerspectiveCamera(50, 640 / 360, 0.1, 100);
camera.position.z = 3;
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(640, 360);
document.body.appendChild(renderer.domElement);
const mesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({ color: 0x44aaff }),
);
scene.add(mesh);
window.automedia.registerRenderer((context) => {
  mesh.rotation.y = context.timeSeconds * Math.PI;
  mesh.material.color.setHSL(context.timeSeconds / 2, 0.8, 0.5);
  renderer.render(scene, camera);
});
`,
};

export function write(store: CompositionStore) {
  return writeSpec(store, spec);
}
