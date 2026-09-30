// One-shot driver for a running Automedia instance (start it with app.sh).
// Connects over CDP, runs the given JS as an async function body, prints the
// return value, and disconnects. The app keeps running between calls.
//
//   node .claude/skills/run-automedia/driver.mjs 'await shot("home")'
//   node .claude/skills/run-automedia/driver.mjs - <<'EOF'
//   await page.getByRole("button", { name: "New project" }).click();
//   return await page.locator("[role=menuitem]").allInnerTexts();
//   EOF
//
// In scope: page, shot(name, opts), jobs(), waitForExport(), sleep(ms), browser.
import { readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const runDir = process.env.AUTOMEDIA_RUN_DIR ?? "/tmp/automedia-run";
const cdpPort = process.env.AUTOMEDIA_CDP_PORT ?? "47922";
const loopbackPort = process.env.AUTOMEDIA_LOOPBACK_PORT ?? "47921";
const shotDir = path.join(runDir, "shots");
mkdirSync(shotDir, { recursive: true });

const arg = process.argv[2];
if (!arg) {
  console.log("usage: driver.mjs '<async js body>'   or   driver.mjs - < script.js");
  process.exit(2);
}
const code = arg === "-" ? readFileSync(0, "utf8") : arg;

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
// The studio window is the page that is not a loopback composition document.
const pages = browser.contexts().flatMap((context) => context.pages());
const page =
  pages.find((item) => !item.url().includes(`:${loopbackPort}/`)) ?? pages[0];
if (!page) {
  console.log("ERROR no studio page found");
  process.exit(1);
}

// Attaching Playwright emulates prefers-color-scheme: light, and the app's
// System appearance follows it mid-transition. Pin a scheme every call.
await page.emulateMedia({ colorScheme: process.env.SCHEME === "light" ? "light" : "dark" });
await page.waitForTimeout(350);

const sleep = (ms) => page.waitForTimeout(ms);
const shot = async (name, options = {}) => {
  const file = path.join(shotDir, `${name}.png`);
  await page.screenshot({ path: file, ...options });
  console.log("shot", file);
  return file;
};
// Main-process truth for exports; the dialog can lag behind it.
const jobs = () => page.evaluate(() => window.studio.export.jobs());
const waitForExport = async (timeoutMs = 120_000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const view = await page.evaluate(
      () => document.querySelector("[data-export-dialog]")?.getAttribute("data-export-view") ?? null,
    );
    if (view === "ready" || view === "failed") return view;
    await sleep(250);
  }
  return "timeout";
};

let failed = false;
try {
  const run = new Function(
    "page",
    "shot",
    "jobs",
    "waitForExport",
    "sleep",
    "browser",
    `return (async () => {\n${code}\n})()`,
  );
  const result = await run(page, shot, jobs, waitForExport, sleep, browser);
  if (result !== undefined) {
    console.log(typeof result === "string" ? result : JSON.stringify(result, null, 1));
  }
} catch (error) {
  failed = true;
  console.log("ERROR", error instanceof Error ? error.message : String(error));
}
// Exit without browser.close(); the app keeps running for the next call.
process.exit(failed ? 1 : 0);
