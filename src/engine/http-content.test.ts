import { describe, expect, it } from "vitest";
import type { Composition, MediaDocument } from "@shared/schemas.ts";
import { compositorHtml } from "./http-content.ts";
import { contentTypeFor } from "./http-files.ts";

const composition: Composition = {
  version: 3,
  id: "proof",
  name: "Proof",
  width: 800,
  height: 600,
  fps: 30,
  durationSeconds: 3,
  background: "transparent",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("compositorHtml", () => {
  it("emits a sandboxed iframe per block track and ignores audio", () => {
    const media: MediaDocument = {
      tracks: [
        {
          id: "t-block",
          kind: "block",
          asset: "b-intro",
          name: "Intro",
          start: 0,
          duration: 3,
          trimStart: 0,
          rate: 1,
          volume: 1,
          mute: true,
          lane: 0,
        },
        {
          id: "t-audio",
          kind: "audio",
          asset: "beat-ident.ogg",
          start: 0,
          duration: 3,
          trimStart: 0,
          rate: 1,
          volume: 1,
          mute: false,
          lane: 1,
        },
      ],
      markers: [],
    };
    const html = compositorHtml(composition, media);
    expect(html).toContain('src="blocks/b-intro/index.html"');
    expect(html).toContain('data-track="t-block"');
    expect(html).toContain('data-block="b-intro"');
    expect(html).toContain('sandbox="allow-scripts allow-same-origin"');
    expect(html).toContain('data-automedia-compositor="true"');
    expect(html).not.toContain("beat-ident.ogg");
    expect(html).toContain("background: transparent");
  });

  it("emits a video layer for timeline video clips", () => {
    const media: MediaDocument = {
      tracks: [
        {
          id: "t-video",
          kind: "video",
          asset: "fps-guns.mp4",
          start: 0,
          duration: 2,
          trimStart: 0,
          rate: 1,
          volume: 1,
          mute: true,
          lane: 0,
        },
        {
          id: "t-audio",
          kind: "audio",
          asset: "beat-ident.ogg",
          start: 0,
          duration: 2,
          trimStart: 0,
          rate: 1,
          volume: 1,
          mute: false,
          lane: 1,
        },
      ],
      markers: [],
    };
    const html = compositorHtml(composition, media);
    expect(html).toContain('class="video-layer"');
    expect(html).toContain('data-track="t-video"');
    expect(html).toContain('data-automedia-media-id="t-video"');
    expect(html).toContain('src="assets/fps-guns.mp4"');
    expect(html).toContain("playsinline");
    expect(html).toContain(" muted");
    expect(html).not.toContain("beat-ident.ogg");
  });

  it("emits an image layer for stills and keeps stacking order with blocks", () => {
    const media: MediaDocument = {
      tracks: [
        {
          id: "t-photo",
          kind: "image",
          asset: "poster.png",
          start: 0,
          duration: 3,
          trimStart: 0,
          rate: 1,
          volume: 1,
          mute: true,
          lane: 0,
        },
        {
          id: "t-block",
          kind: "block",
          asset: "b-intro",
          start: 0,
          duration: 3,
          trimStart: 0,
          rate: 1,
          volume: 1,
          mute: true,
          lane: 1,
        },
      ],
      markers: [],
    };
    const html = compositorHtml(composition, media);
    expect(html).toContain('class="image-layer"');
    expect(html).toContain('data-track="t-photo"');
    expect(html).toContain('src="assets/poster.png"');
    expect(html).toContain('src="blocks/b-intro/index.html"');
    expect(html.indexOf('data-track="t-photo"')).toBeLessThan(html.indexOf('data-track="t-block"'));
  });

  it("emits a non-visual runtime iframe for music tracks", () => {
    const media: MediaDocument = {
      tracks: [
        {
          id: "t-music",
          kind: "music",
          asset: "b-theme",
          name: "Theme",
          start: 0,
          duration: 3,
          trimStart: 0,
          rate: 1,
          volume: 1,
          mute: false,
          lane: 0,
        },
      ],
      markers: [],
    };
    const html = compositorHtml(composition, media);
    expect(html).toContain('src="music/b-theme/index.html"');
    expect(html).toContain('class="music-frame"');
    expect(html).toContain('data-track="t-music"');
    expect(html).toContain('data-music="b-theme"');
    expect(html).not.toContain('class="block-frame"');
    expect(html).not.toContain('data-block="b-theme"');
    expect(html).toContain('.music-frame[data-active="true"] { display: block; opacity: 0;');
  });

  it("orders block iframes by lane then start", () => {
    const media: MediaDocument = {
      tracks: [
        {
          id: "t-late",
          kind: "block",
          asset: "b-late",
          start: 3,
          duration: 3,
          trimStart: 0,
          rate: 1,
          volume: 1,
          mute: true,
          lane: 0,
        },
        {
          id: "t-overlay",
          kind: "block",
          asset: "b-overlay",
          start: 0,
          duration: 3,
          trimStart: 0,
          rate: 1,
          volume: 1,
          mute: true,
          lane: 1,
        },
        {
          id: "t-early",
          kind: "block",
          asset: "b-early",
          start: 0,
          duration: 3,
          trimStart: 0,
          rate: 1,
          volume: 1,
          mute: true,
          lane: 0,
        },
      ],
      markers: [],
    };
    const html = compositorHtml(composition, media);
    const early = html.indexOf('data-track="t-early"');
    const late = html.indexOf('data-track="t-late"');
    const overlay = html.indexOf('data-track="t-overlay"');
    expect(early).toBeGreaterThan(-1);
    expect(late).toBeGreaterThan(early);
    expect(overlay).toBeGreaterThan(late);
  });
});

describe("contentTypeFor", () => {
  it("maps known extensions and falls back for unknown ones", () => {
    expect(contentTypeFor(".html")).toBe("text/html; charset=utf-8");
    expect(contentTypeFor(".wgsl")).toBe("text/plain; charset=utf-8");
    expect(contentTypeFor(".mp4")).toBe("video/mp4");
    expect(contentTypeFor(".xyz")).toBe("application/octet-stream");
  });
});
