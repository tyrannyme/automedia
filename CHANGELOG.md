# Changelog

Notable changes to Automedia. Releases also list every merged pull request.

## 0.6.0 (27 Oct 2026)

### Breaking

- Exports are named after the project instead of the job id: `four-chords.mp4`, `four-chords-f79.png` for a still at frame 79, and `four-chords-2.mp4` when the name is taken. Scripts that built a path from the job id should read `outputPath` from `get_export` instead. `exports/.exports.json` maps each file back to its job, so content URLs keep working, including for exports made before this release.

### Changed

- The studio is redesigned around the picture. Open projects are tabs in the titlebar and Home is a gallery of every project, so the project sidebar is gone. The picture is the largest thing on screen, with a player under it and the editing tools on the timeline's own bar.
- Clips show what is in them: visual blocks and videos as filmstrips of their own frames, audio as its waveform. The clip's colour is a dot on its label.
- With nothing selected, the side panel is the project's dashboard: controls, what the agent just did, media, and finished exports. Select a clip and it becomes the clip. Below 1000 px wide it opens as a sheet.
- While an agent holds a project, the titlebar names it and what it just did, and its tab shows its initial. Click for its recent activity, grouped into bursts, and the time left on its claim.
- The export dialog shows the frame at the playhead and the file you will get, groups formats by what they make, counts real frames while it runs, and ends with a receipt you can play.
- Code mode shows its save status, and when an agent writes the same file first, it pauses autosave and shows what each of you changed.
- Controls: colour wells, segmented choices for short selects, and full-width sliders.
- Text that only labels a value is darker in light mode and lighter in dark mode, so it passes WCAG AA everywhere.

### Added

- First run offers templates beside the MCP setup for connecting an agent.
- A New sheet with every engine example, and a command palette on Ctrl K / ⌘K.
- `GET /compositions/<id>/thumbnail.png?t=<seconds>&h=<pixels>` renders one frame at that time, as the timeline's filmstrips use.
- `claim_composition` and `release_composition` send studio events, so the studio shows a claim as soon as an agent makes it.
- `AUTOMEDIA_CHROMIUM_EXECUTABLE_PATH` points the engine at a Chromium headless shell you've already installed, for cloud computers and sandboxes that can't download one on first render. Every browser the engine starts uses it, including the video frame farm. A bad path or a failed launch is an error; Automedia never downloads or falls back to another browser when it's set. See [Headless cloud rendering](docs/cloud.md).

### Fixed

- Coming back to a project's tab no longer shows its first frame under the right clock.
- The trash dialog says what really happens: the project folder moves into the library's `compositions/.trash/`.

## 0.5.0 (27 Oct 2026)

### Breaking

- Images and videos in blocks are no longer capped at their container's width. Tailwind's Preflight, which every page loads, sets `max-width: 100%` on `img` and `video`; Automedia now lifts that, so an image keeps the width it's given. A block that relied on the cap to fit an image to its container needs `max-w-full` (or `max-width: 100%`) on it.

### Fixed

- MP4 and WebM exports no longer capture frames from the wrong time, or half drawn, when a block renders asynchronously and the composition has music.
- Rendered music starts on its first beat, not about 0.1 s late.
- MP4 and WebM exports no longer show a video clip's earlier frame, or a black frame, just after a cut.
- `import_asset` accepts `.txt` files, such as a font's licence.

### Changed

- MP4 and WebM exports are many times faster. Frames are captured by a farm of headless browsers that draw only on command, one per two cores up to sixteen. Videos get seek proxies, built on an NVIDIA GPU when there is one and cached in the library's `cache/seek-proxies`. Music renders offline instead of in real time. H.264 encodes with NVENC when available. A 65 s 1080p60 trailer with six video clips and music went from 17 to 25 minutes to about 31 s (41 s the first time, while it builds the proxies) on 24 cores with an NVIDIA GPU.
- MP4 and WebM exports are BT.709 and tagged so. They used to be BT.601 and untagged, so players could show colours slightly off.
- `get_export` reports `frame` of `frames` while a GIF, WebP, MP4, or WebM export captures.
