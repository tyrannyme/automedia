import * as v from "valibot";
import { AppError } from "@shared/errors.ts";

/** A JSON value, as DevTools protocol parameters are. */
export type CdpValue = string | number | boolean | null | CdpValue[] | { [key: string]: CdpValue };
export type CdpParams = { [key: string]: CdpValue };

/** Commands for one target, or for the browser. */
export type CdpTarget = {
  /** Sends a command and waits for it, ignoring what it returns. */
  send(method: string, params?: CdpParams): Promise<void>;
  /** Sends a command and parses what it returns. */
  request<T>(method: string, params: CdpParams, schema: v.GenericSchema<T>): Promise<T>;
};

export type CdpConnection = CdpTarget & {
  /** Commands for an attached target, over the same socket. */
  session(sessionId: string): CdpTarget;
  close(): void;
};

const replySchema = v.object({
  id: v.optional(v.number()),
  result: v.optional(v.unknown()),
  error: v.optional(v.object({ message: v.optional(v.string()) })),
});
type CdpReply = v.InferOutput<typeof replySchema>;

type Waiter = { settle(reply: CdpReply): void; fail(error: Error): void };

/**
 * A bare CDP client over the browser's DevTools WebSocket. Playwright waits
 * for frames a BeginFrame-controlled target only draws when told to, so the
 * export frame farm speaks CDP itself.
 */
export async function connectCdp(webSocketUrl: string): Promise<CdpConnection> {
  const socket = new WebSocket(webSocketUrl);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener(
      "error",
      () => reject(new AppError("export_failed", "could not reach the export browser")),
      { once: true },
    );
  });
  let nextId = 0;
  const pending = new Map<number, Waiter>();
  socket.addEventListener("message", (event) => {
    const reply = v.parse(replySchema, JSON.parse(String(event.data)));
    // Events carry no id; the farm listens for none.
    if (reply.id === undefined) return;
    const waiter = pending.get(reply.id);
    if (!waiter) return;
    pending.delete(reply.id);
    waiter.settle(reply);
  });
  socket.addEventListener("close", () => {
    for (const waiter of pending.values()) {
      waiter.fail(new AppError("export_failed", "the export browser closed"));
    }
    pending.clear();
  });

  const call = (method: string, params: CdpParams, sessionId?: string) =>
    new Promise<CdpReply>((resolve, reject) => {
      if (socket.readyState !== WebSocket.OPEN) {
        reject(new AppError("export_failed", "the export browser closed"));
        return;
      }
      nextId += 1;
      pending.set(nextId, { settle: resolve, fail: reject });
      socket.send(JSON.stringify({ id: nextId, method, params, sessionId }));
    });
  const target = (sessionId?: string): CdpTarget => {
    const result = async (method: string, params: CdpParams) => {
      const reply = await call(method, params, sessionId);
      if (reply.error) {
        throw new AppError("export_failed", reply.error.message ?? `${method} failed`);
      }
      return reply.result;
    };
    return {
      async send(method, params = {}) {
        await result(method, params);
      },
      async request(method, params, schema) {
        return v.parse(schema, await result(method, params));
      },
    };
  };
  return {
    ...target(),
    session: (sessionId) => target(sessionId),
    close: () => socket.close(),
  };
}
