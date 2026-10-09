const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const swatches = ["#3B82F6", "#22C55E", "#EAB308", "#A855F7", "#F43F5E", "#06B6D4", "#F97316"];
const pad = (n) => String(n).padStart(2, "0");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function element(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === false) continue;
    if (key === "text") node.textContent = value;
    else if (key === "class") node.className = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  node.append(...children);
  return node;
}

function timecode(seconds, fps) {
  const frame = Math.floor(seconds * fps);
  const whole = Math.floor(frame / fps);
  return `${pad(Math.floor(whole / 3600))}:${pad(Math.floor(whole / 60) % 60)}:${pad(whole % 60)}:${pad(frame % fps)}`;
}

function size(bytes) {
  return bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} KB`;
}

// Syntax highlighting: enough for JS, CSS, HTML, WGSL, JSON, and shell.

const keywords = {
  js: "await|async|const|let|var|function|return|if|else|for|of|in|new|import|from|export|default|true|false|null|undefined|continue|break|while|typeof",
  wgsl: "fn|let|var|struct|return|for|if|else|vec2f|vec3f|vec4f|f32|i32|u32|uniform|group|binding|fragment|location",
  css: "from|to|infinite|linear|forwards|both|none|auto|inherit",
  json: "true|false|null",
  sh: "git|cd|pnpm|clone|install|exec",
};

function highlight(source, language) {
  const words = keywords[language] ?? keywords.js;
  const comment =
    language === "html"
      ? "<!--[\\s\\S]*?-->"
      : language === "sh"
        ? "#.*"
        : "\\/\\/.*|\\/\\*[\\s\\S]*?\\*\\/";
  const tag = language === "html" ? "|<\\/?[a-zA-Z][\\w-]*|\\/?>" : "";
  const pattern = new RegExp(
    `(${comment})|("(?:[^"\\\\\\n]|\\\\.)*"|'(?:[^'\\\\\\n]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\`)|(#[0-9a-fA-F]{3,8}\\b|\\b\\d+(?:\\.\\d+)?(?:px|s|ms|deg|%|em|fr)?\\b)|\\b(${words})\\b|([A-Za-z_$][\\w$]*)(?=\\()${tag ? `|(${tag.slice(1)})` : ""}`,
    "g",
  );
  const out = document.createDocumentFragment();
  let last = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index > last) out.append(source.slice(last, match.index));
    const kind = match[1]
      ? "c"
      : match[2]
        ? "s"
        : match[3]
          ? "n"
          : match[4]
            ? "k"
            : match[5]
              ? "f"
              : "t";
    out.append(element("span", { class: `tok-${kind}`, text: match[0] }));
    last = match.index + match[0].length;
  }
  out.append(source.slice(last));
  return out;
}

function languageOf(name) {
  const extension = name.split(".").pop();
  return { js: "js", css: "css", html: "html", wgsl: "wgsl", json: "json" }[extension] ?? "js";
}

for (const code of $$("[data-highlight]")) {
  code.replaceChildren(highlight(code.textContent, code.dataset.highlight));
}

// Videos only play while they are on screen.

const visible = new IntersectionObserver(
  (entries) => {
    for (const { target, isIntersecting } of entries) {
      if (isIntersecting && !reducedMotion) {
        if (target.preload === "none") target.preload = "auto";
        target.play().catch(() => {});
      } else target.pause();
    }
  },
  { rootMargin: "120px" },
);

function video(src, poster, extra = {}) {
  const node = element("video", {
    src,
    poster,
    muted: true,
    loop: true,
    playsinline: true,
    preload: "none",
    ...extra,
  });
  node.muted = true;
  return node;
}

// Showreel: one video element walks through a playlist, and the timeline under it
// shows each piece as a clip with the playhead running across the whole reel.

const reelIds = ["opener", "aurora", "knot", "kinetic", "swarm", "keyframes", "chart"];

function startReel(entries) {
  const stage = $("[data-reel]");
  const figure = $(".reel");
  const lane = $("[data-reel-lane]");
  const playhead = $("[data-reel-playhead]");
  const timeline = $("[data-reel-timeline]");
  const toggle = $("[data-reel-toggle]");
  const clips = reelIds
    .map((id) => entries.find((entry) => entry.id === id))
    .filter(Boolean)
    .map((entry, index) => ({ entry, color: swatches[index % swatches.length] }));
  const total = clips.reduce((sum, clip) => sum + clip.entry.duration, 0);
  let offset = 0;
  for (const clip of clips) {
    clip.start = offset;
    offset += clip.entry.duration;
    clip.button = element("button", {
      class: "clip",
      type: "button",
      text: clip.entry.name,
      title: clip.entry.name,
    });
    clip.button.style.setProperty("--length", clip.entry.duration);
    clip.button.style.setProperty("--color", clip.color);
    clip.button.addEventListener("click", (event) => {
      event.stopPropagation();
      load(clips.indexOf(clip), 0);
    });
    lane.append(clip.button);
  }

  let current = 0;
  let paused = reducedMotion;

  function load(index, at) {
    current = index;
    const clip = clips[index];
    stage.src = `/gallery/${clip.entry.renders[0].media.mp4}`;
    stage.poster = `/gallery/${clip.entry.renders[0].poster}`;
    stage.currentTime = at;
    figure.style.setProperty("--glow", `${clip.color}66`);
    $("[data-reel-name]").textContent = clip.entry.name;
    for (const other of clips) other.button.setAttribute("aria-current", String(other === clip));
    if (!paused) stage.play().catch(() => {});
    const next = clips[(index + 1) % clips.length];
    document.head.append(
      element("link", { rel: "prefetch", href: `/gallery/${next.entry.renders[0].media.mp4}` }),
    );
  }

  function draw() {
    const clip = clips[current];
    const local = Math.min(stage.currentTime || 0, clip.entry.duration);
    const time = clip.start + local;
    const width = timeline.clientWidth - 12;
    playhead.style.setProperty("--x", `${(time / total) * width}px`);
    $("[data-reel-time]").textContent = timecode(time, 30);
    $("[data-reel-frame]").textContent = `${Math.floor(time * 30)} / ${Math.round(total * 30)}`;
    requestAnimationFrame(draw);
  }

  stage.addEventListener("ended", () => load((current + 1) % clips.length, 0));
  timeline.addEventListener("click", (event) => {
    const box = timeline.getBoundingClientRect();
    const time = ((event.clientX - box.left - 6) / (box.width - 12)) * total;
    const index = clips.findLastIndex((clip) => clip.start <= time);
    load(Math.max(0, index), Math.max(0, time - clips[Math.max(0, index)].start));
  });
  function setPaused(value) {
    paused = value;
    if (paused) stage.pause();
    else stage.play().catch(() => {});
    toggle.setAttribute("aria-label", paused ? "Play showreel" : "Pause showreel");
    $("[data-icon=pause]", toggle).hidden = paused;
    $("[data-icon=play]", toggle).hidden = !paused;
  }
  toggle.addEventListener("click", () => setPaused(!paused));
  load(0, 0);
  setPaused(paused);
  draw();
}

// Gallery

function cardMedia(entry) {
  const [first] = entry.renders;
  if (entry.renders.length > 1) {
    const grid = element("div", { class: "variants" });
    for (const render of entry.renders) {
      const node = video(`/gallery/${render.media.mp4}`, `/gallery/${render.poster}`);
      grid.append(node);
      visible.observe(node);
    }
    return grid;
  }
  if (first.media.webp) {
    return element("div", { class: "alpha" }, [
      element("img", {
        src: `/gallery/${first.media.webp}`,
        width: entry.width,
        height: entry.height,
        alt: "",
        loading: "lazy",
      }),
    ]);
  }
  const node = video(`/gallery/${first.media.mp4}`, `/gallery/${first.poster}`, {
    width: entry.width,
    height: entry.height,
  });
  visible.observe(node);
  return node;
}

function renderGallery(entries) {
  const grid = $("[data-gallery]");
  grid.replaceChildren();
  for (const entry of entries) {
    const media = element("div", { class: "card-media" }, [
      cardMedia(entry),
      element("span", { class: "card-open", text: "View source" }),
    ]);
    if (entry.audio) media.append(element("span", { class: "card-sound", text: "♪ Sound" }));
    const card = element(
      "button",
      { class: "card", type: "button", "aria-label": `${entry.name}: view source` },
      [
        media,
        element("div", { class: "card-body" }, [
          element("b", { text: entry.name }),
          element("span", {
            class: "meta",
            text: `${entry.width}×${entry.height} · ${entry.duration}s`,
          }),
          element(
            "ul",
            { class: "card-tags" },
            entry.tags.map((tag) => element("li", { text: tag })),
          ),
        ]),
      ],
    );
    card.addEventListener("click", () => openViewer(entry));
    grid.append(card);
  }
}

// Viewer

const viewer = $("[data-viewer]");

function openViewer(entry) {
  const media = $("[data-viewer-media]");
  media.className = "viewer-media";
  media.replaceChildren();
  if (entry.renders.length > 1) {
    media.classList.add("variants");
    for (const render of entry.renders) {
      const node = video(`/gallery/${render.media.mp4}`, `/gallery/${render.poster}`, {
        autoplay: true,
        preload: "auto",
      });
      const values = Object.entries(render.controls).map(([key, value]) => `${key} ${value}`);
      media.append(
        element("figure", {}, [node, element("figcaption", { text: values.join(" · ") })]),
      );
    }
  } else if (entry.renders[0].media.webp) {
    media.classList.add("alpha");
    media.append(
      element("img", { src: `/gallery/${entry.renders[0].media.webp}`, alt: entry.name }),
    );
  } else {
    const render = entry.renders[0];
    const node = video(`/gallery/${render.media.mp4}`, `/gallery/${render.poster}`, {
      autoplay: true,
      controls: true,
      preload: "auto",
    });
    if (entry.audio) node.muted = false;
    media.append(node);
  }

  $("[data-viewer-title]").textContent = entry.name;
  $("[data-viewer-description]").textContent = entry.description;
  const stats = [
    ["Size", `${entry.width}×${entry.height}`],
    ["Length", `${entry.duration}s at ${entry.fps} fps`],
    ["Rendered", `${entry.renderSeconds}s`],
    ["Output", size(entry.bytes)],
  ];
  $("[data-viewer-stats]").replaceChildren(
    ...stats.flatMap(([term, value]) => [
      element("dt", { text: term }),
      element("dd", { text: value }),
    ]),
  );

  const tabs = $("[data-viewer-tabs]");
  const code = $("[data-viewer-code]");
  const names = Object.keys(entry.sources);
  const select = (name) => {
    for (const button of tabs.children)
      button.setAttribute("aria-selected", String(button.textContent === name));
    code.replaceChildren(highlight(entry.sources[name], languageOf(name)));
    code.parentElement.scrollTop = 0;
  };
  tabs.replaceChildren(
    ...names.map((name) => {
      const button = element("button", { type: "button", role: "tab", text: name });
      button.addEventListener("click", () => select(name));
      return button;
    }),
  );
  select(names[0]);

  $("[data-viewer-actions]").replaceChildren(
    ...entry.renders.flatMap((render) =>
      Object.entries(render.media).map(([format, file]) =>
        element("a", {
          class: "button ghost",
          href: `/gallery/${file}`,
          download: file,
          text:
            entry.renders.length > 1
              ? `${render.name}.${format}`
              : `Download ${format.toUpperCase()}`,
        }),
      ),
    ),
    element("a", {
      class: "button ghost",
      href: `/gallery/${entry.renders[0].poster}`,
      download: true,
      text: "Poster PNG",
    }),
  );

  viewer.showModal();
}

viewer.addEventListener("close", () => {
  if (viewer.open) return;
  for (const node of $$("video", viewer)) node.pause();
  $("[data-viewer-media]").replaceChildren();
});
viewer.addEventListener("click", (event) => {
  if (event.target === viewer) viewer.close();
});
$("[data-viewer-close]").addEventListener("click", () => viewer.close());

fetch("/gallery/gallery.json")
  .then((response) => response.json())
  .then((entries) => {
    renderGallery(entries);
    startReel(entries);
  })
  .catch(() => {
    $("[data-gallery-status]").textContent = "The gallery couldn't load. Try a refresh.";
  });

// Studio tabs

const tabs = $$('.tabs [role="tab"]');
function selectTab(tab) {
  for (const other of tabs) {
    const on = other === tab;
    other.setAttribute("aria-selected", String(on));
    other.tabIndex = on ? 0 : -1;
    document.getElementById(other.getAttribute("aria-controls")).hidden = !on;
  }
}
for (const tab of tabs) tab.addEventListener("click", () => selectTab(tab));
$(".tabs").addEventListener("keydown", (event) => {
  const at = tabs.indexOf(document.activeElement);
  if (at < 0 || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  const next = tabs[(at + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
  selectTab(next);
  next.focus();
});

// Copy buttons

for (const button of $$("[data-copy]")) {
  button.addEventListener("click", async () => {
    await navigator.clipboard.writeText(document.getElementById(button.dataset.copy).textContent);
    button.textContent = "Copied";
    setTimeout(() => (button.textContent = "Copy"), 1600);
  });
}

// The agent transcript plays once when it scrolls into view.

const transcript = $(".transcript");
for (const [index, line] of $$("[data-transcript] li").entries())
  line.style.setProperty("--i", index);
new IntersectionObserver(
  ([entry], observer) => {
    if (!entry.isIntersecting) return;
    transcript.classList.add("play");
    observer.disconnect();
  },
  { threshold: 0.4 },
).observe(transcript);

// Downloads: point at the latest release's files and suggest this platform.

const platform = /Win/.test(navigator.platform)
  ? "windows"
  : /Linux|X11/.test(navigator.userAgent)
    ? "linux"
    : "";
if (platform) {
  $(`[data-platform=${platform}]`).classList.add("suggested");
  $("[data-download-label]").textContent =
    `Download for ${platform === "windows" ? "Windows" : "Linux"}`;
}
if (/Mac/.test(navigator.platform)) {
  $("[data-platform-note]").textContent =
    "No macOS build yet. Automedia runs on macOS from source.";
}

fetch("https://api.github.com/repos/tyrannyme/automedia/releases/latest")
  .then((response) => (response.ok ? response.json() : Promise.reject()))
  .then((release) => {
    for (const node of $$("[data-version]")) node.textContent = release.tag_name;
    for (const code of $$("[data-asset]")) {
      const asset = release.assets.find((item) => item.name.endsWith(code.dataset.asset));
      if (!asset) continue;
      code.textContent = `${asset.name} · ${size(asset.size)}`;
      code.closest("a").href = asset.browser_download_url;
    }
  })
  .catch(() => {});
