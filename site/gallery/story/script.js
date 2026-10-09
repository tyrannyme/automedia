await Promise.all([
  document.fonts.load("600 400px Nunito"),
  document.fonts.load("500 92px Poppins"),
  document.fonts.load('400 26px "DM Mono"'),
]);

const ctx = document.querySelector("canvas").getContext("2d");
const W = 720;
const H = 1280;
const BURST = 3.1;

const clamp = (v) => Math.min(1, Math.max(0, v));
const span = (t, a, b) => clamp((t - a) / (b - a));
const outBack = (t) => 1 + 2.7 * (clamp(t) - 1) ** 3 + 1.7 * (clamp(t) - 1) ** 2;
const outCubic = (t) => 1 - (1 - clamp(t)) ** 3;

let seed = 11;
const random = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const colors = ["#F5F5F5", "#EAB308", "#F43F5E", "#22C55E", "#A855F7", "#06B6D4"];
const confetti = Array.from({ length: 260 }, () => {
  const angle = -Math.PI / 2 + (random() - 0.5) * Math.PI * 1.3;
  const speed = 700 + random() * 1100;
  return {
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    spin: (random() - 0.5) * 18,
    w: 10 + random() * 16,
    h: 6 + random() * 10,
    color: colors[Math.floor(random() * colors.length)],
  };
});

const backgrounds = ["#3B82F6", "#A855F7", "#F43F5E", "#0A0A0A"];

function digit(text, t, start) {
  const local = t - start;
  if (local < 0 || local > 1) return;
  const scale = 0.6 + outBack(span(local, 0, 0.35)) * 0.4 + local * 0.08;
  const fade = 1 - span(local, 0.75, 1);
  ctx.save();
  ctx.translate(W / 2, H / 2 + 40);
  ctx.scale(scale, scale);
  ctx.globalAlpha = fade;
  ctx.font = "600 460px Nunito";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#F5F5F5";
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

window.automedia.registerRenderer(({ timeSeconds: t }) => {
  const step = Math.min(3, Math.floor(Math.max(0, t - 0.1)));
  ctx.fillStyle = backgrounds[step];
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 3; i += 1) {
    const local = t - 0.1 - i;
    if (local < 0 || local > 1) continue;
    const ring = outCubic(span(local, 0, 1));
    ctx.strokeStyle = `rgba(245,245,245,${0.35 * (1 - ring)})`;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2 + 40, 160 + ring * 420, 0, Math.PI * 2);
    ctx.stroke();
  }

  digit("3", t, 0.1);
  digit("2", t, 1.1);
  digit("1", t, 2.1);

  ctx.font = '400 26px "DM Mono"';
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(245,245,245,0.8)";
  ctx.fillText(t < BURST ? "LAUNCHING IN" : "OUT NOW", W / 2, 150);

  const reveal = outBack(span(t, BURST, BURST + 0.6));
  if (t >= BURST) {
    ctx.save();
    ctx.translate(W / 2, H / 2 - 20);
    ctx.scale(reveal, reveal);
    ctx.textAlign = "center";
    ctx.fillStyle = "#F5F5F5";
    ctx.font = "500 100px Poppins";
    ctx.fillText("Automedia", 0, 0);
    ctx.font = "500 100px Poppins";
    ctx.fillStyle = "#EF4444";
    ctx.fillText("0.3", 0, 130);
    ctx.restore();
    const pill = outCubic(span(t, BURST + 0.5, BURST + 1));
    ctx.globalAlpha = pill;
    ctx.fillStyle = "#F5F5F5";
    ctx.beginPath();
    ctx.roundRect(W / 2 - 200, H - 260 + (1 - pill) * 40, 400, 88, 44);
    ctx.fill();
    ctx.fillStyle = "#0A0A0A";
    ctx.font = "500 34px Poppins";
    ctx.fillText("Swipe up", W / 2, H - 204 + (1 - pill) * 40);
    ctx.globalAlpha = 1;
  }

  const age = t - BURST;
  if (age >= 0) {
    for (const piece of confetti) {
      const x = W / 2 + piece.vx * age * Math.exp(-age * 0.9) * 0.8;
      const y = H / 2 + 40 + piece.vy * age * 0.75 + 900 * age * age;
      if (y > H + 40) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(piece.spin * age);
      ctx.scale(1, Math.cos(piece.spin * age * 1.3));
      ctx.fillStyle = piece.color;
      ctx.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
      ctx.restore();
    }
  }
});
