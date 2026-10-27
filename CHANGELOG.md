# Changelog

Notable changes to Automedia. Releases also list every merged pull request.

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
