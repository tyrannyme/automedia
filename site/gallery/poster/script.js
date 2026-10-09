await Promise.all([
  document.fonts.load("500 150px Poppins"),
  document.fonts.load('400 20px "DM Mono"'),
]);

const ctx = document.querySelector("canvas").getContext("2d");
const W = 720;
const H = 900;
const TAU = Math.PI * 2;

function ink(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  const lum = (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum > 0.55 ? "#0A0A0A" : "#F5F5F5";
}

const motifs = {
  circle(t, accent) {
    for (let i = 0; i < 7; i += 1) {
      const r = 250 - i * 34 + Math.sin(t * TAU * 0.25 + i * 0.7) * 14;
      ctx.beginPath();
      ctx.arc(W / 2, 360, Math.max(4, r), 0, TAU);
      ctx.fillStyle = i % 2 ? ctx.canvas.dataset.paper : accent;
      ctx.fill();
    }
  },
  bars(t, accent) {
    ctx.fillStyle = accent;
    for (let i = 0; i < 12; i += 1) {
      const h = 120 + (Math.sin(t * TAU * 0.25 * 2 + i * 0.55) * 0.5 + 0.5) * 380;
      ctx.beginPath();
      ctx.roundRect(60 + i * 51, 610 - h, 34, h, 17);
      ctx.fill();
    }
  },
  grid(t, accent) {
    ctx.fillStyle = accent;
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const phase = Math.sin(t * TAU * 0.25 + (x + y) * 0.45) * 0.5 + 0.5;
        const s = 8 + phase * 52;
        ctx.save();
        ctx.translate(108 + x * 72, 112 + y * 64);
        ctx.rotate(phase * Math.PI * 0.5);
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.restore();
      }
    }
  },
  arc(t, accent) {
    ctx.strokeStyle = accent;
    ctx.lineCap = "round";
    for (let i = 0; i < 6; i += 1) {
      const r = 80 + i * 36;
      const start = t * TAU * 0.25 * (i % 2 ? -1 : 1) + i;
      ctx.lineWidth = 22;
      ctx.beginPath();
      ctx.arc(W / 2, 360, r, start, start + Math.PI * (0.6 + i * 0.18));
      ctx.stroke();
    }
  },
};

window.automedia.registerRenderer(({ timeSeconds, controls }) => {
  const paper = String(controls.paper);
  const accent = String(controls.accent);
  const text = ink(paper);
  const t = timeSeconds * Number(controls.speed);
  ctx.canvas.dataset.paper = paper;
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);
  (motifs[controls.motif] ?? motifs.circle)(t, accent);

  ctx.fillStyle = text;
  ctx.font = "500 150px Poppins";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(String(controls.title), 48, 790);
  ctx.font = '400 20px "DM Mono"';
  ctx.fillText("AUTOMEDIA · VOL. 03", 52, 846);
  ctx.textAlign = "right";
  ctx.fillText(`${controls.motif} · ×${controls.speed}`.toUpperCase(), W - 48, 846);
  ctx.textAlign = "left";
});
