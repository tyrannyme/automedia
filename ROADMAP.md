# Roadmap

Follow-ups from the move off FFmpeg to Mediabunny, `modern-gif`, and `wasm-webp`. None of these block exports today.

## Export fidelity

- **Gapless MP3.** MP3 exports start about 23 ms late. LAME's encoder delay is left in the stream because Mediabunny's MP3 muxer writes a Xing frame without the LAME tag that tells decoders to skip it. FFmpeg wrote that tag. Fix it in the muxer (encoder delay and padding in the LAME extension) and extend the onset test in `src/main/export-verify.test.ts` to MP3.
- **Constant-quality MP4.** MP4 still maps quality to a bitrate (`250k + quality × 50k`). The old `libopenh264` undershot that badly; the new H.264 encoder honors it, so busy compositions export up to about 5× larger than before (with better picture). Switch MP4 to a quantizer like WebM already does, and pick the mapping by comparing size against PSNR on the examples.
- **Source sample rate.** Audio now always exports at 48 kHz. FFmpeg kept the first source's rate (often 44.1 kHz). This is harmless; keep it unless a user needs the source rate.

## Upstream

- **`@mediabunny/server` under Electron.** `patches/@mediabunny__server@1.60.0.patch` carries two fixes. Report both upstream and drop the patch once released:
  - Audio frames are filled with `frame.fromBuffer()` and resampled with `convertFrame()`, because Electron's V8 memory cage makes node-av's `frame.data` planes detached copies. Without this, AAC fails and other codecs encode garbage.
  - AAC priming keeps its negative timestamps, so MP4 writes an edit list instead of shifting all audio 21 ms late.
- **`modern-gif` cropping.** Its transparent-border crop scans columns with `y < bottom` instead of `y <= bottom`. A frame whose visible content is a single row, or whose bottom content row reaches past the rows above, loses pixels. This is rare in real renders. Report it, or pad around it if it shows up.
- **`wasm-webp` packaging.** The package entry points do not resolve under Node ESM, and `decodeRGBA` returns a view into freed wasm memory. We load the Emscripten factory directly and decode through `decodeAnimation`, in `src/main/animation.ts` and `src/types/wasm-webp.d.ts`.

## Scale

- **Large animated exports.** GIF and WebP hold every frame in memory, and libwebp's wasm heap caps animated WebP at about 1.5 GB of raw frames (about 20 s of 1080p at 30 fps). Larger WebP exports fail up front with `export_too_large`. A streaming WebP encoder would lift the cap.
- **Frame decode off the main thread.** Video export decodes each screencast PNG to RGBA on the Electron main process. Move `decodePng` to a worker if long exports make the UI stutter.
- **Hardware video encoding.** Video encodes with `prefer-software`, because auto-selected hardware encoders (NVENC here) reject small frames and differ per machine. Try hardware first above a minimum size and fall back to software when opening the encoder fails.

## UI

- **Finished export dialog overflow.** At 800×600 the output path overflows the dialog and "Export again" extends past its edge. This predates the Mediabunny migration. Truncate the path and let the actions wrap, following `DESIGN.md`.
