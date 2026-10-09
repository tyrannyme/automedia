await Promise.all([
  document.fonts.load("500 200px Poppins"),
  document.fonts.load('400 22px "DM Mono"'),
]);

const ctx = document.querySelector("canvas").getContext("2d");
const W = 1280;
const H = 720;
const BEAT = 0.5;
const BAR = 2;
const chords = [
  { name: "Am7", color: "#A855F7" },
  { name: "Fmaj7", color: "#3B82F6" },
  { name: "Cmaj7", color: "#22C55E" },
  { name: "G7", color: "#F97316" },
];

window.automedia.registerRenderer(({ timeSeconds: t }) => {
  const bar = Math.floor(t / BAR) % chords.length;
  const chord = chords[bar];
  const sinceBeat = t % BEAT;
  const kick = Math.exp(-sinceBeat * 9);
  const sinceBar = t % BAR;

  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 420 + kick * 120);
  glow.addColorStop(0, `${chord.color}${Math.round(40 + kick * 60).toString(16)}`);
  glow.addColorStop(1, "#0a0a0a00");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 4; i += 1) {
    const age = sinceBeat + i * BEAT;
    const r = 120 + age * 520;
    ctx.strokeStyle = `rgba(245,245,245,${Math.max(0, 0.32 - age * 0.18)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  const scale = 1 + kick * 0.06;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(scale, scale);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "500 200px Poppins";
  ctx.fillStyle = "#f5f5f5";
  ctx.globalAlpha = Math.min(1, sinceBar * 8);
  ctx.fillText(chord.name, 0, 0);
  ctx.restore();
  ctx.globalAlpha = 1;

  const steps = 16;
  const left = 240;
  const width = W - 480;
  const step = Math.floor((t % (BAR * 2)) / (BEAT / 2));
  for (let i = 0; i < steps; i += 1) {
    const x = left + (width / steps) * i + 4;
    const on = i === step % steps;
    const accent = i % 2 === 0;
    ctx.fillStyle = on ? chord.color : accent ? "#2e2e2e" : "#1c1c1c";
    ctx.beginPath();
    ctx.roundRect(x, H - 120, width / steps - 8, on ? 36 : 24, 6);
    ctx.fill();
  }

  ctx.font = '400 22px "DM Mono"';
  ctx.textAlign = "left";
  ctx.fillStyle = "#a3a3a3";
  ctx.fillText("120 BPM · 4/4", 60, 70);
  ctx.textAlign = "right";
  ctx.fillText(
    `BAR ${Math.floor(t / BAR) + 1} · BEAT ${Math.floor(sinceBar / BEAT) + 1}`,
    W - 60,
    70,
  );
  ctx.textAlign = "left";
  for (const [i, c] of chords.entries()) {
    ctx.fillStyle = i === bar ? c.color : "#525252";
    ctx.fillText(c.name, 60 + i * 110, H - 56);
  }
});
