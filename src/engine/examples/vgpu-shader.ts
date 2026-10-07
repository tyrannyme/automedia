import type { ExampleSpec } from "./common.ts";
import { writeSpec } from "./common.ts";
import type { CompositionStore } from "../store.ts";

const shader = `
struct Params {
  time: f32,
  width: f32,
  height: f32,
  intensity: f32,
}

@group(0) @binding(0) var<uniform> params: Params;

fn hash(point: vec2f) -> f32 {
  return fract(sin(dot(point, vec2f(127.1, 311.7))) * 43758.5453);
}

fn noise(point: vec2f) -> f32 {
  let cell = floor(point);
  let local = fract(point);
  let curve = local * local * (3.0 - 2.0 * local);
  let a = hash(cell);
  let b = hash(cell + vec2f(1.0, 0.0));
  let c = hash(cell + vec2f(0.0, 1.0));
  let d = hash(cell + vec2f(1.0, 1.0));
  return mix(mix(a, b, curve.x), mix(c, d, curve.x), curve.y);
}

fn fbm(point: vec2f) -> f32 {
  var value = 0.0;
  var amplitude = 0.5;
  var samplePoint = point;
  for (var octave: i32 = 0; octave < 5; octave = octave + 1) {
    value = value + noise(samplePoint) * amplitude;
    samplePoint = samplePoint * 2.03 + vec2f(17.1, 9.2);
    amplitude = amplitude * 0.5;
  }
  return value;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = vec2f(params.width / params.height, 1.0);
  let position = (uv - 0.5) * aspect * 3.2;
  let drift = vec2f(params.time * 0.11, -params.time * 0.08);
  let first = fbm(position + drift);
  let second = fbm(position + vec2f(first * 1.8, first * 1.2) - drift * 0.7);
  let field = fbm(position + vec2f(second * 2.0, -first * 1.6) + drift * 0.4);

  let deep = vec3f(0.015, 0.025, 0.11);
  let violet = vec3f(0.34, 0.08, 0.78);
  let cyan = vec3f(0.02, 0.78, 0.92);
  let ember = vec3f(1.0, 0.29, 0.08);
  var color = mix(deep, violet, smoothstep(0.18, 0.62, field));
  color = mix(color, cyan, smoothstep(0.52, 0.78, second));
  color = mix(color, ember, pow(max(0.0, field - 0.68) * 3.1, 2.0));

  let vignette = 1.0 - smoothstep(0.35, 1.35, length(position / aspect));
  color = color * (0.45 + vignette * 0.9) * params.intensity;
  return vec4f(color, 1.0);
}
`.trim();

export const spec: ExampleSpec = {
  name: "vGPU shader",
  description: "Deterministic WGSL plasma rendered with vGPU and the Automedia frame clock.",
  settings: { width: 640, height: 360, fps: 30, durationSeconds: 4, background: "#040619" },
  body: '<canvas width="640" height="360" aria-label="vGPU shader"></canvas>',
  css: `html,
body {
  margin: 0;
  overflow: hidden;
  background: #040619;
}

canvas {
  display: block;
  width: 640px;
  height: 360px;
}
`,
  js: `import { effect, frame, init, target } from "vgpu";

const canvas = document.querySelector("canvas");
const context = canvas.getContext("2d");
const width = Number(document.documentElement.dataset.automediaWidth);
const height = Number(document.documentElement.dataset.automediaHeight);
canvas.width = width;
canvas.height = height;
const response = await fetch("./shader.wgsl");
if (!response.ok) throw new Error("shader.wgsl could not be loaded");
const source = await response.text();
const gpu = await init({ powerPreference: "high-performance" });
gpu.onError((error) => {
  window.setTimeout(() => {
    throw error;
  });
});

const output = target(gpu, { size: [width, height], format: "rgba8unorm" });
const plasma = effect(gpu, source, {
  set: { params: { time: 0, width, height, intensity: 1 } },
});

window.automedia.registerRenderer(async ({ timeSeconds, width, height, controls }) => {
  plasma.set({
    params: {
      time: timeSeconds,
      width,
      height,
      intensity: Number(controls.intensity ?? 1),
    },
  });
  frame(gpu, (currentFrame) => currentFrame.pass(output, plasma));
  const pixels = await output.read();
  const clamped = new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  context.putImageData(new ImageData(clamped, width, height), 0, 0);
});

window.addEventListener("beforeunload", () => gpu.dispose(), { once: true });
`,
  files: { "shader.wgsl": `${shader}\n` },
  controls: [
    {
      id: "intensity",
      type: "range",
      label: "Intensity",
      value: 1,
      min: 0.35,
      max: 1.5,
      step: 0.05,
    },
  ],
};

export function write(store: CompositionStore) {
  return writeSpec(store, spec);
}
