import * as v from "valibot";
import type { ActivityEntry } from "../main/activity.ts";
import type { ExportJob } from "../main/export.ts";
import type { ProbeResult } from "../main/probe.ts";
import type { ValidationReport } from "../main/validate.ts";
import type { RuntimeCatalog } from "../main/runtime.ts";
import type { FfmpegHealth } from "./ffmpeg.ts";
import type { ExampleId } from "../main/examples/index.ts";
import type { ImportProjectResult } from "./project-archive.ts";
import type {
  Composition,
  Control,
  ControlsDocument,
  ExportFormat,
  Marker,
  MediaDocument,
  MediaTrack,
  StartExportInput,
  UpdateSettingsInput,
  WriteFileInput,
  AppSettings,
} from "./schemas.ts";

export const ipcChannels = {
  app: {
    getInfo: "app.getInfo",
    getSettings: "app.getSettings",
    setSettings: "app.setSettings",
    getHealth: "app.getHealth",
  },
  compositions: {
    list: "compositions.list",
    get: "compositions.get",
    create: "compositions.create",
    updateSettings: "compositions.updateSettings",
    remove: "compositions.remove",
    duplicate: "compositions.duplicate",
    saveProject: "compositions.saveProject",
    importProject: "compositions.importProject",
    reorder: "compositions.reorder",
    loopSeam: "compositions.loopSeam",
  },
  files: {
    list: "files.list",
    read: "files.read",
    write: "files.write",
    delete: "files.delete",
  },
  media: {
    get: "media.get",
    probe: "media.probe",
    createBlock: "media.createBlock",
    createMusicBlock: "media.createMusicBlock",
    putTrack: "media.putTrack",
    deleteTrack: "media.deleteTrack",
    putMarker: "media.putMarker",
    deleteMarker: "media.deleteMarker",
  },
  controls: {
    get: "controls.get",
    put: "controls.put",
    delete: "controls.delete",
  },
  activity: {
    list: "activity.list",
  },
  runtime: {
    catalog: "runtime.catalog",
  },
  validate: {
    run: "validate.run",
  },
  export: {
    start: "export.start",
    get: "export.get",
    cancel: "export.cancel",
    list: "export.list",
    jobs: "export.jobs",
    reveal: "export.reveal",
    saveCopy: "export.saveCopy",
  },
  assets: {
    import: "assets.import",
  },
} as const;

export const appInfoSchema = v.object({
  name: v.string(),
  version: v.string(),
});

export type AppInfo = v.InferOutput<typeof appInfoSchema>;

export type FileRead = {
  path: string;
  encoding: "utf8" | "base64";
  content: string;
  etag: string;
};

export type ExportFile = {
  jobId: string;
  format: ExportFormat;
  fileName: string;
  mtimeMs: number;
};

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export type StudioApi = {
  app: {
    getInfo: () => Promise<AppInfo>;
    getSettings: () => Promise<AppSettings>;
    setSettings: (settings: AppSettings) => Promise<AppSettings>;
    getHealth: () => Promise<FfmpegHealth>;
  };
  compositions: {
    list: () => Promise<Composition[]>;
    get: (compositionId: string) => Promise<Composition>;
    create: (input?: { name?: string; example?: ExampleId }) => Promise<Composition>;
    updateSettings: (input: UpdateSettingsInput) => Promise<Composition>;
    remove: (compositionId: string) => Promise<void>;
    duplicate: (compositionId: string) => Promise<Composition>;
    saveProject: (compositionId: string) => Promise<{ path: string } | null>;
    importProject: () => Promise<ImportProjectResult | null>;
    reorder: (ids: string[]) => Promise<Composition[]>;
    loopSeam: (compositionId: string) => Promise<{ match: boolean }>;
  };
  files: {
    list: (compositionId: string) => Promise<string[]>;
    read: (compositionId: string, path: string) => Promise<FileRead>;
    write: (input: WriteFileInput) => Promise<FileRead>;
    delete: (compositionId: string, path: string) => Promise<void>;
  };
  media: {
    get: (compositionId: string) => Promise<MediaDocument>;
    probe: (compositionId: string, asset: string) => Promise<ProbeResult>;
    createBlock: (
      compositionId: string,
      name?: string,
      start?: number,
      lane?: number,
    ) => Promise<MediaTrack>;
    createMusicBlock: (
      compositionId: string,
      name?: string,
      start?: number,
      lane?: number,
    ) => Promise<MediaTrack>;
    putTrack: (compositionId: string, track: MediaTrack) => Promise<MediaDocument>;
    deleteTrack: (compositionId: string, trackId: string) => Promise<MediaDocument>;
    putMarker: (compositionId: string, marker: Marker) => Promise<MediaDocument>;
    deleteMarker: (compositionId: string, markerId: string) => Promise<MediaDocument>;
  };
  controls: {
    get: (compositionId: string) => Promise<ControlsDocument>;
    put: (compositionId: string, control: Control) => Promise<ControlsDocument>;
    delete: (compositionId: string, controlId: string) => Promise<ControlsDocument>;
  };
  activity: {
    list: (compositionId: string) => Promise<ActivityEntry[]>;
  };
  runtime: {
    catalog: () => Promise<RuntimeCatalog>;
  };
  validate: {
    run: (compositionId: string) => Promise<ValidationReport>;
  };
  export: {
    start: (input: StartExportInput) => Promise<ExportJob>;
    get: (jobId: string) => Promise<ExportJob>;
    cancel: (jobId: string) => Promise<ExportJob>;
    list: (compositionId: string) => Promise<ExportFile[]>;
    jobs: () => Promise<ExportJob[]>;
    reveal: (compositionId: string) => Promise<void>;
    saveCopy: (compositionId: string) => Promise<void>;
  };
  assets: {
    import: (compositionId: string) => Promise<{ asset: string } | null>;
  };
};
