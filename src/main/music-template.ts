export const defaultMusicPattern = `import { add, note, perlin, sine, stack, voicings } from "@strudel/web";

// Official Strudel getting-started showcase, rewritten onto built-in synths.
export default function pattern(gain) {
  const drums = stack(
    note("c1").s("sine").struct("x").decay(0.14).sustain(0).gain(0.5 * gain),
    note("g2")
      .s("triangle")
      .struct("[~ <x!3 x(3,4,2)>]")
      .decay(0.08)
      .sustain(0)
      .gain(0.28 * gain),
    note("c6").s("square").struct("x*8").decay(0.025).sustain(0).lpf(9000).gain(0.07 * gain),
  );
  const bass = note("<a1 b1*2 a1(3,8) e2>")
    .off(1 / 8, (x) => x.add(12).degradeBy(0.5))
    .add(perlin.range(0, 0.5))
    .superimpose(add(0.05))
    .decay(0.15)
    .sustain(0)
    .s("sawtooth")
    .gain(0.32 * gain)
    .cutoff(sine.slow(7).range(300, 5000));
  const chords = voicings("lefthand", "<Am7!3 <Em7 E7b13 Em7 Ebm7b5>>")
    .superimpose((x) => x.add(0.04))
    .add(perlin.range(0, 0.5))
    .note()
    .s("sawtooth")
    .gain(0.12 * gain)
    .cutoff(500)
    .attack(1);
  return stack(drums, bass, chords).slow(3 / 2);
}
`;

export function musicRuntimeHtml(title: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <script type="module" src="script.js"></script>
  </body>
</html>
`;
}

export const musicRuntimeCss = `html,
body {
  margin: 0;
  overflow: hidden;
  background: transparent;
}
`;

export const musicRuntimeJs = `import { getAudioContext, hush, initAudio, initStrudel } from "@strudel/web";
import authored from "./pattern.js";

await initStrudel();

let playing = false;
let playRequested = false;
let lastGain = 1;
let generation = 0;
let startPromise = null;

function selfTrack() {
  const element = document.getElementById("automedia-documents");
  if (!element) return null;
  try {
    const parsed = JSON.parse(element.textContent || "{}");
    const tracks = Array.isArray(parsed.tracks) ? parsed.tracks : [];
    return (
      tracks.find(
        (track) => track.kind === "music" && location.pathname.includes("/music/" + track.asset + "/"),
      ) ?? null
    );
  } catch {
    return null;
  }
}

function patternGain() {
  const track = selfTrack();
  if (!track || track.mute) return 0;
  return Math.max(0, Math.min(1, Number(track.volume ?? 1)));
}

function voice(gain) {
  return typeof authored === "function" ? authored(gain) : authored;
}

async function start() {
  playRequested = true;
  const gain = patternGain();
  if (gain === 0) {
    stop();
    return;
  }
  if (playing && gain === lastGain) return;
  if (startPromise) return startPromise;

  const requestGeneration = generation;
  startPromise = (async () => {
    await initAudio();
    await getAudioContext().resume();
    if (!playRequested || generation !== requestGeneration) return;
    hush();
    voice(gain).play();
    lastGain = gain;
    playing = true;
  })();

  try {
    await startPromise;
  } finally {
    startPromise = null;
    if (playRequested && !playing && generation !== requestGeneration) void start();
  }
}

function stop() {
  playRequested = false;
  generation += 1;
  hush();
  playing = false;
}

window.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || message.source !== "automedia") return;
  if (message.type === "play") void start();
  if (message.type === "pause") stop();
  if (message.type === "gain") {
    if (message.mute || message.volume === 0) stop();
    else if (playing) void start();
  }
});
`;

type MusicRuntimeFile = {
  contentType: string;
  content: string;
};

export function musicRuntimeFile(kind: "html" | "css" | "js", title: string): MusicRuntimeFile {
  if (kind === "html") {
    return { contentType: "text/html; charset=utf-8", content: musicRuntimeHtml(title) };
  }
  if (kind === "css") {
    return { contentType: "text/css; charset=utf-8", content: musicRuntimeCss };
  }
  return { contentType: "text/javascript; charset=utf-8", content: musicRuntimeJs };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
