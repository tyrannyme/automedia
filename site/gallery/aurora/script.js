import { effect, frame, init, target } from "vgpu";

const canvas = document.querySelector("canvas");
const context = canvas.getContext("2d");
const width = canvas.width;
const height = canvas.height;
const source = await (await fetch("./aurora.wgsl")).text();
const gpu = await init({ powerPreference: "high-performance" });

const output = target(gpu, { size: [width, height], format: "rgba8unorm" });
const sky = effect(gpu, source, { set: { params: { time: 0, width, height, pad: 0 } } });

window.automedia.registerRenderer(async ({ timeSeconds }) => {
  sky.set({ params: { time: timeSeconds, width, height, pad: 0 } });
  frame(gpu, (current) => current.pass(output, sky));
  const pixels = await output.read();
  const rgba = new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  context.putImageData(new ImageData(rgba, width, height), 0, 0);
});
