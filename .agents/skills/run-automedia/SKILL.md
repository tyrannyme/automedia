---
name: run-automedia
description: Set up, start, run, and drive the Automedia Electron studio headlessly. Use when asked to launch or run the app, take a screenshot of its UI, click through it, create or play a composition, test an export, check UI at 800x600 or in light mode, or confirm a renderer change in the real app.
---

Automedia is an Electron + Vite desktop app. Agents drive it in two steps.
`.agents/skills/run-automedia/app.sh` starts `pnpm dev` under Xvfb in tmux, on
its own ports and profile. Then `.agents/skills/run-automedia/driver.mjs`
connects over CDP, runs a snippet of Playwright JS against the studio window,
and exits. The app stays up between calls, and renderer edits hot-reload.

All paths are relative to the repo root. `.claude/skills/run-automedia` is a
symlink to this directory.

## Prerequisites

Verified on Fedora 44: Node 24, pnpm 11, `sfw` (Socket Firewall) on `PATH`,
and these packages (`rpm -qf` names):

```bash
rpm -q xorg-x11-server-Xvfb tmux   # provides xvfb-run and tmux
```

## Setup

The workspace only accepts packages at least three days old. Install through
Socket Firewall, then install the Chromium that validation, thumbnails, and
export launch. Never use `npx`, `pnpm dlx`, or `pnpx`.

```bash
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 sfw pnpm install
pnpm exec playwright install chromium
```

On Fedora, Playwright prints `BEWARE: your OS is not officially supported`
and uses the Ubuntu build. It works.

## Run (agent path)

```bash
.agents/skills/run-automedia/app.sh start --fresh   # --fresh wipes the test profile; omit to keep projects
node .agents/skills/run-automedia/driver.mjs 'await shot("home")'
.agents/skills/run-automedia/app.sh stop
```

Once `start` prints `ready`, CDP is up, usually after about 6 seconds. The
first driver call should still `waitFor()` its first control, because React may
not have mounted yet.

For multi-line flows, pipe a script. This one was run end to end: it creates a
composition, adds a block, plays it, and exports a PNG.

```bash
node .agents/skills/run-automedia/driver.mjs - <<'EOF'
await page.getByRole("button", { name: "New project" }).waitFor();
await page.getByRole("button", { name: "New project" }).click();
await page.getByRole("menuitem", { name: "Blank composition" }).click();
await page.getByRole("button", { name: "Add block" }).last().click();
await sleep(1500);
await page.getByRole("button", { name: "Play", exact: true }).click();
await sleep(1000);
await shot("playing");
await page.getByRole("button", { name: "Pause", exact: true }).click();
await page.getByRole("button", { name: "Export", exact: true }).first().click();
await page.getByRole("button", { name: "PNG", exact: true }).click();
await page.getByRole("button", { name: "Start export" }).click();
const view = await waitForExport();
await shot("export-" + view);
return { view, jobs: (await jobs()).map((job) => [job.format, job.phase]) };
EOF
```

Light mode and the compact window:

```bash
SCHEME=light node .agents/skills/run-automedia/driver.mjs 'await page.setViewportSize({ width: 800, height: 600 }); await sleep(500); await shot("light-800"); await page.setViewportSize({ width: 1280, height: 800 });'
```

Screenshots go to `/tmp/automedia-run/shots/<name>.png`. Open them and look.
The dev log is `/tmp/automedia-run/dev.log`, and the profile (projects and
exports) is `/tmp/automedia-run/userdata`.

In a driver snippet you have:

| name | what it is |
|---|---|
| `page` | Playwright `Page` for the studio window (not the composition iframe) |
| `shot(name, opts?)` | Screenshot to `shots/<name>.png`. `opts` passes through, e.g. `{ clip: {x,y,width,height} }` |
| `jobs()` | `window.studio.export.jobs()`, the main process's view of export jobs |
| `waitForExport(ms?)` | Polls the export dialog until `ready`, `failed`, or `timeout` |
| `sleep(ms)` | `page.waitForTimeout` |
| `return value` | Printed as JSON. Thrown errors print `ERROR …` and exit 1 |

`app.sh` commands: `start [--fresh]`, `stop`, `status`, `logs [lines]`.
Environment overrides: `AUTOMEDIA_RUN_DIR`, `AUTOMEDIA_CDP_PORT` (47922),
`AUTOMEDIA_LOOPBACK_PORT` (47921), `SCHEME=light|dark` (driver, default dark).

Renderer changes (`src/renderer/**`) hot-reload; add `await page.reload()` to
the next snippet to get a clean state. Changes under `src/main/**`,
`src/engine/**`, `src/cli/**`, or `src/preload/**` need
`app.sh stop && app.sh start`. The studio starts its own engine (a Node
process, `automedia-engine.js`) on the loopback port with the profile as its
library, and `app.sh stop` stops both.

## Run (human path)

```bash
pnpm dev   # opens a real window on the default ports 47821/47822. Ctrl-C to quit.
```

## Test

```bash
pnpm check                              # oxlint + oxfmt --check + typecheck
pnpm exec vitest run src/renderer       # renderer unit tests, ~2s
```

## Gotchas

- **Wayland leaks past Xvfb.** When `WAYLAND_DISPLAY` is set, Electron ignores
  `xvfb-run` and opens a window on the host desktop. `app.sh` unsets it and
  passes `--ozone-platform=x11`.
- **Kaf may already have Automedia open** on the default loopback/CDP ports
  47821/47822. `app.sh` uses 47921/47922 and a separate `--user-data-dir`
  (passed through `pnpm dev -- …`), so the two never share ports or projects.
- **Attaching Playwright flips the theme.** `connectOverCDP` emulates
  `prefers-color-scheme: light`, and the app's System appearance follows it,
  so early screenshots can land mid-transition with half-faded buttons. The
  driver pins a scheme on every call (`SCHEME`, default dark, which is the
  intended look).
- **Open dialogs make the rest of the page inert.** While a Base UI modal is
  open, `getByRole` can't see anything outside it. That includes the titlebar
  **Done** button in code mode, which is still clickable. Use
  `page.mouse.click(x, y)` for those controls, or press `Escape` to close the
  dialog.
- **Accessible names aren't the visible labels.** The sidebar's "New" is
  `New project`. `Play` also matches "Split at playhead" and "Playhead", so pass
  `exact: true`. There are two "Add block" and two "Composition settings"
  buttons (transport and inspector), so use `.first()`/`.last()`.
- **The preload API is `window.studio`**, not `window.automedia`.
  `window.automediaLoopbackOrigin` holds the loopback URL.
- **The export dialog can lag behind the main process.** Check `jobs()` before
  deciding an export is stuck. Clicking Start export validates first, so the
  dialog stays on `setup` for about half a second before switching to
  `running`.
- **Composition iframes are separate CDP targets** (`/json/list` shows the
  loopback URL). The driver skips them when picking `page`.
- **Screenshots don't show the native caption buttons.** They're drawn by
  Electron's title bar overlay, outside the page, so the gap to the right of
  Export is expected.
- **Never `pkill -f <profile path>` from the shell.** The pattern matches the
  shell itself and kills your own command (exit 144). `app.sh stop` uses
  `pgrep` and excludes its own PID.

## Troubleshooting

- **Driver prints `ERROR … Target page, context or browser has been closed`,
  then `app.sh status` says `not running` with `last run: EXIT 0`:** the
  Electron main process crashed. Forge still exits 0. Check
  `coredumpctl list | tail` for the stack. Run `app.sh start` to recover;
  projects persist in the profile.
- **`connect ECONNREFUSED 127.0.0.1:47922`:** the app isn't running (see
  above) or was started on other ports. Run `app.sh status`, then
  `app.sh start`.
- **`Timeout 30000ms exceeded … waiting for getByRole('button', { name: 'New' })`:**
  the name is wrong (see accessible names above). To list the real ones:
  `node .agents/skills/run-automedia/driver.mjs 'return await page.evaluate(() => [...document.querySelectorAll("button")].map(b => b.getAttribute("aria-label") || b.textContent.trim()))'`
- **A transparent composition previews on solid white in dark mode:** the
  iframe needs `color-scheme: normal` (see `preview-stage.tsx`). If this comes
  back, the style was dropped.
