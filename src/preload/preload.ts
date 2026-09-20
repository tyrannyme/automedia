import { contextBridge, ipcRenderer } from "electron";
import { loopbackHost, loopbackPort } from "@shared/limits.ts";
import { unwrapIpcResult } from "@shared/errors.ts";
import { ipcChannels, type StudioApi } from "@shared/ipc.ts";

async function invoke<T>(channel: string, ...args: [] | [unknown]): Promise<T> {
  // SAFETY: every registered handler returns the shared IpcResult envelope.
  return unwrapIpcResult(await ipcRenderer.invoke(channel, ...args));
}

const studio: StudioApi = {
  app: {
    getInfo: () => invoke(ipcChannels.app.getInfo),
    getSettings: () => invoke(ipcChannels.app.getSettings),
    setSettings: (settings) => invoke(ipcChannels.app.setSettings, settings),
    getHealth: () => invoke(ipcChannels.app.getHealth),
  },
  compositions: {
    list: () => invoke(ipcChannels.compositions.list),
    get: (compositionId) => invoke(ipcChannels.compositions.get, { compositionId }),
    create: (input) =>
      input === undefined
        ? invoke(ipcChannels.compositions.create)
        : invoke(ipcChannels.compositions.create, input),
    updateSettings: (input) => invoke(ipcChannels.compositions.updateSettings, input),
    remove: (compositionId) => invoke(ipcChannels.compositions.remove, { compositionId }),
    duplicate: (compositionId) => invoke(ipcChannels.compositions.duplicate, { compositionId }),
    saveProject: (compositionId) => invoke(ipcChannels.compositions.saveProject, { compositionId }),
    importProject: () => invoke(ipcChannels.compositions.importProject),
    reorder: (ids) => invoke(ipcChannels.compositions.reorder, { ids }),
    loopSeam: (compositionId) => invoke(ipcChannels.compositions.loopSeam, { compositionId }),
  },
  files: {
    list: (compositionId) => invoke(ipcChannels.files.list, { compositionId }),
    read: (compositionId, path) => invoke(ipcChannels.files.read, { compositionId, path }),
    write: (input) => invoke(ipcChannels.files.write, input),
    delete: (compositionId, path) => invoke(ipcChannels.files.delete, { compositionId, path }),
  },
  media: {
    get: (compositionId) => invoke(ipcChannels.media.get, { compositionId }),
    probe: (compositionId, asset) => invoke(ipcChannels.media.probe, { compositionId, asset }),
    createBlock: (compositionId, name, start, lane) =>
      invoke(ipcChannels.media.createBlock, { compositionId, name, start, lane }),
    createMusicBlock: (compositionId, name, start, lane) =>
      invoke(ipcChannels.media.createMusicBlock, { compositionId, name, start, lane }),
    putTrack: (compositionId, track) =>
      invoke(ipcChannels.media.putTrack, { compositionId, track }),
    deleteTrack: (compositionId, trackId) =>
      invoke(ipcChannels.media.deleteTrack, { compositionId, trackId }),
    putMarker: (compositionId, marker) =>
      invoke(ipcChannels.media.putMarker, { compositionId, marker }),
    deleteMarker: (compositionId, markerId) =>
      invoke(ipcChannels.media.deleteMarker, { compositionId, markerId }),
  },
  controls: {
    get: (compositionId) => invoke(ipcChannels.controls.get, { compositionId }),
    put: (compositionId, control) => invoke(ipcChannels.controls.put, { compositionId, control }),
    delete: (compositionId, controlId) =>
      invoke(ipcChannels.controls.delete, { compositionId, controlId }),
  },
  activity: {
    list: (compositionId) => invoke(ipcChannels.activity.list, { compositionId }),
  },
  runtime: {
    catalog: () => invoke(ipcChannels.runtime.catalog),
  },
  validate: {
    run: (compositionId) => invoke(ipcChannels.validate.run, { compositionId }),
  },
  export: {
    start: (input) => invoke(ipcChannels.export.start, input),
    get: (jobId) => invoke(ipcChannels.export.get, { jobId }),
    cancel: (jobId) => invoke(ipcChannels.export.cancel, { jobId }),
    list: (compositionId) => invoke(ipcChannels.export.list, { compositionId }),
    jobs: () => invoke(ipcChannels.export.jobs),
    reveal: (compositionId) => invoke(ipcChannels.export.reveal, { compositionId }),
    saveCopy: (compositionId) => invoke(ipcChannels.export.saveCopy, { compositionId }),
  },
  assets: {
    import: (compositionId) => invoke(ipcChannels.assets.import, { compositionId }),
  },
};

const loopbackPortArg = process.argv.find((value) =>
  value.startsWith("--automedia-loopback-port="),
);
const loopbackPortValue =
  loopbackPortArg?.slice("--automedia-loopback-port=".length) ?? String(loopbackPort);
contextBridge.exposeInMainWorld("studio", studio);
contextBridge.exposeInMainWorld(
  "automediaLoopbackOrigin",
  `http://${loopbackHost}:${loopbackPortValue}`,
);
