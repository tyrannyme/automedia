await Promise.all([
  document.fonts.load("600 120px Nunito"),
  document.fonts.load("400 34px Poppins"),
  document.fonts.load('400 15px "DM Mono"'),
]);

const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");
const W = 1280;
const H = 720;
const DURATION = 6;

const clamp = (v) => Math.min(1, Math.max(0, v));
const outCubic = (t) => 1 - (1 - clamp(t)) ** 3;
const outBack = (t) => {
  const x = clamp(t) - 1;
  return 1 + 2.7 * x ** 3 + 1.7 * x ** 2;
};
const span = (t, a, b) => clamp((t - a) / (b - a));
const pad = (n) => String(n).padStart(2, "0");

const words = [
  { text: "stills", color: "#3B82F6" },
  { text: "animation", color: "#22C55E" },
  { text: "video", color: "#F97316" },
  { text: "music", color: "#A855F7" },
];

const clips = [
  { lane: 0, start: 0.0, end: 0.46, color: "#F5F5F5", ink: "#0A0A0A", label: "Title" },
  { lane: 0, start: 0.5, end: 0.96, color: "#3B82F6", label: "stills" },
  { lane: 1, start: 0.12, end: 0.62, color: "#22C55E", label: "animation" },
  { lane: 1, start: 0.66, end: 0.98, color: "#F97316", label: "video.mp4" },
  { lane: 2, start: 0.3, end: 0.94, color: "#A855F7", label: "music/pattern.js" },
];

function roundRect(x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function corner(size, t) {
  const thick = size * 0.16;
  const cut = size * 0.3;
  ctx.beginPath();
  ctx.moveTo(cut, 0);
  ctx.lineTo(size, 0);
  ctx.lineTo(size, size - cut);
  ctx.lineTo(size - thick, size - cut - thick * 0.2);
  ctx.lineTo(size - thick, thick);
  ctx.lineTo(cut + thick * 0.2, thick);
  ctx.closePath();
  ctx.fillStyle = `rgba(245,245,245,${t})`;
  ctx.fill();
}

function mark(cx, cy, size, t) {
  const a = outBack(span(t, 0, 0.7));
  const b = outBack(span(t, 0.12, 0.82));
  const travel = 260;
  ctx.save();
  ctx.translate(cx - size / 2 + (1 - a) * travel, cy - size / 2 - (1 - a) * travel);
  corner(size, clamp(a * 1.4));
  ctx.restore();
  ctx.save();
  ctx.translate(cx + size / 2 - (1 - b) * travel, cy + size / 2 + (1 - b) * travel);
  ctx.rotate(Math.PI);
  corner(size, clamp(b * 1.4));
  ctx.restore();
}

function background(t) {
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,0.055)";
  for (let y = 24; y < H; y += 32) {
    for (let x = 24; x < W; x += 32) {
      const wave = Math.sin(x * 0.012 + y * 0.008 - t * 2.4) * 0.5 + 0.5;
      const r = 0.8 + wave * 0.9;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function title(t) {
  const text = "Automedia";
  ctx.font = "600 120px Nunito";
  ctx.textBaseline = "alphabetic";
  let x = 300;
  for (let i = 0; i < text.length; i += 1) {
    const p = outBack(span(t, 0.45 + i * 0.045, 0.95 + i * 0.045));
    ctx.fillStyle = `rgba(245,245,245,${clamp(p * 1.2)})`;
    ctx.fillText(text[i], x, 300 + (1 - p) * 70);
    x += ctx.measureText(text[i]).width;
  }
}

function tagline(t) {
  const enter = outCubic(span(t, 1.2, 1.8));
  ctx.font = "400 34px Poppins";
  ctx.fillStyle = `rgba(163,163,163,${enter})`;
  const lead = "Make ";
  ctx.fillText(lead, 304, 370);
  const x = 304 + ctx.measureText(lead).width;
  const local = Math.max(0, t - 1.5);
  const index = Math.min(words.length - 1, Math.floor(local / 1.05));
  const phase = local - index * 1.05;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - 4, 322, 520, 64);
  ctx.clip();
  for (const [offset, word] of [
    [0, words[index]],
    [1, words[index + 1]],
  ]) {
    if (!word) continue;
    const swap = index + 1 < words.length ? outCubic(span(phase, 0.82, 1.05)) : 0;
    const y = 370 + (offset - swap) * 56;
    ctx.fillStyle = word.color;
    ctx.globalAlpha = enter;
    ctx.fillText(word.text, x, y);
  }
  ctx.restore();
  const after = x + ctx.measureText(words[index].text).width;
  const swapping = index + 1 < words.length ? outCubic(span(phase, 0.82, 1.05)) : 0;
  const nextWidth = words[index + 1] ? ctx.measureText(words[index + 1].text).width : 0;
  const width = after - x + (nextWidth - (after - x)) * swapping;
  ctx.fillStyle = `rgba(163,163,163,${enter})`;
  ctx.fillText(" with HTML.", x + width, 370);
}

function timeline(t) {
  const enter = outCubic(span(t, 0.3, 1.1));
  const x = 64;
  const y = 450 + (1 - enter) * 60;
  const w = W - 128;
  const h = 214;
  ctx.globalAlpha = enter;
  ctx.fillStyle = "#121212";
  roundRect(x, y, w, h, 20);
  ctx.fill();

  const left = x + 24;
  const right = x + w - 24;
  const top = y + 48;
  ctx.strokeStyle = "#2e2e2e";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, top - 12);
  ctx.lineTo(right, top - 12);
  ctx.stroke();
  for (let i = 0; i <= 24; i += 1) {
    const tx = left + ((right - left) * i) / 24;
    ctx.beginPath();
    ctx.moveTo(tx, top - 12);
    ctx.lineTo(tx, top - (i % 4 === 0 ? 24 : 18));
    ctx.stroke();
  }
  ctx.font = '400 15px "DM Mono"';
  ctx.fillStyle = "#a3a3a3";
  const frame = Math.min(Math.floor(t * 30), DURATION * 30 - 1);
  ctx.fillText(`00:00:${pad(Math.floor(frame / 30))}:${pad(frame % 30)}`, left, y + 26);
  ctx.textAlign = "right";
  ctx.fillText(`${frame + 1} / ${DURATION * 30}`, right, y + 26);
  ctx.textAlign = "left";

  ctx.font = "400 15px Poppins";
  for (const [i, clip] of clips.entries()) {
    const grow = outCubic(span(t, 0.5 + i * 0.14, 1.3 + i * 0.14));
    const cx = left + (right - left) * clip.start;
    const cw = (right - left) * (clip.end - clip.start) * grow;
    const cy = top + clip.lane * 48;
    ctx.fillStyle = clip.color;
    roundRect(cx, cy, cw, 36, 10);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = clip.ink ?? "#F5F5F5";
    ctx.fillText(clip.label, cx + 14, cy + 24);
    ctx.restore();
  }

  const head = left + (right - left) * (t / DURATION);
  ctx.fillStyle = "#EF4444";
  ctx.fillRect(head - 1, top - 14, 2, 3 * 48 + 8);
  ctx.beginPath();
  ctx.moveTo(head - 8, top - 26);
  ctx.lineTo(head + 8, top - 26);
  ctx.lineTo(head, top - 14);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

window.automedia.registerRenderer(({ timeSeconds: t }) => {
  background(t);
  mark(206, 262, 112, t);
  title(t);
  tagline(t);
  timeline(t);
});
