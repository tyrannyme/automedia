import { describe, expect, it } from "vitest";
import { planStudioEvent } from "./studio-sync.ts";

const context = {
  compositionId: "c1",
  pendingTrack: false,
  pendingControl: false,
  dirtyHtml: false,
  dirtyCss: false,
  dirtyJs: false,
  dirtyPattern: false,
};

describe("studio event plans", () => {
  it("bumps thumbnails without touching the open project", () => {
    expect(planStudioEvent({ type: "thumbnail_ready", compositionId: "c2" }, context)).toEqual({
      bumpThumbnail: "c2",
    });
  });

  it("drops cache for events that belong to another project", () => {
    expect(
      planStudioEvent({ type: "write_file", compositionId: "c9", payload: { path: "x" } }, context),
    ).toEqual({ dropCached: "c9" });
  });

  it("opens a composition created by another process", () => {
    expect(planStudioEvent({ type: "create_composition", compositionId: "c2" }, context)).toEqual({
      reloadLists: true,
      selectComposition: "c2",
      dropCached: "c2",
    });
    expect(
      planStudioEvent(
        { type: "create_composition", compositionId: "c2" },
        { ...context, compositionId: null },
      ),
    ).toEqual({
      reloadLists: true,
      selectComposition: "c2",
      dropCached: "c2",
    });
  });

  it("reloads the sidebar when another project is renamed or deleted", () => {
    expect(planStudioEvent({ type: "update_settings", compositionId: "c2" }, context)).toEqual({
      reloadLists: true,
      dropCached: "c2",
    });
    expect(planStudioEvent({ type: "delete_composition", compositionId: "c2" }, context)).toEqual({
      reloadLists: true,
      dropCached: "c2",
    });
  });

  it("closes the open project when another process deletes it", () => {
    expect(planStudioEvent({ type: "delete_composition", compositionId: "c1" }, context)).toEqual({
      reloadLists: true,
      closeComposition: "c1",
    });
  });

  it("keeps export progress global but only refreshes files for the open project", () => {
    const job = { id: "j1", phase: "completed", compositionId: "c2" };
    expect(
      planStudioEvent({ type: "export", compositionId: "c2", payload: job }, context),
    ).toMatchObject({
      exportJob: job,
      dropCached: "c2",
    });
    expect(
      planStudioEvent({ type: "export", compositionId: "c2", payload: job }, context)
        .refreshExports,
    ).toBeUndefined();
    expect(
      planStudioEvent(
        { type: "export", compositionId: "c1", payload: { ...job, compositionId: "c1" } },
        context,
      ).refreshExports,
    ).toBe(true);
  });

  it("reloads a clean block file and skips a dirty one", () => {
    expect(
      planStudioEvent(
        {
          type: "write_file",
          compositionId: "c1",
          payload: { path: "blocks/b1/index.html" },
        },
        context,
      ),
    ).toMatchObject({
      refreshFiles: true,
      reloadCode: { file: "html", path: "blocks/b1/index.html" },
      bumpIframe: true,
    });
    expect(
      planStudioEvent(
        {
          type: "write_file",
          compositionId: "c1",
          payload: { path: "blocks/b1/index.html" },
        },
        { ...context, dirtyHtml: true },
      ).reloadCode,
    ).toBeUndefined();
  });

  it("reloads a clean music pattern and skips a dirty one", () => {
    expect(
      planStudioEvent(
        {
          type: "write_file",
          compositionId: "c1",
          payload: { path: "music/s1/pattern.js" },
        },
        context,
      ),
    ).toMatchObject({
      refreshFiles: true,
      reloadPattern: { path: "music/s1/pattern.js" },
      bumpIframe: true,
    });
    expect(
      planStudioEvent(
        {
          type: "write_file",
          compositionId: "c1",
          payload: { path: "music/s1/pattern.js" },
        },
        { ...context, dirtyPattern: true },
      ).reloadPattern,
    ).toBeUndefined();
  });

  it("ignores optimistic track writes already in flight", () => {
    expect(
      planStudioEvent(
        { type: "put_track", compositionId: "c1", payload: { trackId: "t1" } },
        { ...context, pendingTrack: true },
      ).refreshMedia,
    ).toBeUndefined();
  });
});
