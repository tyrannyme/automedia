import * as v from "valibot";

/**
 * What clients and the engine agree on over HTTP. Kept apart from the engine
 * so the stdio relay can speak to it without loading Chromium or libav.
 */

/** Names the agent or app behind a request, for fair scheduling. */
export const ownerHeader = "x-automedia-owner";

/** What /health reports, so clients can tell an Automedia engine from anything else on the port. */
export const engineHealthSchema = v.object({
  ok: v.literal(true),
  name: v.literal("automedia"),
  version: v.string(),
  pid: v.number(),
  library: v.string(),
  busy: v.boolean(),
  /** The file the engine runs from, and its modification time at startup. Absent before 0.3. */
  bundle: v.optional(v.string()),
  builtAt: v.optional(v.number()),
});

export type EngineHealth = v.InferOutput<typeof engineHealthSchema>;

/** Every /api reply: the operation's result, or the error it threw. */
export const apiReplySchema = v.variant("ok", [
  v.object({ ok: v.literal(true), data: v.unknown() }),
  v.object({ ok: v.literal(false), error: v.object({ code: v.string(), message: v.string() }) }),
]);
