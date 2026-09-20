export const controllerSource = String.raw`
(() => {
  if (!window.process) window.process = { env: { NODE_ENV: "production" } };
  const state = {
    ready: false,
    readyPromise: null,
    controls: {},
    tracks: [],
    media: [],
    renderers: new Set(),
    scriptErrors: [],
    prepared: 0,
    sought: 0,
    playing: false,
    loop: false,
    playOriginPerf: 0,
    playOriginTime: 0,
    raf: 0,
    postedReady: false,
    seekSerial: Promise.resolve(),
  };

  function reportScriptError(error) {
    const message = String(error || "script error");
    state.scriptErrors.push(message);
    window.parent.postMessage({ source: "automedia", type: "runtime-error", message }, "*");
  }

  window.addEventListener("error", (event) => {
    reportScriptError(event.message || event.error || "script error");
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportScriptError(event.reason);
  });

  function isCompositorRuntime() {
    return document.documentElement.dataset.automediaCompositor === "true";
  }

  function composition() {
    const root = document.documentElement;
    return {
      fps: Number(root.dataset.automediaFps || 30),
      width: Number(root.dataset.automediaWidth || 800),
      height: Number(root.dataset.automediaHeight || 600),
      durationSeconds: Number(root.dataset.automediaDuration || 3),
    };
  }

  function clampTime(timeSeconds) {
    const duration = composition().durationSeconds;
    return Math.min(duration, Math.max(0, timeSeconds));
  }

  function frameFromTime(timeSeconds) {
    const metrics = composition();
    return Math.min(
      Math.max(1, Math.round(metrics.durationSeconds * metrics.fps)) - 1,
      Math.max(0, Math.round(timeSeconds * metrics.fps)),
    );
  }

  function trackActive(track, timeSeconds) {
    return timeSeconds >= track.start && timeSeconds < track.start + track.duration;
  }

  function applyControlValues() {
    const root = document.documentElement;
    for (const [id, value] of Object.entries(state.controls)) {
      root.style.setProperty("--" + id, String(value));
    }
  }

  function documentValues() {
    const element = document.getElementById("automedia-documents");
    if (!element) return { tracks: [], controls: [] };
    try {
      const parsed = JSON.parse(element.textContent || "{}");
      return {
        tracks: Array.isArray(parsed.tracks) ? parsed.tracks : [],
        controls: Array.isArray(parsed.controls) ? parsed.controls : [],
      };
    } catch (error) {
      state.scriptErrors.push(String(error));
      return { tracks: [], controls: [] };
    }
  }

  function mediaAssetUrl(asset) {
    const id = document.documentElement.dataset.automediaId || "";
    return (
      location.origin +
      "/compositions/" +
      encodeURIComponent(id) +
      "/content/assets/" +
      encodeURIComponent(asset)
    );
  }

  function nestedRuntimes() {
    if (!isCompositorRuntime()) return [];
    const runtimes = [];
    for (const iframe of document.querySelectorAll(".block-frame, .music-frame")) {
      try {
        const automedia = iframe.contentWindow && iframe.contentWindow.automedia;
        if (automedia) runtimes.push(automedia);
      } catch (error) {
        state.scriptErrors.push(String(error));
      }
    }
    return runtimes;
  }

  async function waitForNestedRuntimes() {
    if (!isCompositorRuntime()) return;
    const frames = Array.from(document.querySelectorAll(".block-frame, .music-frame"));
    if (frames.length === 0) return;
    const deadline = performance.now() + 5000;
    while (performance.now() < deadline) {
      const runtimes = nestedRuntimes();
      if (runtimes.length === frames.length) {
        await Promise.all(
          runtimes.map((runtime) =>
            Promise.race([
              runtime.ready(),
              new Promise((resolve) => window.setTimeout(resolve, 5000)),
            ]),
          ),
        );
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 16));
    }
  }

  function disposeMedia() {
    for (const entry of state.media) {
      entry.element.pause();
      if (entry.constructed) {
        entry.element.removeAttribute("src");
        if (entry.element instanceof HTMLVideoElement) entry.element.remove();
      }
    }
    state.media = [];
  }

  function pauseDocumentFrames() {
    for (const iframe of document.querySelectorAll(".block-frame, .music-frame")) {
      iframe.contentWindow?.postMessage({ source: "automedia", type: "pause" }, "*");
    }
  }

  async function syncDocumentFrames(timeSeconds, wait, startFrames = false) {
    const frames = Array.from(document.querySelectorAll(".block-frame, .music-frame"));
    for (const iframe of frames) {
      const track = state.tracks.find((item) => item.id === iframe.dataset.track);
      const active =
        track && timeSeconds >= track.start && timeSeconds < track.start + track.duration;
      iframe.dataset.active = active ? "true" : "false";
      if (!active || !iframe.contentWindow) continue;
      const local = track.trimStart + (timeSeconds - track.start) * track.rate;
      const frame = Math.round(local * composition().fps);
      const nested = iframe.contentWindow.automedia;
      if (nested && wait) {
        await nested.seek(local, frame);
      } else {
        iframe.contentWindow.postMessage(
          { source: "automedia", type: "seek", timeSeconds: local, frame },
          "*",
        );
      }
      iframe.contentWindow.postMessage(
        {
          source: "automedia",
          type: "gain",
          volume: track.volume,
          mute: track.mute,
        },
        "*",
      );
      if (startFrames) {
        iframe.contentWindow.postMessage({ source: "automedia", type: "play" }, "*");
      }
    }
  }

  function syncVisualLayers(timeSeconds) {
    for (const layer of document.querySelectorAll(".image-layer, .video-layer")) {
      const track = state.tracks.find((item) => item.id === layer.dataset.track);
      layer.dataset.active = track && trackActive(track, timeSeconds) ? "true" : "false";
    }
  }

  function prepareTrack(track) {
    if (track.kind === "block" || track.kind === "music" || track.kind === "image") return;
    const candidate = document.querySelector('[data-automedia-media-id="' + track.id + '"]');
    let element = candidate instanceof HTMLMediaElement ? candidate : null;
    let constructed = false;
    if (!element && isCompositorRuntime()) {
      if (track.kind === "audio") {
        element = new Audio(mediaAssetUrl(track.asset));
        constructed = true;
      } else if (track.kind === "video") {
        element = document.createElement("video");
        element.className = "video-layer";
        element.dataset.track = track.id;
        element.dataset.automediaMediaId = track.id;
        element.playsInline = true;
        element.src = mediaAssetUrl(track.asset);
        const stack = document.getElementById("stack");
        if (stack) stack.appendChild(element);
        constructed = true;
      }
    }
    if (!element) return;
    const source = mediaAssetUrl(track.asset);
    if (!element.getAttribute("src")) element.src = source;
    element.preload = "auto";
    element.dataset.automediaStart = String(track.start);
    element.dataset.automediaDuration = String(track.duration);
    element.dataset.automediaTrimStart = String(track.trimStart);
    element.dataset.automediaRate = String(track.rate);
    element.playbackRate = track.rate;
    element.muted = track.mute;
    element.volume = track.volume;
    state.media.push({ track, element, constructed });
  }

  async function waitForMedia(entry, targetTime) {
    const element = entry.element;
    if (state.playing) return;
    if (element.readyState < 2) {
      await new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          element.removeEventListener("canplay", onReady);
          element.removeEventListener("error", onError);
          reject(new Error("media readiness timed out"));
        }, 2000);
        const onReady = () => {
          window.clearTimeout(timeout);
          element.removeEventListener("error", onError);
          resolve();
        };
        const onError = () => {
          window.clearTimeout(timeout);
          element.removeEventListener("canplay", onReady);
          reject(new Error("media failed"));
        };
        element.addEventListener("canplay", onReady, { once: true });
        element.addEventListener("error", onError, { once: true });
      });
    }
    if (state.playing) return;
    const frameWait =
      element instanceof HTMLVideoElement &&
      typeof element.requestVideoFrameCallback === "function"
        ? scheduleVideoFrame(element)
        : null;
    element.pause();
    try {
      element.currentTime = targetTime;
    } catch (error) {
      frameWait?.cancel();
      await frameWait?.promise.catch(() => {});
      throw error;
    }
    const deadline = performance.now() + 2000;
    while (
      (element.readyState < 2 || Math.abs(element.currentTime - targetTime) > 0.001) &&
      performance.now() < deadline
    ) {
      if (state.playing) {
        frameWait?.cancel();
        await frameWait?.promise.catch(() => {});
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 8));
    }
    if (element.readyState < 2 || Math.abs(element.currentTime - targetTime) > 0.001) {
      frameWait?.cancel();
      await frameWait?.promise.catch(() => {});
      throw new Error("media seek timed out");
    }
    if (frameWait) await frameWait.promise.catch(() => {});
    state.sought += 1;
  }

  function scheduleVideoFrame(element) {
    let settled = false;
    let frameHandle = 0;
    let timeoutHandle = 0;
    let resolvePromise;
    let rejectPromise;
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    void promise.catch(() => {});
    const finish = (error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutHandle);
      if (error) {
        rejectPromise(error);
      } else {
        resolvePromise();
      }
    };
    frameHandle = element.requestVideoFrameCallback(() => finish());
    timeoutHandle = window.setTimeout(
      () => finish(new Error("video frame callback timed out")),
      2000,
    );
    return {
      promise,
      cancel() {
        if (settled) return;
        if (typeof element.cancelVideoFrameCallback === "function") {
          element.cancelVideoFrameCallback(frameHandle);
        }
        finish(new Error("video frame callback canceled"));
      },
    };
  }

  async function seekMedia(timeSeconds) {
    for (const entry of state.media) {
      if (!trackActive(entry.track, timeSeconds)) {
        entry.element.pause();
        entry.active = false;
        continue;
      }
      const targetTime =
        entry.track.trimStart + (timeSeconds - entry.track.start) * entry.track.rate;
      try {
        await waitForMedia(entry, targetTime);
      } catch {
        try {
          entry.element.currentTime = targetTime;
        } catch {
          // Keep seeking other tracks if one clip cannot decode or seek.
        }
      }
      entry.active = false;
    }
  }

  function syncPlayingMedia(timeSeconds) {
    for (const entry of state.media) {
      const active = trackActive(entry.track, timeSeconds);
      if (!active) {
        entry.element.pause();
        entry.active = false;
        continue;
      }
      if (!entry.active) {
        try {
          entry.element.currentTime =
            entry.track.trimStart + (timeSeconds - entry.track.start) * entry.track.rate;
        } catch {
          // HAVE_NOTHING; play() still starts the clock.
        }
        void entry.element.play().catch(() => {});
        entry.active = true;
      }
    }
  }

  function rawPlayTime() {
    if (!state.playing) return Number(document.documentElement.dataset.automediaTime || 0);
    return state.playOriginTime + (performance.now() - state.playOriginPerf) / 1000;
  }

  function currentPlayTime() {
    return clampTime(rawPlayTime());
  }

  function wrapPlayhead(rawSeconds, durationSeconds) {
    if (rawSeconds < durationSeconds) {
      return { timeSeconds: rawSeconds, playing: true, wrapped: false };
    }
    if (state.loop && durationSeconds > 0) {
      return { timeSeconds: rawSeconds % durationSeconds, playing: true, wrapped: true };
    }
    return { timeSeconds: durationSeconds, playing: false, wrapped: false };
  }

  function postTime(timeSeconds, playing) {
    document.documentElement.dataset.automediaTime = String(timeSeconds);
    window.parent.postMessage(
      {
        source: "automedia",
        type: "time",
        timeSeconds,
        frame: frameFromTime(timeSeconds),
        playing,
      },
      "*",
    );
  }

  function stopAnimationLoop() {
    if (state.raf) window.cancelAnimationFrame(state.raf);
    state.raf = 0;
  }

  function animationLoop() {
    if (!state.playing) return;
    const duration = composition().durationSeconds;
    const next = wrapPlayhead(rawPlayTime(), duration);
    if (next.wrapped) {
      startPlayback(next.timeSeconds);
      postTime(next.timeSeconds, true);
      return;
    }
    if (!next.playing) {
      state.playing = false;
      stopAnimationLoop();
      for (const animation of document.getAnimations({ subtree: true })) animation.pause();
      for (const entry of state.media) {
        entry.element.pause();
        entry.active = false;
      }
      syncVisualLayers(next.timeSeconds);
      pauseDocumentFrames();
      postTime(next.timeSeconds, false);
      return;
    }
    syncVisualLayers(next.timeSeconds);
    syncPlayingMedia(next.timeSeconds);
    void syncDocumentFrames(next.timeSeconds, false);
    postTime(next.timeSeconds, true);
    state.raf = window.requestAnimationFrame(animationLoop);
  }

  function startPlayback(timeSeconds) {
    const duration = composition().durationSeconds;
    let origin = clampTime(timeSeconds);
    if (state.loop && duration > 0 && origin >= duration) origin = 0;
    state.playOriginPerf = performance.now();
    state.playOriginTime = origin;
    state.playing = true;
    for (const animation of document.getAnimations({ subtree: true })) {
      animation.currentTime = origin * 1000;
      animation.play();
    }
    for (const entry of state.media) entry.active = false;
    syncVisualLayers(origin);
    syncPlayingMedia(origin);
    void syncDocumentFrames(origin, false, true);
    stopAnimationLoop();
    state.raf = window.requestAnimationFrame(animationLoop);
  }

  async function waitForPageReady() {
    const deadline = performance.now() + 5000;
    while (document.readyState !== "complete" && performance.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 16));
    }
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  const automedia = {
    ready() {
      if (state.ready) return Promise.resolve();
      if (!state.readyPromise) {
        state.readyPromise = waitForPageReady().then(async () => {
          disposeMedia();
          const documents = documentValues();
          state.tracks = documents.tracks;
          state.controls = Object.fromEntries(
            documents.controls.map((control) => [control.id, control.value]),
          );
          for (const track of state.tracks) prepareTrack(track);
          state.prepared = state.media.length;
          applyControlValues();
          await waitForNestedRuntimes();
          state.ready = true;
          if (!state.postedReady) {
            state.postedReady = true;
            window.parent.postMessage(
              {
                source: "automedia",
                type: "ready",
                scriptErrors: automedia.getDiagnostics().scriptErrors,
              },
              "*",
            );
          }
        });
      }
      return state.readyPromise;
    },
    async seek(timeSeconds, frame) {
      await automedia.ready();
      pauseDocumentFrames();
      const metrics = composition();
      const resolvedTime = clampTime(timeSeconds);
      const resolvedFrame = frame ?? frameFromTime(resolvedTime);
      const animations = document.getAnimations({ subtree: true });
      for (const animation of animations) {
        animation.pause();
        animation.currentTime = resolvedTime * 1000;
      }
      syncVisualLayers(resolvedTime);
      await seekMedia(resolvedTime);
      await syncDocumentFrames(resolvedTime, true);
      document.documentElement.dataset.automediaTime = String(resolvedTime);
      const context = {
        timeSeconds: resolvedTime,
        timeMs: resolvedTime * 1000,
        frame: resolvedFrame,
        fps: metrics.fps,
        width: metrics.width,
        height: metrics.height,
        durationSeconds: metrics.durationSeconds,
        controls: { ...state.controls },
      };
      for (const renderer of state.renderers) {
        await renderer(context);
      }
    },
    async setControls(values) {
      const wasPlaying = state.playing;
      const timeSeconds = currentPlayTime();
      if (wasPlaying) {
        state.playing = false;
        stopAnimationLoop();
      }
      state.controls = { ...state.controls, ...values };
      applyControlValues();
      if (isCompositorRuntime()) {
        await waitForNestedRuntimes();
        for (const runtime of nestedRuntimes()) {
          await runtime.setControls(values);
        }
      }
      await automedia.seek(timeSeconds, frameFromTime(timeSeconds));
      if (wasPlaying) startPlayback(timeSeconds);
    },
    registerRenderer(renderer) {
      state.renderers.add(renderer);
      return () => state.renderers.delete(renderer);
    },
    getDiagnostics() {
      let rendererCount = state.renderers.size;
      const scriptErrors = [...state.scriptErrors];
      for (const runtime of nestedRuntimes()) {
        const nested = runtime.getDiagnostics();
        rendererCount += nested.rendererCount;
        scriptErrors.push(...nested.scriptErrors);
      }
      return {
        seekApi: typeof automedia.seek === "function",
        controlApi: typeof automedia.setControls === "function",
        rendererCount,
        scriptErrors,
      };
    },
    getMediaDiagnostics() {
      let prepared = state.prepared;
      let sought = state.sought;
      for (const runtime of nestedRuntimes()) {
        const nested = runtime.getMediaDiagnostics();
        prepared += nested.prepared;
        sought += nested.sought;
      }
      return { prepared, sought };
    },
  };

  window.automedia = automedia;

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || message.source !== "automedia") return;
    if (message.type === "runtime-error") {
      if (!isCompositorRuntime()) return;
      const fromDocumentFrame = Array.from(
        document.querySelectorAll(".block-frame, .music-frame"),
      ).some((iframe) => event.source === iframe.contentWindow);
      if (fromDocumentFrame) window.parent.postMessage(message, "*");
      return;
    }
    if (event.source !== window.parent) return;
    if (message.type === "loop") {
      state.loop = Boolean(message.enabled);
      return;
    }
    if (message.type === "play") {
      void automedia.ready().then(() => {
        const duration = composition().durationSeconds;
        let timeSeconds = Number(document.documentElement.dataset.automediaTime || 0);
        if (state.loop && duration > 0 && timeSeconds >= duration) timeSeconds = 0;
        startPlayback(timeSeconds);
      });
      return;
    }
    if (message.type === "pause") {
      const next = wrapPlayhead(rawPlayTime(), composition().durationSeconds);
      state.playing = false;
      stopAnimationLoop();
      pauseDocumentFrames();
      if (next.playing || next.timeSeconds < composition().durationSeconds) {
        void automedia.seek(next.timeSeconds, frameFromTime(next.timeSeconds));
      }
      return;
    }
    if (message.type === "seek") {
      state.playing = false;
      stopAnimationLoop();
      pauseDocumentFrames();
      const task = () => automedia.seek(Number(message.timeSeconds), Number(message.frame));
      state.seekSerial = state.seekSerial.then(task, task);
      return;
    }
    if (message.type === "controls") {
      void automedia.setControls(message.values || {});
      return;
    }
    if (message.type === "documents") {
      const wasPlaying = state.playing;
      const timeSeconds = currentPlayTime();
      state.playing = false;
      stopAnimationLoop();
      if (wasPlaying) postTime(timeSeconds, false);
      disposeMedia();
      state.ready = false;
      state.readyPromise = null;
      const element = document.getElementById("automedia-documents");
      if (element) {
        element.textContent = JSON.stringify({
          compositionId: document.documentElement.dataset.automediaId || "",
          tracks: message.tracks || [],
          controls: message.controls || [],
        });
      }
      void automedia
        .ready()
        .then(() => automedia.seek(timeSeconds, frameFromTime(timeSeconds)))
        .catch(() => {})
        .then(() => {
          if (wasPlaying) startPlayback(timeSeconds);
        });
    }
  });

  void automedia.ready();
})();
`;
