import { describe, expect, it } from "vitest";
import { EventBus } from "./events.ts";
import { logOperation } from "./activity.ts";
import { CompositionStore } from "./store.ts";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach } from "vitest";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("logOperation", () => {
  it("records activity and emits the same operation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "automedia-activity-"));
    dirs.push(root);
    const store = new CompositionStore(root);
    const composition = await store.create("Log");
    const events = new EventBus();
    const seen: string[] = [];
    events.subscribe((event) => {
      seen.push(event.type);
    });
    await logOperation(store, events, "write_file", composition.id, {
      path: "blocks/a/index.html",
    });
    await logOperation(store, events, "delete_composition", composition.id);
    expect(seen).toEqual(["write_file", "delete_composition"]);
    const entries = await store.listActivity(composition.id);
    expect(entries.map((entry) => entry.operation)).toEqual(["write_file", "delete_composition"]);
    expect(entries[0]?.detail).toEqual({ path: "blocks/a/index.html" });
    expect(entries[1]?.detail).toBeUndefined();
  });
});
