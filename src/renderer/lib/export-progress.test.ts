import { describe, expect, it } from "vitest";
import type { ExportJob } from "../../main/export.ts";
import {
  exportDialogView,
  exportIsRunning,
  exportPhaseLabel,
  exportProgressPercent,
  upsertExportJob,
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
    expect(exportProgressPercent(job("encoding"))).toBe(75);
    expect(exportProgressPercent(job("completed"))).toBe(100);
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
});
