import { EventBus } from "./events.ts";
import { ExportQueue } from "./export.ts";
import { startLoopbackServer, type LoopbackServer } from "./http.ts";
import { ownerHeader } from "./protocol.ts";
import { createMcpServer, type EngineFor } from "./mcp.ts";
import {
  createOperations,
  localEngine,
  type Engine,
  type EngineContext,
  type Operations,
} from "./operations.ts";
import { RenderPool, type RenderPoolOptions } from "./render-pool.ts";
import { CompositionStore } from "./store.ts";
import { subscribeThumbnailMutations, ThumbnailService } from "./thumbnails.ts";

export type EngineOptions = {
  /** 0 picks a free port; the default is the Automedia port. */
  port?: number | undefined;
  pool?: RenderPoolOptions | undefined;
  /** Called on every HTTP request. */
  onRequest?: (() => void) | undefined;
};

export type RunningEngine = {
  store: CompositionStore;
  events: EventBus;
  queue: ExportQueue;
  pool: RenderPool;
  thumbnails: ThumbnailService;
  operations: Operations;
  server: LoopbackServer;
  /** The engine as one owner sees it, without going through HTTP. */
  engine: (owner: string) => Engine;
  /** Exports, checks, or thumbnails running or waiting. */
  busy: () => boolean;
  close: () => Promise<void>;
};

/**
 * Serves one library to every client: the studio, agents over HTTP MCP, and
 * stdio agents through their relays. All rendering shares one browser pool.
 */
export async function startEngine(
  library: string,
  options: EngineOptions = {},
): Promise<RunningEngine> {
  const store = new CompositionStore(library);
  const events = new EventBus();
  const pool = new RenderPool(options.pool);
  let server: LoopbackServer | undefined;
  const loopbackUrl = () => server?.url;
  const queue = new ExportQueue(
    store,
    pool,
    (job) => {
      events.emit({ type: "export", compositionId: job.compositionId, payload: job });
    },
    loopbackUrl,
  );
  const context: EngineContext = { store, events, queue, pool, loopbackUrl };
  const operations = createOperations(context);
  const engineFor: EngineFor = (request) =>
    localEngine(operations, { owner: request?.headers.get(ownerHeader) || "http" });
  const busy = () => pool.busy;
  const running = await startLoopbackServer({
    store,
    mcp: () => createMcpServer(engineFor),
    operations,
    events,
    exports: queue,
    port: options.port,
    busy,
    onRequest: options.onRequest,
  });
  server = running;

  const thumbnails = new ThumbnailService(store, {
    baseUrl: running.url,
    pool,
    onReady: (compositionId) => {
      events.emit({ type: "thumbnail_ready", compositionId });
    },
    onError: (compositionId, error) => {
      console.error(`failed to generate thumbnail for ${compositionId}`, error);
      events.emit({
        type: "thumbnail_error",
        compositionId,
        payload: { code: "internal", message: error.message },
      });
    },
  });
  context.thumbnails = thumbnails;
  // Thumbnails are for people. While no studio is watching, edits leave them
  // stale; the next studio to connect refreshes whatever changed.
  const unsubscribeMutations = subscribeThumbnailMutations(events, {
    cancel: (compositionId) => thumbnails.cancel(compositionId),
    request: (compositionId) => {
      if (events.viewers > 0) thumbnails.request(compositionId);
    },
  });
  const unsubscribeViewers = events.subscribeViewers((viewers) => {
    if (viewers !== 1) return;
    void thumbnails.backfill().catch((error) => {
      console.error("failed to refresh composition thumbnails", error);
    });
  });

  return {
    store,
    events,
    queue,
    pool,
    thumbnails,
    operations,
    server: running,
    engine: (owner) => localEngine(operations, { owner }),
    busy,
    close: async () => {
      unsubscribeMutations();
      unsubscribeViewers();
      await Promise.allSettled([thumbnails.close(), pool.close()]);
      await running.close();
    },
  };
}
