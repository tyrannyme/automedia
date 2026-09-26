import { appendFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@shared/errors.ts";
import { appendActivity } from "./activity.ts";
import { CompositionStore } from "./store.ts";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempStore(): Promise<CompositionStore> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "automedia-store-"));
  dirs.push(dir);
  return new CompositionStore(dir);
}

describe("CompositionStore", () => {
  it("creates a version 3 composition and lists it", async () => {
    const store = await tempStore();
    const created = await store.create("Proof");
    expect(created.version).toBe(3);
    expect(created.width).toBe(800);
    expect(created.durationSeconds).toBe(3);
    const listed = await store.list();
    expect(listed.map((item) => item.id)).toEqual([created.id]);
  });

  it("sets composition duration from the last clip out point", async () => {
    const store = await tempStore();
    const created = await store.create("Proof");
    const block = await store.createBlock(created.id, "Intro");
    expect(block.duration).toBe(3);
    expect(block.start).toBe(0);
    const later = await store.createBlock(created.id, "Later", 1.5);
    expect(later.lane).toBe(block.lane);
    expect(later.start).toBe(3);
    await store.deleteTrack(created.id, later.id);
    await store.putTrack(created.id, { ...block, start: 2, duration: 3 });
    expect((await store.get(created.id)).durationSeconds).toBe(5);
    await store.putTrack(created.id, { ...block, start: 0, duration: 1 });
    expect((await store.get(created.id)).durationSeconds).toBe(1);
    await store.deleteTrack(created.id, block.id);
    expect((await store.get(created.id)).durationSeconds).toBe(3);
  });

  it("duplicates a composition and its block files", async () => {
    const store = await tempStore();
    const created = await store.create("Proof");
    await store.createBlock(created.id, "Intro");
    const copy = await store.duplicate(created.id);
    expect(copy.id).not.toBe(created.id);
    expect(copy.name).toBe("Proof copy");
    const media = await store.getMedia(copy.id);
    expect(media.tracks.some((track) => track.kind === "block")).toBe(true);
  });

  it("reorders the composition list", async () => {
    const store = await tempStore();
    const first = await store.create("One");
    const second = await store.create("Two");
    expect((await store.list()).map((item) => item.id)).toEqual([second.id, first.id]);
    expect((await store.reorder([first.id, second.id])).map((item) => item.id)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it("serializes overlapping writes on one composition", async () => {
    const store = await tempStore();
    const created = await store.create();
    const first = await store.createBlock(created.id, "A");
    const second = await store.createBlock(created.id, "B");
    await Promise.all([
      store.putTrack(created.id, { ...first, name: "A1" }),
      store.putTrack(created.id, { ...second, name: "B1" }),
    ]);
    const media = await store.getMedia(created.id);
    expect(media.tracks.map((track) => track.name).toSorted()).toEqual(["A1", "B1"]);
  });

  it("claims a composition for one holder at a time", async () => {
    const store = await tempStore();
    const created = await store.create();
    expect(store.claim(created.id, "agent-a").holder).toBe("agent-a");
    expect(store.leaseOf(created.id)?.holder).toBe("agent-a");
    await expect(async () => store.claim(created.id, "agent-b")).rejects.toMatchObject({
      code: "composition_busy",
    });
    store.release(created.id, "agent-a");
    expect(store.claim(created.id, "agent-b").holder).toBe("agent-b");
  });

  it("queues edits arriving after a write has already started", async () => {
    const store = await tempStore();
    const created = await store.create();
    const entered = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const get = store.get.bind(store);
    vi.spyOn(store, "get").mockImplementationOnce(async (id) => {
      const snapshot = await get(id);
      entered.resolve();
      await resume.promise;
      return snapshot;
    });
    const rename = store.updateSettings({ compositionId: created.id, name: "Renamed" });
    await entered.promise;
    const resize = store.updateSettings({ compositionId: created.id, width: 1920 });
    resume.resolve();
    await Promise.all([rename, resize]);
    expect(await store.get(created.id)).toMatchObject({ name: "Renamed", width: 1920 });
  });

  it.each(["block", "music"] as const)(
    "creates concurrent %s clips without losing or overlapping them",
    async (kind) => {
      const store = await tempStore();
      const created = await store.create();
      const create =
        kind === "block" ? store.createBlock.bind(store) : store.createMusicBlock.bind(store);
      const tracks = await Promise.all([create(created.id), create(created.id)]);
      const media = await store.getMedia(created.id);
      expect(media.tracks).toHaveLength(2);
      expect(tracks.map((track) => track.start)).toEqual([0, 3]);
      expect(new Set(tracks.map((track) => track.name)).size).toBe(2);
    },
  );

  it.each(["./composition.json", "assets/../composition.json", "assets\\..\\composition.json"])(
    "protects the settings document through the alias %s",
    async (alias) => {
      const store = await tempStore();
      const created = await store.create();
      const file = await store.readFile(created.id, "composition.json");
      await expect(
        store.writeFile(created.id, alias, "utf8", "{}", file.etag),
      ).rejects.toMatchObject({ code: "forbidden" });
      await expect(store.deleteFile(created.id, alias)).rejects.toMatchObject({
        code: "forbidden",
      });
    },
  );

  it("protects generated music files through normalized paths", async () => {
    const store = await tempStore();
    const created = await store.create();
    const music = await store.createMusicBlock(created.id);
    await expect(
      store.writeFile(created.id, `./music/${music.asset}/script.js`, "utf8", "bad", ""),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("rejects a stale file etag", async () => {
    const store = await tempStore();
    const created = await store.create();
    const block = await store.createBlock(created.id);
    expect(block.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    const script = `blocks/${block.asset}/script.js`;
    const first = await store.readFile(created.id, script);
    await store.writeFile(created.id, script, "utf8", "window.ok = true;\n", first.etag);
    await expect(
      store.writeFile(created.id, script, "utf8", "stale\n", first.etag),
    ).rejects.toMatchObject({ code: "revision_conflict" } satisfies Partial<AppError>);
  });

  it("accepts only one concurrent edit with the same etag and recovers after a conflict", async () => {
    const store = await tempStore();
    const created = await store.create();
    const file = await store.writeFile(created.id, "notes.txt", "utf8", "original", "");
    const results = await Promise.allSettled([
      store.writeFile(created.id, file.path, "utf8", "first edit", file.etag),
      store.writeFile(created.id, file.path, "utf8", "second edit", file.etag),
    ]);
    expect(results[0]?.status).toBe("fulfilled");
    expect(results[1]).toMatchObject({ status: "rejected", reason: { code: "revision_conflict" } });
    const current = await store.readFile(created.id, file.path);
    expect(current.content).toBe("first edit");
    await expect(
      store.writeFile(created.id, file.path, "utf8", "retry", current.etag),
    ).resolves.toMatchObject({ content: "retry" });
  });

  it("finishes an active edit before moving a composition to trash", async () => {
    const store = await tempStore();
    const created = await store.create();
    const entered = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const get = store.get.bind(store);
    vi.spyOn(store, "get").mockImplementationOnce(async (id) => {
      const snapshot = await get(id);
      entered.resolve();
      await resume.promise;
      return snapshot;
    });
    const edit = store.updateSettings({ compositionId: created.id, name: "Final edit" });
    await entered.promise;
    const remove = store.remove(created.id);
    resume.resolve();
    await Promise.all([edit, remove]);
    await expect(store.get(created.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await store.list()).toEqual([]);
  });

  it("refuses to delete composition.json", async () => {
    const store = await tempStore();
    const created = await store.create();
    await expect(store.deleteFile(created.id, "composition.json")).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("places sequential blocks on one lane and rejects overlap", async () => {
    const store = await tempStore();
    const created = await store.create("Proof");
    const first = await store.createBlock(created.id, "Intro");
    const second = await store.createBlock(created.id, "Later");
    expect(second.lane).toBe(first.lane);
    expect(second.start).toBe(first.start + first.duration);
    const stacked = await store.createBlock(created.id, "Overlay", 0, first.lane + 1);
    expect(stacked.lane).toBe(first.lane + 1);
    expect(stacked.start).toBe(0);
    await expect(store.putTrack(created.id, { ...second, start: 1 })).rejects.toMatchObject({
      code: "invalid_track",
    } satisfies Partial<AppError>);
  });

  it("accepts a muted image still and rejects an unmuted one", async () => {
    const store = await tempStore();
    const created = await store.create("Still");
    const pixel =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    await store.writeFile(created.id, "assets/dot.png", "base64", pixel, "");
    const track = {
      id: "t-still",
      kind: "image" as const,
      asset: "dot.png",
      start: 0,
      duration: 5,
      trimStart: 0,
      rate: 1,
      volume: 1,
      mute: true,
      lane: 0,
    };
    const media = await store.putTrack(created.id, track);
    expect(media.tracks).toEqual([expect.objectContaining({ kind: "image", asset: "dot.png" })]);
    expect((await store.get(created.id)).durationSeconds).toBe(5);
    await expect(store.putTrack(created.id, { ...track, mute: false })).rejects.toMatchObject({
      code: "invalid_track",
    } satisfies Partial<AppError>);
    await expect(store.putTrack(created.id, { ...track, kind: "video" })).rejects.toMatchObject({
      code: "invalid_asset",
    } satisfies Partial<AppError>);
  });

  it("creates an unmuted music block with a Strudel scaffold on its own lane", async () => {
    const store = await tempStore();
    const created = await store.create("Score");
    const visual = await store.createBlock(created.id, "Intro");
    const music = await store.createMusicBlock(created.id, "Theme");
    expect(music.kind).toBe("music");
    expect(music.mute).toBe(false);
    expect(music.volume).toBe(1);
    expect(music.duration).toBe(3);
    expect(music.lane).not.toBe(visual.lane);
    const pattern = await store.readFile(created.id, `music/${music.asset}/pattern.js`);
    expect(pattern.content).toContain("@strudel/web");
    expect(pattern.content).toContain("export default function pattern");
    expect(pattern.content).toContain("voicings");
    expect(pattern.content).not.toContain("initStrudel");
    expect(pattern.content).not.toContain("dirt-samples");
    const files = await store.listFiles(created.id);
    expect(files).toContain(`music/${music.asset}/pattern.js`);
    expect(
      files.some((file) => file.startsWith(`music/${music.asset}/`) && file.endsWith("index.html")),
    ).toBe(false);
    await expect(
      store.writeFile(created.id, `music/${music.asset}/script.js`, "utf8", "nope", ""),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("reads valid activity lines and ignores malformed lines", async () => {
    const store = await tempStore();
    const created = await store.create();
    expect(await store.listActivity(created.id)).toEqual([]);

    await appendActivity(store.compositionDir(created.id), {
      at: "2026-01-01T00:00:00.000Z",
      operation: "create_composition",
      compositionId: created.id,
      detail: { name: created.name },
    });
    await appendActivity(store.compositionDir(created.id), {
      at: "2026-01-01T00:00:01.000Z",
      operation: "update_settings",
      compositionId: created.id,
    });
    await appendFile(
      path.join(store.compositionDir(created.id), ".agent-activity.jsonl"),
      "not json\n",
      "utf8",
    );
    const entries = await store.listActivity(created.id);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.operation).toBe("create_composition");
  });
});
