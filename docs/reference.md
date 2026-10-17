# Automedia reference

The details behind the [README](../README.md).

## Projects

Projects live in the library, which defaults to the studio's user-data directory (`~/.config/Automedia` on Linux, `%APPDATA%\Automedia` on Windows, `~/Library/Application Support/Automedia` on macOS):

```text
compositions/<composition-id>/
├── composition.json       # name, size, frame rate, duration, background
├── media.json              # audio/video/image/block/music tracks and markers
├── controls.json           # range, color, toggle, and select controls
├── blocks/<asset>/         # visual clip: index.html, style.css, script.js
├── music/<asset>/          # music clip: authored pattern.js
├── assets/                 # project-local media files
└── exports/                # completed export files
```

Save project writes a `.automedia` zip of the authored tree plus the sidebar thumbnail. Import project unpacks that file as a new library item with a new id. Exports, activity logs, and generated music runtime files stay out of the snapshot. The live project remains in the library.

Projects default to 800×600 at 30 fps for three seconds with a transparent background. Composition sizes can range from 1 to 16,384 pixels, frame rates from 1 to 240 fps, and durations up to one hour.

The studio edits visual-block HTML, CSS, and JS in code mode, and music patterns in a separate music editor. File writes use etags, so an agent or another process cannot silently overwrite a newer version. `composition.json` is managed through composition settings and cannot be written as a loose file. Music runtime HTML, CSS, and transport are generated and cannot be written as loose files.

## Runtime API

Automedia injects `window.automedia` into the project document. Use `registerRenderer` when a frame needs JavaScript-driven painting:

```js
const canvas = document.querySelector("canvas");
const context = canvas.getContext("2d");

window.automedia.registerRenderer(({ frame, width, height }) => {
  context.clearRect(0, 0, width, height);
  context.fillRect(frame * 4, 20, 40, 40);
});
```

The renderer context includes time in seconds and milliseconds, frame, fps, dimensions, duration, and current control values. The runtime also exposes `ready`, `seek`, `setControls`, `getDiagnostics`, and `getMediaDiagnostics`. Query `get_runtime_types` over MCP for the full TypeScript contract.

The bundled import map provides pinned versions of Three.js, Motion, the Tailwind browser build, Strudel (`@strudel/web`), and vGPU (`vgpu`). vGPU blocks can fetch project-local `.wgsl` files and draw deterministic WebGPU frames from `registerRenderer`. The built-in `vgpu-shader` example renders into an offscreen vGPU target and reads the pixels into a 2D canvas so Chromium captures the same frame in previews, thumbnails, and headless exports. Query `get_runtime_catalog` for the versions available to a project.

## Music

`create_music_block` (or Add music in the studio) adds a first-class `music` clip. Authors write one file, `music/<asset>/pattern.js`, that exports a Strudel pattern:

```js
import { add, note, perlin, sine, stack, voicings } from "@strudel/web";

// Official Strudel getting-started showcase, rewritten onto built-in synths.
export default function pattern(gain) {
  const drums = stack(
    note("c1")
      .s("sine")
      .struct("x")
      .decay(0.14)
      .sustain(0)
      .gain(0.5 * gain),
    note("g2")
      .s("triangle")
      .struct("[~ <x!3 x(3,4,2)>]")
      .decay(0.08)
      .sustain(0)
      .gain(0.28 * gain),
    note("c6")
      .s("square")
      .struct("x*8")
      .decay(0.025)
      .sustain(0)
      .lpf(9000)
      .gain(0.07 * gain),
  );
  const bass = note("<a1 b1*2 a1(3,8) e2>")
    .off(1 / 8, (x) => x.add(12).degradeBy(0.5))
    .add(perlin.range(0, 0.5))
    .superimpose(add(0.05))
    .decay(0.15)
    .sustain(0)
    .s("sawtooth")
    .gain(0.32 * gain)
    .cutoff(sine.slow(7).range(300, 5000));
  const chords = voicings("lefthand", "<Am7!3 <Em7 E7b13 Em7 Ebm7b5>>")
    .superimpose((x) => x.add(0.04))
    .add(perlin.range(0, 0.5))
    .note()
    .s("sawtooth")
    .gain(0.12 * gain)
    .cutoff(500)
    .attack(1);
  return stack(drums, bass, chords).slow(3 / 2);
}
```

The default is the official Strudel getting-started showcase, rewritten onto built-in synths so it works offline. The bassline, lefthand voicings, and Euclidean snare figure stay; dirt-sample drums become sine/triangle/square hits. The studio opens a music editor for that file. The runtime wrapper, playback, mute, and volume stay managed and are not part of the HTML/CSS/JS block flow. Music clips are unmuted. Agents edit the pattern with `write_file` on `music/<asset>/pattern.js`. Sample banks are optional and need a network.

## Engine and CLI

`pnpx github:tyrannyme/automedia#cli` runs the `automedia` command from the `cli` branch, which holds the latest release with its bundles built into `cli/`, so it needs no build step. `main` never carries built bundles. Run `pnpm build:cli` to rebuild it from a checkout, and `node bin/automedia.cjs` to run that build.

`automedia mcp` is a small relay. It holds no state and renders nothing. On its first tool call it finds the engine for the library, or starts one in the background, and forwards every call to it. All agents share that engine and one headless Chromium, in which each validation, export, and thumbnail gets its own browser context. Exports run a few at a time, taken from each agent in turn, so one agent's batch cannot starve another's. The engine exits after 30 idle minutes, and the next call starts it again.

```text
automedia mcp       stdio MCP for one agent
automedia daemon    run the engine in the foreground
automedia status    show the running engine
automedia stop      stop it
```

Options: `--library <dir>` serves another library (`AUTOMEDIA_LIBRARY`), and `--port <n>` runs a second engine beside the first (`AUTOMEDIA_LOOPBACK_PORT`). On `daemon`, `--idle-minutes <n>` sets the idle exit (`0` never exits), and `--export-slots <n>` and `--render-slots <n>` set how much runs at once. The defaults are one export per six cores, and one validation or thumbnail per four cores, between two and six. The default library is the studio's, so agents' compositions appear in the studio. An engine started in the background logs to `engine.log` in the library.

Agents can share one library because the engine serves it alone. Claim a composition with `claim_composition` before writing it. Export jobs report an absolute `outputPath`.

Thumbnails are for people, so the engine renders them only while a studio is open. Edits made with no studio open leave thumbnails stale until one connects.

## Localhost services

The engine listens on `127.0.0.1:47821`:

- `POST /mcp` for Streamable HTTP MCP, for clients that prefer it to stdio
- `POST /api/<operation>` for the studio and the stdio relays
- `GET /health` for the engine's version, library, and process, and whether it is busy
- `GET /events` for server-sent studio and export events
- `GET /compositions/<id>/content/<path>` for rendered project files
- `GET /compositions/<id>/exports/<job-id>` for completed exports

The studio exposes Chromium remote debugging for its window at `http://127.0.0.1:47822`. Override either port when needed:

```bash
AUTOMEDIA_LOOPBACK_PORT=49000 AUTOMEDIA_CDP_PORT=49001 pnpm dev
```

## MCP tools

- Projects: `list_compositions`, `get_composition`, `create_composition`, `update_settings`, `delete_composition`, `save_project`, `import_project`, `import_asset`, `get_activity`, `list_examples`, `reorder_compositions`, `claim_composition`, `release_composition`, `workspace_status`
- Files: `list_files`, `read_file`, `write_file`, `delete_file`
- Media: `get_media`, `probe_media`, `create_block`, `create_music_block`, `put_track`, `delete_track`, `put_marker`, `delete_marker`
- Controls: `list_controls`, `put_control`, `delete_control`
- Runtime: `get_runtime_catalog`, `get_runtime_types`
- Quality and export: `validate`, `start_export`, `get_export`, `cancel_export`

`delete_composition` moves a project into `.trash`. `workspace_status` reports export jobs and composition leases, for one composition when given a `compositionId`. Results name compositions `compositionId` and export jobs `jobId`, as inputs do. Claim a composition before parallel writes. `start_export` runs validation first and queues jobs, which share the engine's export slots with every other agent's. Pass it a `path` to also save the finished file there. `import_asset` copies an image, font, or media file from disk into `assets/`. `validate` seeks to the start of every clip after its fonts load and reports uncaught errors and rejected promises from scripts and renderers. Supported formats are PNG, GIF, WebP, MP4, WebM, MP3, WAV, and OGG. PNG can capture a single time; GIF, WebP, MP4, and WebM render the full composition. MP3, WAV, and OGG export audio only. MP4 and WebM require even dimensions and an opaque background.

## Website

`site/` is [automedia.tyranny.me](https://automedia.tyranny.me): a static page served by a Cloudflare Worker. Every animation on it is a composition under `site/gallery/<id>/` (`meta.json`, `body.html`, `style.css`, `script.js`, plus any extra files) rendered through the real export queue into `site/public/gallery/`, along with the `gallery.json` manifest the page reads:

```bash
SITE_GALLERY=1 pnpm exec vitest run src/engine/write-site-gallery.test.ts
SITE_GALLERY=1 SITE_GALLERY_ONLY=aurora,knot pnpm exec vitest run src/engine/write-site-gallery.test.ts
```

Deploy with `wrangler deploy` from `site/`.

## README banner

The README banner is an Automedia export. Regenerate it through the real export queue:

```bash
README_BANNER=1 pnpm exec vitest run src/engine/write-readme-banner.test.ts
```

## Releases

Pushing a `vX.Y.Z` tag on `main` builds and publishes a GitHub release. The tag sets the version, so `package.json` is not bumped per release. The AppImage and the Windows installer check for a newer release hourly and offer it from the titlebar. The zips do not self-update. A last job builds `cli/` at the release version and force-pushes the release with it to the `cli` branch, which is what `pnpx github:tyrannyme/automedia#cli` runs.

## Repository layout

```text
bin            The automedia command's entry point
docs           README banner and studio screenshots
cli            The agent command's prebuilt bundles, refreshed by each release
src/engine     Library store, loopback server, MCP, operations, render pool, validation, export
src/cli        The automedia command: stdio MCP relay, engine daemon, status and stop
src/main       Electron studio: window, dialogs, settings, updates; a client of the engine
src/preload    Isolated contextBridge API
src/renderer   React studio UI and state
src/shared     Schemas, IPC contracts, clock, limits, and runtime types
fixtures       Media copied into media-backed examples
site           automedia.tyranny.me and the compositions behind its gallery
tools/oxlint   Local oxlint rules
.agents/skills Agent skills, including run-automedia for driving the studio headlessly
```
