import { describe, expect, it } from "vitest";
import type { ExportJob } from "../../engine/export.ts";
import {
  exportDialogView,
  exportIsRunning,
  exportPace,
  exportPhaseLabel,
  exportProgressPercent,
  exportSteps,
  newestExportJob,
  recordExportTiming,
  upsertExportJob,
  type ExportTiming,
} from "./export-progress.ts";

function job(phase: ExportJob["phase"]): ExportJob {
  return { id: "j1", compositionId: "c1", format: "mp4", phase };
}

describe("export progress", () => {
  it("treats in-flight phases as running", () => {
    expect(exportIsRunning(job("encoding"))).toBe(true);
    expect(exportIsRunning(job("queued"))).toBe(true);
    expect(exportIsRunning(job("completed"))).toBe(false);
    expect(exportIsRunning(null)).toBe(false);
  });

  it("maps phases to a determinate percent", () => {
    expect(exportProgressPercent(job("capturing"))).toBe(55);
    expect(exportProgressPercent(job("encoding"))).toBe(92);
    expect(exportProgressPercent(job("completed"))).toBe(100);
  });

  it("follows frames while capturing", () => {
    expect(exportProgressPercent({ ...job("capturing"), frame: 0, frames: 240 })).toBe(30);
    expect(exportProgressPercent({ ...job("capturing"), frame: 120, frames: 240 })).toBe(60);
    expect(exportProgressPercent({ ...job("capturing"), frame: 240, frames: 240 })).toBe(90);
  });

  it("times phases as the studio sees them", () => {
    let timing: ExportTiming | undefined;
    timing = recordExportTiming(timing, job("queued"), 0);
    timing = recordExportTiming(timing, job("loading"), 100);
    timing = recordExportTiming(timing, job("probing"), 200);
    timing = recordExportTiming(timing, job("capturing"), 400);
    const same = recordExportTiming(timing, { ...job("capturing"), frame: 3, frames: 240 }, 500);
    expect(same).toBe(timing);
    timing = recordExportTiming(timing, job("failed"), 900);
    expect(timing.lastRunning).toBe("capturing");
    expect(timing.endedAt).toBe(900);
    expect(timing.phases.loading).toBe(100);
  });

  it("walks the five steps", () => {
    const timing: ExportTiming = {
      startedAt: 0,
      phases: { queued: 0, loading: 0, probing: 100, capturing: 300 },
      lastRunning: "capturing",
      endedAt: null,
    };
    const running = exportSteps({ ...job("capturing"), frame: 143, frames: 240 }, timing);
    expect(running.map((step) => step.state)).toEqual(["done", "done", "now", "todo", "todo"]);
    expect(running.map((step) => step.detail)).toEqual([
      "0.1 s",
      "0.2 s",
      "143 / 240",
      "next",
      "then done",
    ]);
    const failed = exportSteps(job("failed"), { ...timing, endedAt: 900 });
    expect(failed.map((step) => step.state)).toEqual(["done", "done", "bad", "todo", "todo"]);
    const done = exportSteps(job("completed"), timing);
    expect(done.every((step) => step.state === "done")).toBe(true);
  });

  it("measures capture pace", () => {
    const timing: ExportTiming = {
      startedAt: 0,
      phases: { capturing: 1000 },
      lastRunning: "capturing",
      endedAt: null,
    };
    const pace = exportPace({ ...job("capturing"), frame: 120, frames: 240 }, timing, 3000);
    expect(pace).toEqual({ fps: 60, elapsedSeconds: 2, leftSeconds: 2 });
    expect(exportPace(job("encoding"), timing, 3000)).toBeNull();
  });

  it("labels phases for the dialog", () => {
    expect(exportPhaseLabel("encoding")).toBe("Encoding");
    expect(exportPhaseLabel("verifying")).toBe("Verifying");
  });

  it("follows a job through the dialog views", () => {
    expect(exportDialogView(job("encoding"), null)).toBe("setup");
    expect(exportDialogView(job("encoding"), "j1")).toBe("running");
    expect(exportDialogView(job("completed"), "j1")).toBe("ready");
    expect(exportDialogView(job("failed"), "j1")).toBe("failed");
    expect(exportDialogView(job("canceled"), "j1")).toBe("setup");
  });

  it("upserts the latest job to the front", () => {
    const next = upsertExportJob([job("queued")], { ...job("encoding"), id: "j2" });
    expect(next.map((item) => item.id)).toEqual(["j2", "j1"]);
  });

  it("keeps a streamed phase over a stale start reply", () => {
    expect(newestExportJob([job("failed")], job("loading")).phase).toBe("failed");
    expect(newestExportJob([job("capturing")], job("loading")).phase).toBe("capturing");
    expect(newestExportJob([job("loading")], job("encoding")).phase).toBe("encoding");
    expect(newestExportJob([], job("loading")).phase).toBe("loading");
  });
});
