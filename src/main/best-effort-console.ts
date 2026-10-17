/**
 * Once whatever launched the studio goes away, console writes fail: EPIPE
 * when a launcher's pipe closes, EIO when its terminal does. Unhandled, that
 * error crashes the main process. A desktop app's console is best-effort, so
 * drop it.
 */
export function makeConsoleBestEffort(streams: readonly NodeJS.WritableStream[]): void {
  for (const stream of streams) stream.on("error", () => {});
}
