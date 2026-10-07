import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CompositionStore } from "./store.ts";
import { EventBus } from "./events.ts";
import {
  subscribeThumbnailMutations,
  thumbnailDimensions,
  thumbnailPath,
  ThumbnailService,
  type ThumbnailCapture,
} from "./thumbnails.ts";

const dirs: string[] = [];
const services: ThumbnailService[] = [];

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close()));
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempStore(): Promise<CompositionStore> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "automedia-thumbnails-"));
  dirs.push(dir);
  return new CompositionStore(dir);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe("thumbnailDimensions", () => {
  it("preserves aspect ratio within the project-card bounds", () => {
    expect(thumbnailDimensions({ width: 640, height: 360 })).toEqual({ width: 320, height: 180 });
    expect(thumbnailDimensions({ width: 800, height: 600 })).toEqual({ width: 240, height: 180 });
    expect(thumbnailDimensions({ width: 100, height: 50 })).toEqual({ width: 100, height: 50 });
  });
});

describe("ThumbnailService", () => {
  it("coalesces rapid changes and publishes one complete thumbnail", async () => {
    const store = await tempStore();
    const composition = await store.create();
    let captures = 0;
    const capture: ThumbnailCapture = async ({ outputPath }) => {
      captures += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      await writeFile(outputPath, "png-one");
    };
    const service = new ThumbnailService(store, {
      baseUrl: "http://127.0.0.1:1",
      debounceMs: 10,
      capture,
    });
    services.push(service);

    service.request(composition.id);
    service.request(composition.id);
    service.request(composition.id);
    await wait(50);

    expect(captures).toBe(1);
    expect(await readFile(thumbnailPath(store, composition.id), "utf8")).toBe("png-one");
  });

  it("does not let an in-flight old revision replace a newer one", async () => {
    const store = await tempStore();
    const composition = await store.create();
    let resolveFirst: (() => void) | undefined;
    let captures = 0;
    const capture: ThumbnailCapture = async ({ outputPath }) => {
      captures += 1;
      if (captures === 1) {
        await new Promise<void>((resolve) => {
          resolveFirst = resolve;
        });
      }
      await writeFile(outputPath, captures === 1 ? "old" : "new");
    };
    const service = new ThumbnailService(store, {
      baseUrl: "http://127.0.0.1:1",
      debounceMs: 5,
      capture,
    });
    services.push(service);

    service.request(composition.id);
    await wait(20);
    service.request(composition.id);
    await expect(stat(thumbnailPath(store, composition.id))).rejects.toMatchObject({
      code: "ENOENT",
    });
    resolveFirst?.();
    await wait(40);

    expect(captures).toBe(2);
    expect(await readFile(thumbnailPath(store, composition.id), "utf8")).toBe("new");
  });

  it("backfills a missing thumbnail", async () => {
    const store = await tempStore();
    const composition = await store.create();
    const service = new ThumbnailService(store, {
      baseUrl: "http://127.0.0.1:1",
      debounceMs: 5,
      capture: async ({ outputPath }) => {
        await writeFile(outputPath, "png-backfill");
      },
    });
    services.push(service);

    await service.backfill();
    await wait(30);

    expect(await readFile(thumbnailPath(store, composition.id), "utf8")).toBe("png-backfill");
  });

  it("does not publish a capture canceled by composition deletion", async () => {
    const store = await tempStore();
    const composition = await store.create();
    let release: (() => void) | undefined;
    const service = new ThumbnailService(store, {
      baseUrl: "http://127.0.0.1:1",
      debounceMs: 5,
      capture: async ({ outputPath }) => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        await writeFile(outputPath, "should-not-publish");
      },
    });
    services.push(service);

    service.request(composition.id);
    await wait(20);
    service.cancel(composition.id);
    release?.();
    await wait(20);

    await expect(stat(thumbnailPath(store, composition.id))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

describe("subscribeThumbnailMutations", () => {
  it("requests on authoring events and cancels on delete", () => {
    const events = new EventBus();
    const requested: string[] = [];
    const canceled: string[] = [];
    const unsubscribe = subscribeThumbnailMutations(events, {
      request: (id) => {
        requested.push(id);
      },
      cancel: (id) => {
        canceled.push(id);
      },
    });
    events.emit({ type: "write_file", compositionId: "c1" });
    events.emit({ type: "put_track", compositionId: "c1" });
    events.emit({ type: "validate", compositionId: "c1" });
    events.emit({ type: "delete_composition", compositionId: "c1" });
    events.emit({ type: "write_file" });
    unsubscribe();
    events.emit({ type: "write_file", compositionId: "c1" });
    expect(requested).toEqual(["c1", "c1"]);
    expect(canceled).toEqual(["c1"]);
  });
});
