import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createMcpServer } from "../engine/mcp.ts";
import type {
  Engine,
  OperationInput,
  OperationName,
  OperationResult,
} from "../engine/operations.ts";
import type { EngineHealth } from "../engine/protocol.ts";
import { connectEngine, launchDetachedEngine, remoteEngine, type EngineTarget } from "./client.ts";

/**
 * One agent's MCP server over stdio. It holds no library state and renders
 * nothing: every tool call goes to the shared engine, which it starts on the
 * first call if none is running.
 */
export function runRelay(target: EngineTarget): void {
  // stdout carries JSON-RPC, so stray logs go to stderr.
  console.log = console.error;
  console.info = console.error;
  console.debug = console.error;

  let connecting: Promise<EngineHealth> | undefined;
  const connect = () => {
    connecting ??= connectEngine(target, launchDetachedEngine).catch((error) => {
      connecting = undefined;
      throw error;
    });
    return connecting;
  };
  const reconnect = () => {
    connecting = undefined;
    return connect();
  };
  const remote = remoteEngine(target.port, `mcp-${process.pid}`, reconnect);
  const engine: Engine = {
    call: async <TName extends OperationName>(
      name: TName,
      input?: OperationInput<TName>,
    ): Promise<OperationResult<TName>> => {
      await connect();
      return remote.call(name, input);
    },
  };

  serveStdio(() => createMcpServer(() => engine), {
    onerror: (error) => {
      console.error("automedia: mcp stdio error", error);
    },
  });
  // The client closing stdin is the only shutdown signal it is obliged to send.
  process.stdin.once("end", () => process.exit(0));
}
