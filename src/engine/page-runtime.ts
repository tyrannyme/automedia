import * as v from "valibot";
import { AppError } from "@shared/errors.ts";
import type { AutomediaRuntime } from "@shared/runtime-types.ts";
import type { Page } from "playwright";

const diagnosticsSchema = v.object({
  seekApi: v.boolean(),
  controlApi: v.boolean(),
  rendererCount: v.number(),
  scriptErrors: v.array(v.string()),
});

const mediaDiagnosticsSchema = v.object({
  prepared: v.number(),
  sought: v.number(),
});

const seekResultSchema = v.object({
  ok: v.boolean(),
});

const validationPageSchema = v.union([
  v.object({ missingRuntime: v.literal(true) }),
  v.object({
    missingRuntime: v.literal(false),
    diagnostics: diagnosticsSchema,
    media: mediaDiagnosticsSchema,
  }),
]);

export type PageDiagnostics = v.InferOutput<typeof diagnosticsSchema>;
export type PageMediaDiagnostics = v.InferOutput<typeof mediaDiagnosticsSchema>;
export type PageValidationSnapshot = v.InferOutput<typeof validationPageSchema>;

export async function waitForPaint(page: Page): Promise<void> {
  await page.evaluate(`async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }`);
}

/** The DOM the frame marker touches. Main-process code has no DOM types. */
type MarkerNode = { id: string; style: { cssText: string; opacity: string } };
type MarkerDocument = {
  documentElement: { append(node: MarkerNode): void };
  getElementById(id: string): MarkerNode | null;
  createElement(tag: "div"): MarkerNode;
};

/**
 * Seeks the composition runtime. With `forceFrame`, the same task also nudges
 * a 1px marker, so Chromium presents a new frame even when the seek changed
 * nothing visible. Screencast capture waits for that frame, and an unchanged
 * frame would otherwise never arrive. Both marker opacities round to alpha 0,
 * so no captured pixel changes.
 */
export async function seekInjectedRuntime(
  page: Page,
  timeSeconds: number,
  frame: number,
  forceFrame = false,
): Promise<void> {
  const result = v.parse(
    seekResultSchema,
    await page.evaluate(
      async ({ timeSeconds: requestedTime, frame: requestedFrame, forceFrame: nudge }) => {
        // SAFETY: page global exposes the shared automedia runtime contract.
        const automedia = (globalThis as typeof globalThis & { automedia?: AutomediaRuntime })
          .automedia;
        if (!automedia) {
          return { ok: false };
        }
        await automedia.ready();
        await automedia.seek(requestedTime, requestedFrame);
        if (nudge) {
          // SAFETY: evaluate runs in the composition page, which has a DOM.
          const { document } = globalThis as typeof globalThis & { document: MarkerDocument };
          const marker =
            document.getElementById("automedia-frame-marker") ?? document.createElement("div");
          if (!marker.id) {
            marker.id = "automedia-frame-marker";
            marker.style.cssText =
              "position:fixed;left:0;top:0;width:1px;height:1px;background:#000;pointer-events:none;z-index:2147483647";
            document.documentElement.append(marker);
          }
          marker.style.opacity = marker.style.opacity === "0.001" ? "0.0015" : "0.001";
        }
        return { ok: true };
      },
      { timeSeconds, frame, forceFrame },
    ),
  );
  if (!result.ok) {
    throw new AppError("missing_runtime", "window.automedia was not injected");
  }
}

export async function readInjectedRuntime(page: Page): Promise<PageValidationSnapshot> {
  return v.parse(
    validationPageSchema,
    await page.evaluate(async () => {
      // SAFETY: page global exposes the shared automedia runtime contract.
      const automedia = (globalThis as typeof globalThis & { automedia?: AutomediaRuntime })
        .automedia;
      if (!automedia) {
        return { missingRuntime: true };
      }
      await automedia.ready();
      await automedia.seek(0, 0);
      return {
        missingRuntime: false,
        diagnostics: automedia.getDiagnostics(),
        media: automedia.getMediaDiagnostics(),
      };
    }),
  );
}
