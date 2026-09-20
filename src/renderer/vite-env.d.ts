/// <reference types="vite/client" />

import type { StudioApi } from "@shared/ipc.ts";

declare global {
  interface Window {
    studio: StudioApi;
    automediaLoopbackOrigin: string;
  }
}
