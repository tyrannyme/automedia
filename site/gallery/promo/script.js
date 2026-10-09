await document.fonts.ready;

const spring = "cubic-bezier(0.2, 1.4, 0.4, 1)";
const animations = [];
const add = (element, keyframes, options) => {
  const animation = element.animate(keyframes, { fill: "both", ...options });
  animation.pause();
  animations.push(animation);
};

add(
  document.querySelector("[data-enter]"),
  [
    { opacity: 0, transform: "translateY(40px)" },
    { opacity: 1, transform: "none" },
  ],
  { duration: 700, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
);

for (const [index, blob] of document.querySelectorAll("[data-drift]").entries()) {
  add(
    blob,
    [
      { transform: "translate(0, 0) scale(1)" },
      { transform: `translate(${index ? -120 : 160}px, ${index ? -60 : 90}px) scale(1.2)` },
    ],
    { duration: 7000, easing: "ease-in-out" },
  );
}

const starts = [600, 1300, 2000, 2700, 5200];
for (const [index, call] of document.querySelectorAll(".call").entries()) {
  add(
    call,
    [
      { opacity: 0, transform: "translateX(80px) scale(0.96)" },
      { opacity: 1, transform: "none" },
    ],
    { duration: 600, delay: starts[index], easing: spring },
  );
  const tick = call.querySelector(".tick");
  if (tick) {
    add(tick, [{ opacity: 0 }, { opacity: 1 }], { duration: 250, delay: starts[index] + 450 });
  }
}

const bar = document.getElementById("bar");
const percent = document.getElementById("percent");
add(bar, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
  duration: 2200,
  delay: 3000,
  easing: "cubic-bezier(0.3, 0, 0.3, 1)",
});

window.automedia.registerRenderer(({ timeMs }) => {
  for (const animation of animations) animation.currentTime = timeMs;
  const progress = Math.min(1, Math.max(0, (timeMs - 3000) / 2200));
  percent.textContent = `${Math.round(progress * 100)}%`;
});
