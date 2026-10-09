await document.fonts.ready;

const svg = document.getElementById("chart");
const total = document.getElementById("total");
const NS = "http://www.w3.org/2000/svg";
const box = { left: 140, right: 1200, top: 230, bottom: 640 };
const weeks = 16;
const max = 1400;

const series = [
  {
    color: "#3b82f6",
    values: [120, 180, 170, 260, 310, 300, 420, 470, 520, 610, 700, 760, 880, 990, 1120, 1290],
  },
  {
    color: "#22c55e",
    values: [60, 90, 140, 150, 210, 260, 250, 330, 390, 420, 480, 560, 600, 690, 760, 840],
  },
  {
    color: "#f97316",
    values: [200, 210, 190, 230, 220, 260, 240, 280, 300, 290, 330, 340, 360, 380, 400, 430],
  },
];

const clamp = (v) => Math.min(1, Math.max(0, v));
const ease = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const outBack = (t) => 1 + 2.7 * (clamp(t) - 1) ** 3 + 1.7 * (clamp(t) - 1) ** 2;
const span = (t, a, b) => clamp((t - a) / (b - a));
const x = (i) => box.left + ((box.right - box.left) * i) / (weeks - 1);
const y = (v) => box.bottom - ((box.bottom - box.top) * v) / max;
const el = (name, attrs, parent = svg) => {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  parent.appendChild(node);
  return node;
};

function smooth(points) {
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const mid = (x0 + x1) / 2;
    d += ` C${mid},${y0} ${mid},${y1} ${x1},${y1}`;
  }
  return d;
}

const defs = el("defs", {});
const grid = [];
for (let v = 0; v <= max; v += 350) {
  grid.push([
    el("line", { x1: box.left, x2: box.right, y1: y(v), y2: y(v), stroke: "#1f1f1f" }),
    el("text", { x: box.left - 18, y: y(v) + 5, "text-anchor": "end" }),
  ]);
  grid.at(-1)[1].textContent = v.toLocaleString("en-US");
}

const lines = series.map((s, index) => {
  const gradient = el("linearGradient", { id: `fill${index}`, x1: 0, x2: 0, y1: 0, y2: 1 }, defs);
  el("stop", { offset: "0%", "stop-color": s.color, "stop-opacity": 0.28 }, gradient);
  el("stop", { offset: "100%", "stop-color": s.color, "stop-opacity": 0 }, gradient);
  const points = s.values.map((v, i) => [x(i), y(v)]);
  const d = smooth(points);
  const area = el("path", {
    d: `${d} L${box.right},${box.bottom} L${box.left},${box.bottom} Z`,
    fill: `url(#fill${index})`,
  });
  const clip = el("clipPath", { id: `reveal${index}` }, defs);
  const rect = el("rect", { x: box.left - 10, y: 0, width: 0, height: 720 }, clip);
  area.setAttribute("clip-path", `url(#reveal${index})`);
  const line = el("path", {
    d,
    fill: "none",
    stroke: s.color,
    "stroke-width": 4,
    "stroke-linecap": "round",
  });
  const length = line.getTotalLength();
  line.style.strokeDasharray = `${length}`;
  const dot = el("circle", { r: 7, fill: s.color, stroke: "#0a0a0a", "stroke-width": 3 });
  return { line, length, rect, dot, points };
});

const callout = el("g", {});
el("rect", { x: -98, y: -70, width: 196, height: 50, rx: 12, fill: "#f5f5f5" }, callout);
const label = el(
  "text",
  {
    x: 0,
    y: -38,
    "text-anchor": "middle",
    style: "fill:#0a0a0a;font-size:18px",
  },
  callout,
);
label.textContent = "+38% this week";
el("path", { d: "M-8,-21 L8,-21 L0,-11 Z", fill: "#f5f5f5" }, callout);

const final = series.reduce((sum, s) => sum + s.values.at(-1), 0);

window.automedia.registerRenderer(({ timeSeconds: t }) => {
  for (const [i, [line, text]] of grid.entries()) {
    const p = ease(span(t, 0.1 + i * 0.06, 0.6 + i * 0.06));
    line.setAttribute("x2", box.left + (box.right - box.left) * p);
    text.style.opacity = p;
  }
  for (const [i, s] of lines.entries()) {
    const p = ease(span(t, 0.5 + i * 0.35, 3.6 + i * 0.35));
    s.line.style.strokeDashoffset = s.length * (1 - p);
    const head = s.line.getPointAtLength(s.length * p);
    s.rect.setAttribute("width", head.x - box.left + 10);
    s.dot.setAttribute("cx", head.x);
    s.dot.setAttribute("cy", head.y);
    s.dot.style.opacity = p > 0 ? 1 : 0;
  }
  const count = ease(span(t, 0.5, 4.3));
  total.textContent = Math.round(final * count).toLocaleString("en-US");
  const pop = outBack(span(t, 4.4, 4.9));
  const peak = lines[0].points.at(-1);
  callout.setAttribute("transform", `translate(${peak[0] - 40},${peak[1] - 6}) scale(${pop})`);
  callout.style.opacity = clamp(pop * 2);
});
