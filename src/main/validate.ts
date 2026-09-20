import { AppError } from "@shared/errors.ts";
import { mediaPrepareCount } from "@shared/media.ts";
import type { Composition, MediaDocument } from "@shared/schemas.ts";
import { launchChromium } from "./chromium.ts";
import { compositionContentUrl, resolveLoopbackUrl, type LoopbackUrlSource } from "./loopback.ts";
import { readInjectedRuntime } from "./page-runtime.ts";

export type { LoopbackUrlSource };

export { mediaPrepareCount, resolveLoopbackUrl };

export type ValidationIssue = {
  code: string;
  message: string;
};

export type ValidationReport = {
  ok: boolean;
  issues: ValidationIssue[];
  diagnostics: {
    seekApi: boolean;
    controlApi: boolean;
    rendererCount: number;
    scriptErrors: string[];
    prepared: number;
    sought: number;
  };
};

export async function validateComposition(
  composition: Composition,
  media: MediaDocument,
  loopbackUrl?: LoopbackUrlSource,
): Promise<ValidationReport> {
  const issues: ValidationIssue[] = [];
  const browser = await launchChromium();
  try {
    const page = await browser.newPage({
      viewport: { width: composition.width, height: composition.height },
      deviceScaleFactor: 1,
    });
    const failedResources: string[] = [];
    page.on("requestfailed", (request) => {
      const failure = request.failure()?.errorText ?? "failed";
      if (failure !== "net::ERR_ABORTED") {
        failedResources.push(`${request.url()}: ${failure}`);
      }
    });
    page.on("pageerror", (error) => {
      issues.push({ code: "script_error", message: error.message });
    });

    const url = compositionContentUrl(resolveLoopbackUrl(loopbackUrl), composition.id);
    const response = await page.goto(url, { waitUntil: "load" });
    if (!response || !response.ok()) {
      throw new AppError(
        "validate_failed",
        `preview returned ${response?.status() ?? "no response"}`,
      );
    }

    const report = await readInjectedRuntime(page);

    if (report.missingRuntime) {
      issues.push({ code: "missing_runtime", message: "window.automedia was not injected" });
      return emptyReport(issues);
    }

    if (!report.diagnostics.seekApi) {
      issues.push({ code: "missing_seek_api", message: "seek API is missing" });
    }
    if (!report.diagnostics.controlApi) {
      issues.push({ code: "missing_control_api", message: "setControls API is missing" });
    }
    for (const error of report.diagnostics.scriptErrors) {
      issues.push({ code: "script_error", message: error });
    }
    for (const resource of failedResources) {
      issues.push({ code: "failed_resource", message: resource });
    }

    const diagnostics = {
      seekApi: report.diagnostics.seekApi,
      controlApi: report.diagnostics.controlApi,
      rendererCount: report.diagnostics.rendererCount,
      scriptErrors: report.diagnostics.scriptErrors,
      prepared: report.media.prepared,
      sought: report.media.sought,
    };
    const mediaTrackCount = mediaPrepareCount(media.tracks);
    if (mediaTrackCount > 0 && diagnostics.prepared < mediaTrackCount) {
      issues.push({
        code: "media_not_prepared",
        message: `Preview prepared ${diagnostics.prepared} of ${mediaTrackCount} media tracks`,
      });
    }

    return {
      ok: issues.length === 0,
      issues,
      diagnostics,
    };
  } finally {
    await browser.close();
  }
}

function emptyReport(issues: ValidationIssue[]): ValidationReport {
  return {
    ok: false,
    issues,
    diagnostics: {
      seekApi: false,
      controlApi: false,
      rendererCount: 0,
      scriptErrors: [],
      prepared: 0,
      sought: 0,
    },
  };
}
