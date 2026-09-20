import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { ExampleSpec } from "./common.ts";
import { writeSpec } from "./common.ts";
import type { CompositionStore } from "../store.ts";

export const spec: ExampleSpec = {
  name: "Automedia",
  description: "Title card used as the README banner.",
  settings: { width: 1280, height: 640, fps: 30, durationSeconds: 3, background: "#0A0A0A" },
  body: '<canvas id="c" width="1280" height="640"></canvas>',
  css: `html,
body {
  margin: 0;
  overflow: hidden;
  background: #0a0a0a;
}
canvas {
  display: block;
}
@font-face {
  font-family: Nunito;
  font-style: normal;
  font-weight: 600;
  src: url("../../assets/nunito.woff2") format("woff2");
}
@font-face {
  font-family: Poppins;
  font-style: normal;
  font-weight: 400;
  src: url("../../assets/poppins.woff2") format("woff2");
}
@font-face {
  font-family: Poppins;
  font-style: normal;
  font-weight: 500;
  src: url("../../assets/poppins-500.woff2") format("woff2");
}
@font-face {
  font-family: "DM Mono";
  font-style: normal;
  font-weight: 400;
  src: url("../../assets/dm-mono.woff2") format("woff2");
}
`,
  js: `await document.fonts.ready;

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

function viewfinder(x, y, size) {
  const t = size * 0.16;
  const cut = size * 0.3;
  ctx.fillStyle = "#f5f5f5";
  ctx.beginPath();
  ctx.moveTo(x + cut, y);
  ctx.lineTo(x + size, y);
  ctx.lineTo(x + size, y + size - cut);
  ctx.lineTo(x + size - t, y + size - cut - t * 0.2);
  ctx.lineTo(x + size - t, y + t);
  ctx.lineTo(x + cut + t * 0.2, y + t);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y + cut);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x + size - cut, y + size);
  ctx.lineTo(x + size - cut - t * 0.2, y + size - t);
  ctx.lineTo(x + t, y + size - t);
  ctx.lineTo(x + t, y + cut + t * 0.2);
  ctx.closePath();
  ctx.fill();
}

function roundRect(x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

window.automedia.registerRenderer((context) => {
  const width = context.width;
  const height = context.height;
  const t = context.timeSeconds / context.durationSeconds;
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, width, 188);
  ctx.fillStyle = "#0c0c0c";
  ctx.fillRect(0, 392, width, height - 392);

  viewfinder(72, 214, 56);
  ctx.fillStyle = "#f5f5f5";
  ctx.font = "600 64px Nunito, ui-sans-serif, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("Automedia", 148, 242);
  ctx.fillStyle = "#a3a3a3";
  ctx.font = "400 20px Poppins, ui-sans-serif, sans-serif";
  ctx.fillText("A local studio for stills, animation, and video", 148, 296);
  ctx.fillStyle = "#737373";
  ctx.font = "400 13px \\"DM Mono\\", ui-monospace, monospace";
  ctx.fillText("PNG   GIF   WEBP   MP4   WEBM   MP3   WAV   OGG", 148, 332);

  const fieldX = 64;
  const fieldW = width - 128;
  const laneY = [430, 478, 526];
  const clips = [
    { y: 0, start: 0.0, duration: 1.7, label: "Title", fill: "#262626" },
    { y: 1, start: 0.35, duration: 1.9, label: "Theme", fill: "#2e2e2e" },
    { y: 2, start: 1.05, duration: 1.7, label: "clip.mp4", fill: "#262626" },
  ];
  ctx.fillStyle = "#161616";
  roundRect(48, 408, width - 96, 168, 16);
  ctx.fill();

  ctx.strokeStyle = "#2e2e2e";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(fieldX, 424);
  ctx.lineTo(fieldX + fieldW, 424);
  ctx.stroke();
  for (let i = 0; i <= 12; i += 1) {
    const x = fieldX + (fieldW * i) / 12;
    ctx.beginPath();
    ctx.moveTo(x, 424);
    ctx.lineTo(x, 424 + (i % 3 === 0 ? 10 : 6));
    ctx.stroke();
  }
  ctx.fillStyle = "#737373";
  ctx.font = "400 12px \\"DM Mono\\", ui-monospace, monospace";
  ctx.textBaseline = "top";
  ctx.fillText("3s", fieldX, 408);

  for (const clip of clips) {
    const x = fieldX + fieldW * (clip.start / 3);
    const w = fieldW * (clip.duration / 3);
    const y = laneY[clip.y];
    ctx.fillStyle = clip.fill;
    roundRect(x, y, w, 36, 8);
    ctx.fill();
    ctx.fillStyle = "#f5f5f5";
    ctx.font = "500 13px Poppins, ui-sans-serif, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(clip.label, x + 12, y + 18);
  }

  const playX = fieldX + fieldW * t;
  ctx.fillStyle = "#ef4444";
  ctx.fillRect(playX - 1, 416, 2, 152);
  ctx.beginPath();
  ctx.moveTo(playX - 6, 416);
  ctx.lineTo(playX + 6, 416);
  ctx.lineTo(playX, 426);
  ctx.closePath();
  ctx.fill();
});
`,
};

export async function write(store: CompositionStore) {
  const composition = await writeSpec(store, spec);
  const assetsDir = path.join(store.compositionDir(composition.id), "assets");
  const fonts = path.join(process.cwd(), "src/renderer/fonts");
  await mkdir(assetsDir, { recursive: true });
  await copyFile(
    path.join(fonts, "nunito-latin-600-normal.woff2"),
    path.join(assetsDir, "nunito.woff2"),
  );
  await copyFile(
    path.join(fonts, "poppins-latin-400-normal.woff2"),
    path.join(assetsDir, "poppins.woff2"),
  );
  await copyFile(
    path.join(fonts, "poppins-latin-500-normal.woff2"),
    path.join(assetsDir, "poppins-500.woff2"),
  );
  await copyFile(
    path.join(fonts, "dm-mono-latin-400-normal.woff2"),
    path.join(assetsDir, "dm-mono.woff2"),
  );
  return store.get(composition.id);
}
