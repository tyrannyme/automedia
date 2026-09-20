import { describe, expect, it } from "vitest";
import { controllerSource, importMapJson, injectRuntime } from "./runtime.ts";

describe("injected runtime", () => {
  it("embeds media and controls documents with the composition identity", () => {
    const html = injectRuntime(
      "<!doctype html><html><head></head><body></body></html>",
      {
        id: "clock",
        width: 640,
        height: 360,
        fps: 30,
        durationSeconds: 3,
        background: "#101018",
      },
      {
        tracks: [
          {
            id: "track-audio",
            kind: "audio",
            asset: "beat-ident.ogg",
            start: 0,
            duration: 3,
            trimStart: 0,
            rate: 1,
            volume: 1,
            mute: false,
            lane: 0,
          },
        ],
        controls: [
          {
            id: "gain",
            type: "range",
            label: "Gain",
            value: 1,
            min: 0,
            max: 2,
            step: 0.1,
          },
        ],
      },
    );

    expect(html).toContain('id="automedia-documents"');
    expect(html).toContain("track-audio");
    expect(html).toContain("gain");
    expect(html).toContain('data-automedia-id="clock"');
    expect(html).toContain('addEventListener("message"');
    expect(html).not.toContain("data-automedia-compositor");
  });

  it("keeps the compositor marker when injecting the runtime shell", () => {
    const html = injectRuntime(
      '<!doctype html><html lang="en" data-automedia-compositor="true"><head></head><body></body></html>',
      {
        id: "clock",
        width: 640,
        height: 360,
        fps: 30,
        durationSeconds: 3,
        background: "#101018",
      },
    );
    expect(html).toContain('data-automedia-compositor="true"');
  });

  it("includes owned media seeking and animation support in the controller", () => {
    expect(controllerSource).toContain("new Audio");
    expect(controllerSource).toContain("window.process");
    expect(controllerSource).toContain("requestVideoFrameCallback");
    expect(controllerSource).toContain("getAnimations");
    expect(controllerSource).toContain('document.readyState !== "complete"');
    expect(controllerSource).toContain(
      "document.documentElement.dataset.automediaTime = String(timeSeconds)",
    );
    expect(controllerSource).toContain("waitForNestedRuntimes");
    expect(controllerSource).toContain("nestedRuntimes");
    expect(controllerSource).toContain("mediaAssetUrl");
    expect(controllerSource).toContain("isCompositorRuntime");
    expect(controllerSource).toContain('dataset.automediaCompositor === "true"');
    expect(controllerSource).not.toContain("window === window.top");
    expect(controllerSource).toContain("await runtime.setControls(values)");
    expect(controllerSource).toContain("window.requestAnimationFrame(() => resolve())");
    expect(controllerSource).toContain("Promise.race");
    expect(controllerSource).not.toContain("click-toggle");
    expect(controllerSource).toContain("media seek timed out");
    expect(controllerSource).toContain("media readiness timed out");
    expect(controllerSource).toContain("video frame callback timed out");
    expect(controllerSource).not.toContain(".then(() => state.seekSerial)");
    expect(controllerSource).toContain("if (frameWait) await frameWait.promise.catch");
    expect(importMapJson()).toContain('"framer-motion/dom"');
    expect(importMapJson()).toContain('"@strudel/web"');
    expect(importMapJson()).toContain("/runtime/assets/@strudel/web/dist/index.mjs");
    expect(importMapJson()).toContain('"vgpu"');
    expect(importMapJson()).toContain("/runtime/assets/vgpu/dist/index.js");
    expect(importMapJson()).toContain('"@vgpu/wgsl/reflect-source"');
    expect(controllerSource).toContain(
      'track.kind === "block" || track.kind === "music" || track.kind === "image"',
    );
    expect(controllerSource).toContain("syncVisualLayers");
    expect(controllerSource).toContain(".image-layer, .video-layer");
    expect(controllerSource).toContain('createElement("video")');
    expect(controllerSource).toContain('type: "gain"');
    expect(controllerSource).toContain("pauseDocumentFrames");
    expect(controllerSource).toContain("if (startFrames)");
    expect(controllerSource).not.toContain(
      "if (state.playing) {\n        iframe.contentWindow.postMessage",
    );
    expect(controllerSource).toContain("state.loop");
    expect(controllerSource).toContain('message.type === "loop"');
    expect(controllerSource).toContain('type: "runtime-error"');
    expect(controllerSource).toContain("fromDocumentFrame");
    expect(controllerSource).toContain("scriptErrors: automedia.getDiagnostics().scriptErrors");
    expect(controllerSource).toContain("rawSeconds % durationSeconds");
    expect(controllerSource).toContain("animation.currentTime = origin * 1000");
    expect(controllerSource).not.toContain(
      "void automedia.seek(timeSeconds, frameFromTime(timeSeconds))",
    );
    expect(controllerSource.indexOf("const frameWait =")).toBeLessThan(
      controllerSource.indexOf("element.currentTime = targetTime"),
    );
  });
});
