import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { write } from "./examples/readme-banner.ts";
import { exportFileExists } from "./export.ts";
import { startLoopbackStack } from "./loopback-stack.ts";

export async function writeReadmeBanner(
  outputPath = path.join(process.cwd(), "docs", "banner.png"),
): Promise<string> {
  const root = path.join(process.cwd(), ".automedia-readme-banner");
  const stack = await startLoopbackStack(root);
  try {
    const composition = await write(stack.store);
    const job = await stack.queue.start({
      compositionId: composition.id,
      format: "png",
      timeSeconds: 1.2,
    });
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const current = stack.queue.get(job.id);
      if (current.phase === "completed") {
        const filePath = await exportFileExists(stack.store, composition.id, job.id);
        await mkdir(path.dirname(outputPath), { recursive: true });
        await copyFile(filePath, outputPath);
        return outputPath;
      }
      if (current.phase === "failed" || current.phase === "canceled") {
        throw new Error(current.error?.message ?? `export ${current.phase}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("timed out exporting the README banner");
  } finally {
    await stack.server.close();
  }
}
