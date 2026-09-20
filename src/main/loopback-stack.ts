import { EventBus } from "./events.ts";
import { ExportQueue } from "./export.ts";
import { startLoopbackServer, type LoopbackServer } from "./http.ts";
import { createMcpServer } from "./mcp.ts";
import { CompositionStore } from "./store.ts";

export type LoopbackStack = {
  store: CompositionStore;
  events: EventBus;
  queue: ExportQueue;
  server: LoopbackServer;
};

export async function startLoopbackStack(root: string): Promise<LoopbackStack> {
  const store = new CompositionStore(root);
  const events = new EventBus();
  let server: LoopbackServer | undefined;
  const loopbackUrl = () => server?.url;
  const queue = new ExportQueue(
    store,
    (job) => {
      events.emit({ type: "export", compositionId: job.compositionId, payload: job });
    },
    loopbackUrl,
  );
  const mcp = createMcpServer({ store, exports: queue, events, loopbackUrl });
  server = await startLoopbackServer({ store, mcp, events, exports: queue });
  return { store, events, queue, server };
}
