import type { ExportJob, ExportPhase } from "../../engine/export.ts";

const runningPhaseOrder: readonly ExportPhase[] = [
  "queued",
  "loading",
  "probing",
  "capturing",
  "encoding",
  "verifying",
];
const runningPhases = new Set<ExportPhase>(runningPhaseOrder);

function phaseRank(phase: ExportPhase): number {
  const index = runningPhaseOrder.indexOf(phase);
  return index === -1 ? runningPhaseOrder.length : index;
}

export function exportIsRunning(job: ExportJob | null): boolean {
  return job !== null && runningPhases.has(job.phase);
}

/** Frames captured so far, when the engine reports them (GIF, WebP, MP4, WebM). */
export function exportFrames(job: ExportJob | null): { frame: number; frames: number } | null {
  if (!job || job.frames === undefined || job.frames <= 0) return null;
  return { frame: Math.min(job.frames, Math.max(0, job.frame ?? 0)), frames: job.frames };
}

/**
 * Overall progress, 0-100. Capture is most of the work, so it spans 30-90%
 * and follows the frame count when the engine reports one; the other phases
 * hold fixed steps.
 */
export function exportProgressPercent(job: ExportJob | null): number {
  if (!job) return 0;
  if (job.phase === "completed") return 100;
  if (job.phase === "failed" || job.phase === "canceled") return 0;
  if (job.phase === "queued") return 4;
  if (job.phase === "loading") return 12;
  if (job.phase === "probing") return 24;
  if (job.phase === "capturing") {
    const frames = exportFrames(job);
    if (!frames) return 55;
    return Math.round(30 + (frames.frame / frames.frames) * 60);
  }
  if (job.phase === "encoding") return 92;
  if (job.phase === "verifying") return 96;
  return 0;
}

/** The phases a running job walks through, in export.ts's order. */
export const exportStepPhases = [
  "loading",
  "probing",
  "capturing",
  "encoding",
  "verifying",
] as const;
export type ExportStepPhase = (typeof exportStepPhases)[number];

/** When the studio first saw each phase of a job, in ms since the epoch. */
export type ExportTiming = {
  startedAt: number;
  phases: Partial<Record<ExportPhase, number>>;
  /** The last running phase seen, so a failed job can say where it stopped. */
  lastRunning: ExportPhase | null;
  endedAt: number | null;
};

/** Records a job update into its timing. Returns the same object when nothing changed. */
export function recordExportTiming(
  timing: ExportTiming | undefined,
  job: ExportJob,
  now: number,
): ExportTiming {
  const current = timing ?? { startedAt: now, phases: {}, lastRunning: null, endedAt: null };
  const seen = current.phases[job.phase] !== undefined;
  const running = runningPhases.has(job.phase);
  const ended = !running && current.endedAt === null;
  if (seen && !ended && (!running || current.lastRunning === job.phase)) return current;
  return {
    ...current,
    phases: seen ? current.phases : { ...current.phases, [job.phase]: now },
    lastRunning: running ? job.phase : current.lastRunning,
    endedAt: ended ? now : current.endedAt,
  };
}

export type ExportStepState = "done" | "now" | "todo" | "bad";
export type ExportStep = {
  phase: ExportStepPhase;
  label: string;
  state: ExportStepState;
  /** 0-100 fill of this phase's bar. */
  fill: number;
  /** DM Mono detail: a duration, a frame count, or what comes next. */
  detail: string;
};

function duration(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)} s`;
}

/** The five phase steps under the counter, from the job and what the studio saw of it. */
export function exportSteps(job: ExportJob, timing: ExportTiming | undefined): ExportStep[] {
  const stopped =
    job.phase === "failed" || job.phase === "canceled" ? (timing?.lastRunning ?? null) : job.phase;
  const reached = job.phase === "completed" ? exportStepPhases.length : stepIndex(stopped);
  const frames = exportFrames(job);
  return exportStepPhases.map((phase, index) => {
    const label = exportPhaseLabel(phase);
    const startedAt = timing?.phases[phase];
    const nextAt =
      exportStepPhases
        .slice(index + 1)
        .reduce<number | undefined>((found, next) => found ?? timing?.phases[next], undefined) ??
      timing?.endedAt ??
      undefined;
    const took =
      startedAt !== undefined && nextAt !== undefined ? duration(nextAt - startedAt) : "";
    const frameDetail = phase === "capturing" && frames ? `${frames.frame} / ${frames.frames}` : "";
    if (index < reached) {
      return { phase, label, state: "done", fill: 100, detail: frameDetail || took };
    }
    if (index === reached && job.phase === "failed") {
      return { phase, label, state: "bad", fill: 100, detail: "stopped" };
    }
    if (index === reached && runningPhases.has(job.phase)) {
      const fill = phase === "capturing" && frames ? (frames.frame / frames.frames) * 100 : 50;
      return { phase, label, state: "now", fill, detail: frameDetail || "now" };
    }
    const detail =
      index === reached + 1 ? "next" : index === exportStepPhases.length - 1 ? "then done" : "";
    return { phase, label, state: "todo", fill: 0, detail: job.phase === "failed" ? "" : detail };
  });
}

function stepIndex(phase: ExportPhase | null): number {
  if (phase === null || phase === "queued") return -1;
  // SAFETY: indexOf only compares; a phase outside the five steps returns -1.
  const index = exportStepPhases.indexOf(phase as ExportStepPhase);
  return index === -1 ? -1 : index;
}

/**
 * Capture speed and time left, from the frames captured since capture began.
 * Null until there is enough to measure.
 */
export function exportPace(
  job: ExportJob,
  timing: ExportTiming | undefined,
  now: number,
): { fps: number; elapsedSeconds: number; leftSeconds: number } | null {
  const frames = exportFrames(job);
  const since = timing?.phases.capturing;
  if (job.phase !== "capturing" || !frames || since === undefined || frames.frame < 2) return null;
  const elapsedSeconds = (now - since) / 1000;
  if (elapsedSeconds <= 0.2) return null;
  const fps = frames.frame / elapsedSeconds;
  return { fps, elapsedSeconds, leftSeconds: (frames.frames - frames.frame) / fps };
}

export type ExportDialogView = "setup" | "running" | "ready" | "failed";

export function exportDialogView(job: ExportJob | null, followId: string | null): ExportDialogView {
  if (!job || !followId || job.id !== followId) return "setup";
  if (exportIsRunning(job)) return "running";
  if (job.phase === "completed") return "ready";
  if (job.phase === "failed") return "failed";
  return "setup";
}

/**
 * The start reply and the event stream race. A job that fails or finishes fast
 * can stream past its start reply, so never step a known job back a phase.
 */
export function newestExportJob(jobs: readonly ExportJob[], job: ExportJob): ExportJob {
  const known = jobs.find((item) => item.id === job.id);
  return known && phaseRank(known.phase) > phaseRank(job.phase) ? known : job;
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
