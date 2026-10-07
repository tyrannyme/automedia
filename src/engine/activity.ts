import path from "node:path";
import { appendFile } from "node:fs/promises";
import { ensureDir } from "./fs.ts";
import type { ActivityDetail } from "./events.ts";
import type { EventBus } from "./events.ts";

export type ActivityEntry = {
  at: string;
  operation: string;
  compositionId?: string;
  detail?: ActivityDetail;
};

export async function appendActivity(compositionDir: string, entry: ActivityEntry): Promise<void> {
  await ensureDir(compositionDir);
  await appendFile(
    path.join(compositionDir, ".agent-activity.jsonl"),
    `${JSON.stringify(entry)}\n`,
    "utf8",
  );
}

export async function recordActivity(options: {
  store: { compositionDir: (compositionId: string) => string };
  events: Pick<EventBus, "emit">;
  operation: string;
  compositionId: string;
  detail?: ActivityDetail;
}): Promise<void> {
  const entry: ActivityEntry = {
    at: new Date().toISOString(),
    operation: options.operation,
    compositionId: options.compositionId,
  };
  if (options.detail !== undefined) {
    entry.detail = options.detail;
  }
  await appendActivity(options.store.compositionDir(options.compositionId), entry);
  const event: Parameters<EventBus["emit"]>[0] = {
    type: options.operation,
    compositionId: options.compositionId,
  };
  if (options.detail !== undefined) {
    event.payload = options.detail;
  }
  options.events.emit(event);
}

export async function logOperation(
  store: { compositionDir: (compositionId: string) => string },
  events: Pick<EventBus, "emit">,
  operation: string,
  compositionId: string,
  detail?: ActivityDetail,
): Promise<void> {
  if (detail === undefined) {
    await recordActivity({ store, events, operation, compositionId });
    return;
  }
  await recordActivity({ store, events, operation, compositionId, detail });
}
