import { registerMediabunnyServer } from "@mediabunny/server";

// Mediabunny ships browser codecs only. The server package backs its encoders
// and decoders with native libav through node-av, so the engine encodes H.264,
// VP9, and audio without any external binary. Import Mediabunny through this
// module so registration always happens first. Codecs stay in software:
// probing hardware contexts crashes the process on machines without a usable
// GPU, and hardware codecs differ per machine.
//
// The engine must run under plain Node. Inside Electron, memalign is
// Chromium's PartitionAlloc, which aborts on the 2 MB-aligned buffers x264
// requests for frames from about 720p up.
registerMediabunnyServer({ hardwareContext: null });

export * from "mediabunny";
