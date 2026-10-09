const points = [];
for (let i = 0; i < 32; i += 1) {
  const angle = (i / 32) * Math.PI * 2;
  const radius = i % 2 ? 158 : 192;
  points.push(`${200 + Math.cos(angle) * radius},${200 + Math.sin(angle) * radius}`);
}
document.getElementById("burst").setAttribute("d", `M${points.join("L")}Z`);
