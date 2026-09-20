export type AutomediaControls = Record<string, boolean | number | string>;

export type AutomediaRendererContext = {
  timeSeconds: number;
  timeMs: number;
  frame: number;
  fps: number;
  width: number;
  height: number;
  durationSeconds: number;
  controls: AutomediaControls;
};

export type AutomediaRenderer = (context: AutomediaRendererContext) => void | Promise<void>;

export type AutomediaDiagnostics = {
  seekApi: boolean;
  controlApi: boolean;
  rendererCount: number;
  scriptErrors: string[];
};

export type AutomediaMediaDiagnostics = {
  prepared: number;
  sought: number;
};

export type AutomediaRuntime = {
  ready(): Promise<void>;
  seek(timeSeconds: number, frame?: number): Promise<void>;
  setControls(values: AutomediaControls): Promise<void>;
  registerRenderer(renderer: AutomediaRenderer): () => void;
  getDiagnostics(): AutomediaDiagnostics;
  getMediaDiagnostics(): AutomediaMediaDiagnostics;
};

export const runtimeTypes = `
export type AutomediaControls = Record<string, boolean | number | string>;

export type AutomediaRendererContext = {
  timeSeconds: number;
  timeMs: number;
  frame: number;
  fps: number;
  width: number;
  height: number;
  durationSeconds: number;
  controls: AutomediaControls;
};

export type AutomediaRenderer = (context: AutomediaRendererContext) => void | Promise<void>;

export type AutomediaDiagnostics = {
  seekApi: boolean;
  controlApi: boolean;
  rendererCount: number;
  scriptErrors: string[];
};

export type AutomediaMediaDiagnostics = {
  prepared: number;
  sought: number;
};

export interface AutomediaRuntime {
  ready(): Promise<void>;
  seek(timeSeconds: number, frame?: number): Promise<void>;
  setControls(values: AutomediaControls): Promise<void>;
  registerRenderer(renderer: AutomediaRenderer): () => void;
  getDiagnostics(): AutomediaDiagnostics;
  getMediaDiagnostics(): AutomediaMediaDiagnostics;
}

declare global {
  interface Window {
    automedia: AutomediaRuntime;
  }
}
`.trim();
