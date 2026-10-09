const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");
const W = 1280;
const H = 720;
const COUNT = 6000;

let seed = 7;
const random = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

const palette = ["#3B82F6", "#06B6D4", "#A855F7", "#F43F5E", "#F5F5F5"];
const particles = Array.from({ length: COUNT }, () => {
  const ring = random();
  return {
    radius: 70 + ring ** 0.8 * 400,
    speed: (0.25 + random() * 0.35) * (random() < 0.5 ? 1 : -1),
    phase: random() * Math.PI * 2,
    lobes: 2 + Math.floor(random() * 4),
    wobble: 0.08 + random() * 0.22,
    tilt: 0.34 + random() * 0.18,
    size: 0.9 + random() ** 3 * 2.6,
    color: palette[Math.floor(random() * palette.length)],
  };
});

window.automedia.registerRenderer(({ timeSeconds: t, durationSeconds }) => {
  const loop = (t / durationSeconds) * Math.PI * 2;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 320);
  glow.addColorStop(0, "rgba(59,130,246,0.22)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.globalCompositeOperation = "lighter";
  const at = (p, phase) => {
    const a = p.phase + phase * (Math.round(p.speed * 4) / 2);
    const r = p.radius * (1 + p.wobble * Math.sin(a * p.lobes + phase * 2));
    const spin = phase * 0.5;
    return [
      W / 2 + Math.cos(a + spin) * r,
      H / 2 + Math.sin(a + spin) * r * p.tilt,
      Math.sin(a + spin),
    ];
  };
  ctx.lineCap = "round";
  for (const p of particles) {
    const [x, y, z] = at(p, loop);
    const [tx, ty] = at(p, loop - 0.018);
    const depth = 0.55 + 0.45 * z;
    ctx.globalAlpha = 0.3 + depth * 0.7;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = p.size * (0.6 + depth * 0.8);
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
});
