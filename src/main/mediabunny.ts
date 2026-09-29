import { registerMediabunnyServer } from "@mediabunny/server";

// Mediabunny ships browser codecs only. The server package backs its encoders
// and decoders with native libav through node-av, so the main process and
// plain Node tests can encode without any external binary. Import Mediabunny
// through this module so registration always happens first.
registerMediabunnyServer();

export * from "mediabunny";
