import type { ExportJob, ExportPhase } from "../../main/export.ts";

const runningPhases = new Set<ExportPhase>([
  "queued",
  "loading",
  "probing",
  "capturing",
  "encoding",
  "verifying",
]);

export function exportIsRunning(job: ExportJob | null): boolean {
  return job !== null && runningPhases.has(job.phase);
}

export function exportProgressPercent(job: ExportJob | null): number {
  if (!job) return 0;
  if (job.phase === "completed") return 100;
  if (job.phase === "failed" || job.phase === "canceled") return 0;
  if (job.phase === "queued") return 8;
  if (job.phase === "loading") return 20;
  if (job.phase === "probing") return 35;
  if (job.phase === "capturing") return 55;
  if (job.phase === "encoding") return 75;
  if (job.phase === "verifying") return 90;
  return 0;
}

export type ExportDialogView = "setup" | "running" | "ready" | "failed";

export function exportDialogView(
  job: ExportJob | null,
  followId: string | null,
): ExportDialogView {
  if (!job || !followId || job.id !== followId) return "setup";
  if (exportIsRunning(job)) return "running";
  if (job.phase === "completed") return "ready";
  if (job.phase === "failed") return "failed";
  return "setup";
}

export function upsertExportJob(jobs: readonly ExportJob[], job: ExportJob): ExportJob[] {
  return [job, ...jobs.filter((item) => item.id !== job.id)].slice(0, 20);
}

export function exportPhaseLabel(phase: ExportPhase): string {
  if (phase === "queued") return "Queued";
  if (phase === "loading") return "Loading";
  if (phase === "probing") return "Probing";
  if (phase === "capturing") return "Capturing";
  if (phase === "encoding") return "Encoding";
  if (phase === "verifying") return "Verifying";
  if (phase === "completed") return "Ready";
  if (phase === "canceled") return "Canceled";
  return "Export failed";
}
