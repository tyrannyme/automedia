import type { ServerResponse } from "node:http";
import type { ErrorObject } from "@shared/errors.ts";
import type { Composition, UpdateSettingsInput } from "@shared/schemas.ts";
import type { ExportJob } from "./export.ts";

export type ActivityDetail =
  | { name: string }
  | { path: string }
  | { trackId: string }
  | { markerId: string }
  | { controlId: string }
  | { ok: boolean }
  | { jobId: string }
  | { jobId: string; format: string }
  | UpdateSettingsInput
  | Composition
  | ExportJob
  | ErrorObject;

export type StudioEvent = {
  type: string;
  compositionId?: string | undefined;
  payload?: ActivityDetail | undefined;
};

export type StudioEventListener = (event: StudioEvent) => void;

export class EventBus {
  private readonly clients = new Set<ServerResponse>();
  private readonly listeners = new Set<StudioEventListener>();

  subscribe(listener: StudioEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  add(response: ServerResponse): void {
    this.clients.add(response);
    response.on("close", () => {
      this.clients.delete(response);
    });
  }

  emit(event: StudioEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Internal consumers must not prevent the event from reaching the UI.
      }
    }
    const body = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients) {
      client.write(body);
    }
  }
}
