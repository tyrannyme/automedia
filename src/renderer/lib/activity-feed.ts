import * as v from "valibot";
import type { ActivityEntry } from "../../engine/activity.ts";
import type { ExportFile } from "@shared/ipc.ts";
import { exportFormats } from "@shared/limits.ts";
import type { Control, Marker, MediaTrack } from "@shared/schemas.ts";
import { exportFormatLabel } from "./export-format.ts";
import { formatBytes } from "./library.ts";
import { clipLabel } from "./timeline-math.ts";

/**
 * Activity, phrased. Each entry becomes one plain-English row built only from what the
 * engine logged: an operation name and its detail (a path, a track id, a format...).
 * Entries carry no actor, so a burst is attributed to an agent only while its lease is live.
 */

export type FeedIcon =
  | "code"
  | "change"
  | "remove"
  | "check"
  | "warn"
  | "export"
  | "media"
  | "marker"
  | "control"
  | "settings"
  | "create"
  | "cancel"
  | "other";

/** One run of row text; file names are set in DM Mono. */
export type FeedTextPart = { value: string; file: boolean };
export type FeedText = FeedTextPart[];

const words = (value: string): FeedTextPart => ({ value, file: false });
const file = (value: string): FeedTextPart => ({ value, file: true });

/** Where a row leads when clicked. */
export type FeedJump =
  | { kind: "track"; trackId: string }
  | { kind: "code"; trackId: string }
  | { kind: "export" };

export type FeedPhrase = {
  icon: FeedIcon;
  text: FeedText;
  /** Trailing context in the long feed, such as "no issues" or a file size. */
  detail?: string;
  /** Lowercase verb phrase for the presence chip, such as "wrote pattern.js". */
  verb: string;
  /** For writes: the file's name and the clip it lives in, for the stage chip. */
  file?: string;
  where?: string;
  jump?: FeedJump;
};

export type FeedItem = FeedPhrase & { at: number; operation: string };

export type FeedContext = {
  tracks: readonly MediaTrack[];
  markers?: readonly Marker[];
  controls?: readonly Control[];
  exports?: readonly ExportFile[];
};

export type FeedLease = {
  holder: string;
  /** The earliest moment the lease is known to have been live. */
  since: number;
  until: number;
};

export type FeedBurst = {
  start: number;
  end: number;
  /** Newest first. */
  items: FeedItem[];
  /** The lease holder, only when the burst ran while the lease was live. */
  holder: string | null;
};

/** Entries closer than this fold into one burst, roughly one agent turn. */
export const BURST_GAP_MS = 90_000;

// Every field the phrases read, each optional and dropped alone when malformed, so one
// odd value never hides the rest of a log line.
const nonEmpty = v.fallback(v.optional(v.pipe(v.string(), v.minLength(1))), undefined);
const number = v.fallback(v.optional(v.number()), undefined);
const detailSchema = v.fallback(
  v.object({
    name: nonEmpty,
    path: nonEmpty,
    trackId: nonEmpty,
    markerId: nonEmpty,
    controlId: nonEmpty,
    jobId: nonEmpty,
    format: v.fallback(v.optional(v.picklist(exportFormats)), undefined),
    ok: v.fallback(v.optional(v.boolean()), undefined),
    width: number,
    height: number,
    fps: number,
    durationSeconds: number,
    background: nonEmpty,
  }),
  {},
);
type Detail = v.InferOutput<typeof detailSchema>;

function detailOf(entry: ActivityEntry): Detail {
  return v.parse(detailSchema, entry.detail ?? {});
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function article(label: string): string {
  // Export labels are read letter by letter (an MP4, a PNG), except WebM and WebP.
  return /^[AEFHILMNORSX]/.test(label) ? "an" : "a";
}

function seconds(value: number): string {
  return `${value.toFixed(1)} s`;
}

/** The clip a file lives in: blocks/<asset>/… or music/<asset>/…. */
function fileOwner(path: string, tracks: readonly MediaTrack[]): MediaTrack | null {
  const match = /^(blocks|music)\/([^/]+)\//.exec(path);
  if (!match) return null;
  const kind = match[1] === "blocks" ? "block" : "music";
  return tracks.find((track) => track.kind === kind && track.asset === match[2]) ?? null;
}

function settingsPhrase(detail: Detail): FeedPhrase {
  const changes: string[] = [];
  if (detail.name !== undefined) changes.push(`name to ${detail.name}`);
  if (detail.width !== undefined && detail.height !== undefined) {
    changes.push(`size to ${detail.width} × ${detail.height}`);
  } else if (detail.width !== undefined) {
    changes.push(`width to ${detail.width}`);
  } else if (detail.height !== undefined) {
    changes.push(`height to ${detail.height}`);
  }
  if (detail.fps !== undefined) changes.push(`frame rate to ${detail.fps} fps`);
  if (detail.durationSeconds !== undefined) {
    changes.push(`length to ${seconds(detail.durationSeconds)}`);
  }
  if (detail.background !== undefined) changes.push(`background to ${detail.background}`);
  if (changes.length === 1) {
    const sentence = `Set ${changes[0]}`;
    return { icon: "settings", text: [words(sentence)], verb: sentence.toLowerCase() };
  }
  return {
    icon: "settings",
    text: [words("Changed the project settings")],
    verb: "changed settings",
  };
}

function plain(icon: FeedIcon, sentence: string, verb: string): FeedPhrase {
  return { icon, text: [words(sentence)], verb };
}

export function phraseEntry(entry: ActivityEntry, context: FeedContext): FeedPhrase {
  const detail = detailOf(entry);
  const { tracks } = context;
  switch (entry.operation) {
    case "create_composition":
      return plain(
        "create",
        detail.name ? `Created ${detail.name}` : "Created the project",
        "created the project",
      );
    case "update_settings":
      return settingsPhrase(detail);
    case "delete_composition":
      return plain("remove", "Deleted the project", "deleted the project");
    case "write_file":
    case "delete_file": {
      const path = detail.path ?? "";
      const name = baseName(path) || "a file";
      const wrote = entry.operation === "write_file";
      const verb = wrote ? "Wrote" : "Deleted";
      if (path.startsWith("assets/")) {
        return {
          icon: wrote ? "media" : "remove",
          text: wrote
            ? [words("Added "), file(name), words(" to Media")]
            : [words("Removed "), file(name), words(" from Media")],
          verb: `${wrote ? "added" : "removed"} ${name}`,
        };
      }
      const owner = fileOwner(path, tracks);
      if (!owner) {
        return {
          icon: wrote ? "code" : "remove",
          text: [words(`${verb} `), file(path || name)],
          verb: `${verb.toLowerCase()} ${name}`,
          file: name,
        };
      }
      const where = clipLabel(owner);
      const phrase: FeedPhrase = {
        icon: wrote ? "code" : "remove",
        text: [words(`${verb} `), file(name), words(` in ${where}`)],
        verb: `${verb.toLowerCase()} ${name}`,
        file: name,
        where: `${where} ${owner.kind === "music" ? "music" : "block"}`,
      };
      if (wrote) phrase.jump = { kind: "code", trackId: owner.id };
      return phrase;
    }
    case "put_track":
    case "delete_track": {
      const track = detail.trackId ? tracks.find((item) => item.id === detail.trackId) : undefined;
      if (entry.operation === "delete_track") {
        return plain(
          "remove",
          track ? `Removed the ${clipLabel(track)} clip` : "Removed a clip",
          "removed a clip",
        );
      }
      // put_track logs only the id: say what was touched, never what changed.
      if (!track) return plain("change", "Changed a clip", "changed a clip");
      return {
        ...plain("change", `Changed the ${clipLabel(track)} clip`, `changed ${clipLabel(track)}`),
        jump: { kind: "track", trackId: track.id },
      };
    }
    case "put_marker":
    case "delete_marker": {
      if (entry.operation === "delete_marker") {
        return plain("remove", "Removed a marker", "removed a marker");
      }
      const marker = detail.markerId
        ? context.markers?.find((item) => item.id === detail.markerId)
        : undefined;
      return plain(
        "marker",
        marker ? `Changed the ${marker.label} marker` : "Changed a marker",
        "changed a marker",
      );
    }
    case "put_control":
    case "delete_control": {
      const control = detail.controlId
        ? context.controls?.find((item) => item.id === detail.controlId)
        : undefined;
      if (entry.operation === "delete_control") {
        return plain(
          "remove",
          control ? `Removed the ${control.label} control` : "Removed a control",
          "removed a control",
        );
      }
      return plain(
        "control",
        control ? `Changed ${control.label}` : "Changed a control",
        control ? `changed ${control.label}` : "changed a control",
      );
    }
    case "validate": {
      const ok = detail.ok === true;
      return {
        ...plain(ok ? "check" : "warn", "Checked the project", "checked the project"),
        detail: ok ? "no issues" : "found issues",
      };
    }
    case "start_export": {
      const label = detail.format ? exportFormatLabel(detail.format) : null;
      const done = detail.jobId
        ? context.exports?.find((item) => item.jobId === detail.jobId)
        : undefined;
      if (done) {
        return {
          icon: "export",
          text: [words("Exported "), file(done.fileName)],
          detail: formatBytes(done.bytes),
          verb: `exported ${label ? `${article(label)} ${label}` : "a file"}`,
          jump: { kind: "export" },
        };
      }
      return plain(
        "export",
        label ? `Started ${article(label)} ${label} export` : "Started an export",
        "started an export",
      );
    }
    case "cancel_export":
      return plain("cancel", "Canceled an export", "canceled an export");
    default: {
      const name = entry.operation.replaceAll("_", " ");
      return plain("other", `Ran ${name}`, `ran ${name}`);
    }
  }
}

/** Phrased items, newest first. Entries with an unreadable time are dropped. */
export function feedItems(entries: readonly ActivityEntry[], context: FeedContext): FeedItem[] {
  const items: FeedItem[] = [];
  for (const entry of entries) {
    const at = Date.parse(entry.at);
    if (!Number.isFinite(at)) continue;
    items.push({ ...phraseEntry(entry, context), at, operation: entry.operation });
  }
  return items.toSorted((a, b) => b.at - a.at);
}

/** The text of a row as one string, for titles and summaries. */
export function feedPlainText(text: FeedText): string {
  return text.map((part) => part.value).join("");
}

/**
 * Folds items into bursts (entries less than BURST_GAP_MS apart), newest first. A burst is
 * the lease holder's only when it ran into the time the lease is known to have been live.
 */
export function groupBursts(
  items: readonly FeedItem[],
  lease: FeedLease | null,
  gapMs = BURST_GAP_MS,
): FeedBurst[] {
  const sorted = items.toSorted((a, b) => b.at - a.at);
  const bursts: FeedBurst[] = [];
  for (const item of sorted) {
    const current = bursts.at(-1);
    if (current && current.start - item.at < gapMs) {
      current.items.push(item);
      current.start = item.at;
    } else {
      bursts.push({ start: item.at, end: item.at, items: [item], holder: null });
    }
  }
  if (lease) {
    for (const burst of bursts) {
      if (burst.end >= lease.since - gapMs && burst.start <= lease.until) {
        burst.holder = lease.holder;
      }
    }
  }
  return bursts;
}

/** "now", "12s", "6m", "1h", "2d": a compact age for DM Mono columns. */
export function formatAge(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 5) return "now";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** "6m ago", or "just now". */
export function formatAgo(ms: number): string {
  const age = formatAge(ms);
  return age === "now" ? "just now" : `${age} ago`;
}

/** "3:28": time left on a lease. */
export function formatLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "5 changes · 40 s", "1 change". */
export function burstSummary(burst: FeedBurst): string {
  const count = burst.items.length;
  const changes = `${count} ${count === 1 ? "change" : "changes"}`;
  if (count === 1) return changes;
  const span = Math.round((burst.end - burst.start) / 1000);
  if (span < 1) return changes;
  if (span < 60) return `${changes} · ${span} s`;
  if (span < 3600) return `${changes} · ${Math.round(span / 60)} min`;
  return `${changes} · ${Math.round(span / 3600)} h`;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** "14:32:08", local time. */
export function formatClock(at: number): string {
  const date = new Date(at);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** "14:32", local time. */
export function formatShortClock(at: number): string {
  const date = new Date(at);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "Today", "Yesterday", or a short date such as "Oct 25". */
function startOfDay(value: number): number {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function dayLabel(at: number, now: number): string {
  const diff = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
