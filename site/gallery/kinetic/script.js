import { animate, stagger } from "motion";

await document.fonts.ready;

const scenes = ["#one", "#two", "#three"];
const timeline = [];
for (const [index, id] of scenes.entries()) {
  const at = index * 2;
  timeline.push(
    [
      id,
      { clipPath: ["circle(0% at 50% 50%)", "circle(80% at 50% 50%)"] },
      { at, duration: 0.6, ease: [0.7, 0, 0.2, 1] },
    ],
    [
      `${id} h1 span`,
      { y: [180, 0], rotate: [8, 0], opacity: [0, 1] },
      { at: at + 0.2, duration: 0.7, delay: stagger(0.12), type: "spring", bounce: 0.35 },
    ],
    [`${id} h1`, { scale: [1, 1.06] }, { at: at + 0.4, duration: 1.6, ease: "linear" }],
  );
}
timeline.push([
  "#three p",
  { y: [30, 0], opacity: [0, 1] },
  { at: 4.7, duration: 0.5, ease: "easeOut" },
]);

const playback = animate(timeline);
playback.pause();

window.automedia.registerRenderer(({ timeSeconds }) => {
  playback.time = timeSeconds;
});
