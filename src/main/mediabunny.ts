import { registerMediabunnyServer } from "@mediabunny/server";
import { registerEncoder } from "mediabunny";
import { ChromiumAvcEncoder } from "./chromium-video-encoder.ts";

// Mediabunny ships browser codecs only. The server package backs its encoders
// and decoders with native libav through node-av, so the main process and
// plain Node tests can encode without any external binary. Import Mediabunny
// through this module so registration always happens first. Codecs stay in
// software: probing hardware contexts crashes the process on machines without
// a usable GPU, and hardware codecs differ per machine.
//
// Mediabunny uses the first registered encoder that supports a codec, so in
// Electron, Chromium's H.264 encoder goes ahead of node-av's x264, which
// crashes there. Plain Node tests keep x264.
if (process.versions.electron) registerEncoder(ChromiumAvcEncoder);
registerMediabunnyServer({ hardwareContext: null });

export * from "mediabunny";
