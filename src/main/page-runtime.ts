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

export async function seekInjectedRuntime(
  page: Page,
  timeSeconds: number,
  frame: number,
): Promise<void> {
  const result = v.parse(
    seekResultSchema,
    await page.evaluate(
      async ({ timeSeconds: requestedTime, frame: requestedFrame }) => {
        // SAFETY: page global exposes the shared automedia runtime contract.
        const automedia = (globalThis as typeof globalThis & { automedia?: AutomediaRuntime })
          .automedia;
        if (!automedia) {
          return { ok: false };
        }
        await automedia.ready();
        await automedia.seek(requestedTime, requestedFrame);
        return { ok: true };
      },
      { timeSeconds, frame },
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
