import { cp, readFile, readdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import * as v from "valibot";
import { upsertById } from "@shared/collections.ts";
import { nextClipColor } from "@shared/clip-color.ts";
import { clipsOverlap, compactLanes, nextFreeStart, preferredLane } from "@shared/clips.ts";
import { AppError } from "@shared/errors.ts";
import { applyReorder, sortByOrder } from "@shared/order.ts";
import { contentDuration } from "@shared/duration.ts";
import { limits } from "@shared/limits.ts";
import {
  isBlockKind,
  isImageExtension,
  isImageKind,
  isMediaExtension,
  isMusicKind,
} from "@shared/media.ts";
import { isManagedMusicRuntimePath, musicPatternPath } from "@shared/music-paths.ts";
import { defaultMusicPattern } from "./music-template.ts";
import type { FileRead } from "@shared/ipc.ts";
import {
  compositionSchema,
  controlsDocumentSchema,
  legacyCompositionSchema,
  mediaDocumentSchema,
  type Composition,
  type Control,
  type ControlsDocument,
  type Marker,
  type MediaDocument,
  type MediaTrack,
  type UpdateSettingsInput,
} from "@shared/schemas.ts";
import {
  createId,
  ensureDir,
  etagFor,
  pathExists,
  readBytes,
  removeFile,
  removeToTrash,
  resolveInside,
  writeAtomic,
} from "./fs.ts";
import { probeFile } from "./probe.ts";
import type { ActivityEntry } from "./activity.ts";
import {
  catalogMismatch,
  cleanupImportDir,
  extractProjectArchive,
  packProjectDirectory,
  readImportedDocuments,
  readProjectManifest,
  removeFileIfExists,
  writeImportedComposition,
} from "./project-archive.ts";
import {
  projectArchiveFormat,
  projectArchiveKind,
  projectArchiveManifestName,
  type ImportProjectResult,
  type ProjectArchiveCatalog,
} from "@shared/project-archive.ts";

const activityEntrySchema = v.object({
  at: v.string(),
  operation: v.string(),
  compositionId: v.optional(v.string()),
  detail: v.optional(v.any()),
});

const protectedFiles = new Set(["composition.json"]);
const orderFileName = ".order.json";
const orderSchema = v.object({ ids: v.array(v.string()) });

type CompositionLease = {
  holder: string;
  until: string;
};

type DocumentTrackInput = {
  kind: "block" | "music";
  asset: string;
  name: string;
  mute: boolean;
  start: number;
  requestedLane?: number;
};

const defaultLeaseSeconds = 120;

const defaultHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Untitled</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <script type="module" src="script.js"></script>
  </body>
</html>
`;

export type { FileRead };

export class CompositionStore {
  private readonly tails = new Map<string, Promise<void>>();
  private readonly active = new Set<string>();
  private readonly leases = new Map<string, CompositionLease>();

  constructor(readonly root: string) {}

  private async exclusive<T>(id: string, work: () => Promise<T>): Promise<T> {
    if (this.active.has(id)) return work();
    const tail = this.tails.get(id) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.tails.set(
      id,
      tail.then(() => next),
    );
    await tail;
    this.active.add(id);
    try {
      return await work();
    } finally {
      this.active.delete(id);
      release();
    }
  }

  compositionsDir(): string {
    return path.join(this.root, "compositions");
  }

  trashDir(): string {
    return path.join(this.compositionsDir(), ".trash");
  }

  compositionDir(id: string): string {
    return path.join(this.compositionsDir(), id);
  }

  async list(): Promise<Composition[]> {
    await ensureDir(this.compositionsDir());
    const entries = await readdir(this.compositionsDir(), { withFileTypes: true });
    const compositions: Composition[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) {
        continue;
      }
      compositions.push(await this.get(entry.name));
    }
    return sortByOrder(compositions, await this.readOrder());
  }

  private orderPath(): string {
    return path.join(this.compositionsDir(), orderFileName);
  }

  private async readOrder(): Promise<string[]> {
    if (!(await pathExists(this.orderPath()))) return [];
    try {
      return v.parse(orderSchema, JSON.parse((await readBytes(this.orderPath())).toString("utf8")))
        .ids;
    } catch {
      return [];
    }
  }

  private async writeOrder(ids: string[]): Promise<void> {
    await ensureDir(this.compositionsDir());
    await writeAtomic(this.orderPath(), `${JSON.stringify({ ids }, null, 2)}\n`);
  }

  private async prependOrder(id: string): Promise<void> {
    await this.exclusive("__order__", async () => {
      const current = await this.readOrder();
      await this.writeOrder([id, ...current.filter((item) => item !== id)]);
    });
  }

  async reorder(ids: string[]): Promise<Composition[]> {
    return this.exclusive("__order__", async () => {
      const listed = await this.list();
      await this.writeOrder(
        applyReorder(
          listed.map((item) => item.id),
          ids,
        ),
      );
      return this.list();
    });
  }

  leaseOf(id: string): CompositionLease | null {
    const lease = this.leases.get(id);
    if (!lease) return null;
    if (Date.parse(lease.until) <= Date.now()) {
      this.leases.delete(id);
      return null;
    }
    return lease;
  }

  claim(id: string, holder: string, ttlSeconds = defaultLeaseSeconds): CompositionLease {
    const current = this.leaseOf(id);
    if (current && current.holder !== holder) {
      throw new AppError(
        "composition_busy",
        `${id} is claimed by ${current.holder} until ${current.until}. Claim another composition or wait.`,
      );
    }
    const ttl = Math.min(600, Math.max(30, Math.round(ttlSeconds)));
    const lease = { holder, until: new Date(Date.now() + ttl * 1000).toISOString() };
    this.leases.set(id, lease);
    return lease;
  }

  release(id: string, holder: string): void {
    const current = this.leaseOf(id);
    if (!current) return;
    if (current.holder !== holder) {
      throw new AppError("forbidden", `${id} is claimed by ${current.holder}`);
    }
    this.leases.delete(id);
  }

  async get(id: string): Promise<Composition> {
    const filePath = path.join(this.compositionDir(id), "composition.json");
    if (!(await pathExists(filePath))) {
      throw new AppError("not_found", `composition ${id} does not exist`);
    }
    const raw: unknown = JSON.parse((await readBytes(filePath)).toString("utf8"));
    const current = v.safeParse(compositionSchema, raw);
    if (current.success) return current.output;
    const legacy = v.parse(legacyCompositionSchema, raw);
    return this.migrateV2(legacy);
  }

  private async migrateV2(
    legacy: v.InferOutput<typeof legacyCompositionSchema>,
  ): Promise<Composition> {
    const composition: Composition = {
      version: 3,
      id: legacy.id,
      name: legacy.name,
      width: legacy.width,
      height: legacy.height,
      fps: legacy.fps,
      durationSeconds: legacy.durationSeconds,
      background: legacy.background,
      createdAt: legacy.createdAt,
      updatedAt: new Date().toISOString(),
    };
    const dir = this.compositionDir(composition.id);
    await writeAtomic(
      path.join(dir, "composition.json"),
      `${JSON.stringify(composition, null, 2)}\n`,
    );
    const rootHtml = path.join(dir, "index.html");
    if (await pathExists(rootHtml)) {
      const blockId = createId("b");
      const blockDir = path.join(dir, "blocks", blockId);
      await ensureDir(blockDir);
      await rename(rootHtml, path.join(blockDir, "index.html"));
      for (const file of ["style.css", "script.js"] as const) {
        const from = path.join(dir, file);
        if (await pathExists(from)) {
          await rename(from, path.join(blockDir, file));
        }
      }
      const media = await this.getMedia(composition.id);
      if (!media.tracks.some((track) => track.kind === "block")) {
        media.tracks.unshift({
          id: createId("t"),
          kind: "block",
          asset: blockId,
          name: composition.name,
          start: 0,
          duration: composition.durationSeconds,
          trimStart: 0,
          rate: 1,
          volume: 1,
          mute: true,
          lane: 0,
        });
        await this.writeMedia(composition.id, v.parse(mediaDocumentSchema, media));
      }
    }
    return composition;
  }

  async listActivity(id: string): Promise<ActivityEntry[]> {
    await this.get(id);
    const filePath = path.join(this.compositionDir(id), ".agent-activity.jsonl");
    let contents: string;
    try {
      contents = await readFile(filePath, "utf8");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
    const entries: ActivityEntry[] = [];
    for (const line of contents.split("\n")) {
      if (line.trim() === "") {
        continue;
      }
      try {
        const parsed = v.safeParse(activityEntrySchema, JSON.parse(line));
        if (!parsed.success) {
          continue;
        }
        const entry: ActivityEntry = {
          at: parsed.output.at,
          operation: parsed.output.operation,
        };
        if (parsed.output.compositionId !== undefined) {
          entry.compositionId = parsed.output.compositionId;
        }
        if (parsed.output.detail !== undefined) {
          entry.detail = parsed.output.detail;
        }
        entries.push(entry);
      } catch {
        // Activity logs are append-only; one malformed line must not hide later entries.
      }
    }
    return entries;
  }

  async create(name = "Untitled"): Promise<Composition> {
    const now = new Date().toISOString();
    const composition: Composition = {
      version: 3,
      id: createId("c"),
      name,
      width: 800,
      height: 600,
      fps: 30,
      durationSeconds: 3,
      background: "transparent",
      createdAt: now,
      updatedAt: now,
    };
    const dir = this.compositionDir(composition.id);
    await ensureDir(path.join(dir, "assets"));
    await ensureDir(path.join(dir, "exports"));
    await ensureDir(path.join(dir, "blocks"));
    await ensureDir(path.join(dir, "music"));
    await writeAtomic(
      path.join(dir, "composition.json"),
      `${JSON.stringify(composition, null, 2)}\n`,
    );
    await writeAtomic(
      path.join(dir, "media.json"),
      `${JSON.stringify({ tracks: [], markers: [] } satisfies MediaDocument, null, 2)}\n`,
    );
    await writeAtomic(
      path.join(dir, "controls.json"),
      `${JSON.stringify({ controls: [] } satisfies ControlsDocument, null, 2)}\n`,
    );
    await this.prependOrder(composition.id);
    return composition;
  }

  async duplicate(id: string): Promise<Composition> {
    const current = await this.get(id);
    const nextId = createId("c");
    const source = this.compositionDir(id);
    const dest = this.compositionDir(nextId);
    await cp(source, dest, { recursive: true });
    const now = new Date().toISOString();
    const next: Composition = {
      ...current,
      id: nextId,
      name: `${current.name} copy`,
      createdAt: now,
      updatedAt: now,
    };
    const parsed = v.parse(compositionSchema, next);
    await writeAtomic(path.join(dest, "composition.json"), `${JSON.stringify(parsed, null, 2)}\n`);
    await this.prependOrder(parsed.id);
    return parsed;
  }

  async saveProject(
    id: string,
    destPath: string,
    appVersion: string,
    catalog: ProjectArchiveCatalog,
  ): Promise<void> {
    return this.exclusive(id, async () => {
      await this.get(id);
      await packProjectDirectory(this.compositionDir(id), destPath, {
        kind: projectArchiveKind,
        format: projectArchiveFormat,
        appVersion,
        catalog,
      });
    });
  }

  async importProject(
    archivePath: string,
    catalog: ProjectArchiveCatalog,
  ): Promise<ImportProjectResult> {
    return this.exclusive("__import__", () => this.importProjectNow(archivePath, catalog));
  }

  private async importProjectNow(
    archivePath: string,
    catalog: ProjectArchiveCatalog,
  ): Promise<ImportProjectResult> {
    await ensureDir(this.compositionsDir());
    const tempDir = path.join(this.compositionsDir(), `.import-${createId("i")}`);
    await ensureDir(tempDir);
    try {
      await extractProjectArchive(archivePath, tempDir);
      const manifest = await readProjectManifest(tempDir);
      const documents = await readImportedDocuments(tempDir);
      const nextId = createId("c");
      await writeImportedComposition(tempDir, { ...documents.composition, id: nextId });
      await removeFileIfExists(path.join(tempDir, projectArchiveManifestName));
      await ensureDir(path.join(tempDir, "assets"));
      await ensureDir(path.join(tempDir, "exports"));
      await ensureDir(path.join(tempDir, "blocks"));
      await ensureDir(path.join(tempDir, "music"));
      const dest = this.compositionDir(nextId);
      await rename(tempDir, dest);
      try {
        const migrated = await this.get(nextId);
        const now = new Date().toISOString();
        const next: Composition = {
          ...migrated,
          id: nextId,
          createdAt: now,
          updatedAt: now,
        };
        const parsed = v.parse(compositionSchema, next);
        await writeAtomic(
          path.join(dest, "composition.json"),
          `${JSON.stringify(parsed, null, 2)}\n`,
        );
        await this.prependOrder(parsed.id);
        return {
          composition: parsed,
          catalogMismatch: catalogMismatch(manifest.catalog, catalog),
        };
      } catch (error) {
        await cleanupImportDir(dest);
        throw error;
      }
    } catch (error) {
      await cleanupImportDir(tempDir);
      throw error;
    }
  }

  async createBlock(
    id: string,
    name?: string,
    start = 0,
    requestedLane?: number,
  ): Promise<MediaTrack> {
    return this.createDocumentTrack(
      id,
      "block",
      "Block",
      {
        html: defaultHtml,
        css: "html, body { margin: 0; }\n",
        js: "\n",
      },
      true,
      name,
      start,
      requestedLane,
    );
  }

  async createMusicBlock(
    id: string,
    name?: string,
    start = 0,
    requestedLane?: number,
  ): Promise<MediaTrack> {
    const media = await this.getMedia(id);
    const musicId = createId("s");
    const label =
      name ?? `Music ${media.tracks.filter((track) => isMusicKind(track.kind)).length + 1}`;
    const dir = path.join(this.compositionDir(id), "music", musicId);
    await ensureDir(dir);
    await writeAtomic(path.join(dir, "pattern.js"), defaultMusicPattern);
    const input: DocumentTrackInput = {
      kind: "music",
      asset: musicId,
      name: label,
      mute: false,
      start,
    };
    if (requestedLane !== undefined) input.requestedLane = requestedLane;
    return this.insertDocumentTrack(id, media, input);
  }

  private async createDocumentTrack(
    id: string,
    kind: "block",
    labelPrefix: string,
    files: { html: string; css: string; js: string },
    mute: boolean,
    name?: string,
    start = 0,
    requestedLane?: number,
  ): Promise<MediaTrack> {
    const media = await this.getMedia(id);
    const blockId = createId("b");
    const label =
      name ?? `${labelPrefix} ${media.tracks.filter((track) => track.kind === kind).length + 1}`;
    const dir = path.join(this.compositionDir(id), "blocks", blockId);
    await ensureDir(dir);
    await writeAtomic(path.join(dir, "index.html"), files.html.replace("Untitled", label));
    await writeAtomic(path.join(dir, "style.css"), files.css);
    await writeAtomic(path.join(dir, "script.js"), files.js);
    const input: DocumentTrackInput = {
      kind,
      asset: blockId,
      name: label,
      mute,
      start,
    };
    if (requestedLane !== undefined) input.requestedLane = requestedLane;
    return this.insertDocumentTrack(id, media, input);
  }

  private async insertDocumentTrack(
    id: string,
    media: MediaDocument,
    input: DocumentTrackInput,
  ): Promise<MediaTrack> {
    const lane = preferredLane(media.tracks, input.kind, input.requestedLane);
    const track: MediaTrack = {
      id: createId("t"),
      kind: input.kind,
      asset: input.asset,
      name: input.name,
      color: nextClipColor(media.tracks),
      start: nextFreeStart(
        media.tracks,
        lane,
        Math.max(0, input.start),
        limits.defaultBlockSeconds,
      ),
      duration: limits.defaultBlockSeconds,
      trimStart: 0,
      rate: 1,
      volume: 1,
      mute: input.mute,
      lane,
    };
    await this.putTrack(id, track);
    return track;
  }

  async updateSettings(input: UpdateSettingsInput): Promise<Composition> {
    return this.exclusive(input.compositionId, () => this.updateSettingsNow(input));
  }

  private async updateSettingsNow(input: UpdateSettingsInput): Promise<Composition> {
    const current = await this.get(input.compositionId);
    const next: Composition = {
      ...current,
      name: input.name ?? current.name,
      width: input.width ?? current.width,
      height: input.height ?? current.height,
      fps: input.fps ?? current.fps,
      durationSeconds: input.durationSeconds ?? current.durationSeconds,
      background: input.background ?? current.background,
      updatedAt: new Date().toISOString(),
    };
    const parsed = v.parse(compositionSchema, next);
    await writeAtomic(
      path.join(this.compositionDir(parsed.id), "composition.json"),
      `${JSON.stringify(parsed, null, 2)}\n`,
    );
    return parsed;
  }

  async remove(id: string): Promise<void> {
    const dir = this.compositionDir(id);
    if (!(await pathExists(dir))) {
      throw new AppError("not_found", `composition ${id} does not exist`);
    }
    await removeToTrash(dir, this.trashDir());
    await this.exclusive("__order__", async () => {
      const current = await this.readOrder();
      await this.writeOrder(current.filter((item) => item !== id));
    });
    this.leases.delete(id);
  }

  async listFiles(id: string): Promise<string[]> {
    const dir = this.compositionDir((await this.get(id)).id);
    return collectFiles(dir, dir);
  }

  async readFile(id: string, relativePath: string): Promise<FileRead> {
    await this.get(id);
    const absolute = resolveInside(this.compositionDir(id), relativePath);
    if (!(await pathExists(absolute))) {
      throw new AppError("not_found", `${relativePath} does not exist`);
    }
    const bytes = await readBytes(absolute);
    const text = bytes.toString("utf8");
    const looksBinary = text.includes("\0");
    return {
      path: relativePath.replaceAll("\\", "/"),
      encoding: looksBinary ? "base64" : "utf8",
      content: looksBinary ? bytes.toString("base64") : text,
      etag: etagFor(bytes),
    };
  }

  async writeFile(
    id: string,
    relativePath: string,
    encoding: "utf8" | "base64",
    content: string,
    expectedEtag: string,
  ): Promise<FileRead> {
    return this.exclusive(id, () =>
      this.writeFileNow(id, relativePath, encoding, content, expectedEtag),
    );
  }

  private async writeFileNow(
    id: string,
    relativePath: string,
    encoding: "utf8" | "base64",
    content: string,
    expectedEtag: string,
  ): Promise<FileRead> {
    await this.get(id);
    const normalized = relativePath.replaceAll("\\", "/");
    if (normalized === "composition.json") {
      throw new AppError("forbidden", "composition.json cannot be written as a loose file");
    }
    if (isManagedMusicRuntimePath(normalized)) {
      throw new AppError("forbidden", "music runtime files are managed and cannot be written");
    }
    const absolute = resolveInside(this.compositionDir(id), normalized);
    if (await pathExists(absolute)) {
      const current = etagFor(await readBytes(absolute));
      if (current !== expectedEtag) {
        throw new AppError(
          "revision_conflict",
          "etag does not match the file on disk. Read the file again and retry; another writer updated it.",
        );
      }
    } else if (expectedEtag !== "") {
      throw new AppError("revision_conflict", "file does not exist; expectedEtag must be empty");
    }
    const bytes =
      encoding === "base64" ? Buffer.from(content, "base64") : Buffer.from(content, "utf8");
    await writeAtomic(absolute, bytes);
    await this.touch(id);
    return this.readFile(id, normalized);
  }

  async deleteFile(id: string, relativePath: string): Promise<void> {
    await this.get(id);
    const normalized = relativePath.replaceAll("\\", "/");
    if (protectedFiles.has(normalized)) {
      throw new AppError("forbidden", `${normalized} cannot be deleted`);
    }
    if (isManagedMusicRuntimePath(normalized)) {
      throw new AppError("forbidden", "music runtime files are managed and cannot be deleted");
    }
    const absolute = resolveInside(this.compositionDir(id), normalized);
    if (!(await pathExists(absolute))) {
      throw new AppError("not_found", `${normalized} does not exist`);
    }
    await removeFile(absolute);
    await this.touch(id);
  }

  async getMedia(id: string): Promise<MediaDocument> {
    await this.get(id);
    const filePath = path.join(this.compositionDir(id), "media.json");
    return v.parse(mediaDocumentSchema, JSON.parse((await readBytes(filePath)).toString("utf8")));
  }

  private async fitDuration(id: string, tracks: readonly MediaTrack[]): Promise<Composition> {
    const composition = await this.get(id);
    const durationSeconds = contentDuration(tracks);
    if (Math.abs(composition.durationSeconds - durationSeconds) < 1e-6) return composition;
    return this.updateSettings({ compositionId: id, durationSeconds });
  }

  async putTrack(id: string, track: MediaTrack): Promise<MediaDocument> {
    return this.exclusive(id, () => this.putTrackNow(id, track));
  }

  private async putTrackNow(id: string, track: MediaTrack): Promise<MediaDocument> {
    const media = await this.getMedia(id);
    await this.assertTrackSource(id, track);
    const mixedKind = media.tracks.some(
      (existing) =>
        existing.id !== track.id && existing.lane === track.lane && existing.kind !== track.kind,
    );
    if (mixedKind) {
      throw new AppError("invalid_track", "a lane cannot mix clip kinds");
    }
    const overlapping = media.tracks.some(
      (existing) =>
        existing.id !== track.id && existing.lane === track.lane && clipsOverlap(existing, track),
    );
    if (overlapping) {
      throw new AppError("invalid_track", "clips on the same lane must not overlap");
    }
    const next = v.parse(mediaDocumentSchema, {
      ...media,
      tracks: upsertById(media.tracks, track),
    });
    await this.writeMedia(id, next);
    await this.fitDuration(id, next.tracks);
    return next;
  }

  private async assertTrackSource(id: string, track: MediaTrack): Promise<void> {
    if (isMusicKind(track.kind)) {
      const pattern = path.join(this.compositionDir(id), musicPatternPath(track.asset));
      if (!(await pathExists(pattern))) {
        throw new AppError("not_found", `music ${track.asset} does not exist`);
      }
      return;
    }
    if (isBlockKind(track.kind)) {
      const blockHtml = path.join(this.compositionDir(id), "blocks", track.asset, "index.html");
      if (!(await pathExists(blockHtml))) {
        throw new AppError("not_found", `${track.kind} ${track.asset} does not exist`);
      }
      return;
    }
    const assetPath = resolveInside(path.join(this.compositionDir(id), "assets"), track.asset);
    if (!(await pathExists(assetPath))) {
      throw new AppError("not_found", `asset ${track.asset} does not exist`);
    }
    const extension = path.extname(track.asset).slice(1).toLowerCase();
    if (isImageKind(track.kind)) {
      if (!isImageExtension(extension)) {
        throw new AppError("invalid_asset", `unsupported container .${extension}`);
      }
      if (!track.mute) {
        throw new AppError("invalid_track", "an image track must be muted");
      }
      return;
    }
    if (!isMediaExtension(extension)) {
      throw new AppError("invalid_asset", `unsupported container .${extension}`);
    }
    const probe = await probeFile(assetPath);
    const hasAudio = probe.streams.some((stream) => stream.codecType === "audio");
    const hasVideo = probe.streams.some((stream) => stream.codecType === "video");
    if (track.kind === "audio" && !hasAudio) {
      throw new AppError("invalid_track", "audio track requires an audio stream");
    }
    if (track.kind === "video" && !hasVideo) {
      throw new AppError("invalid_track", "video track requires a video stream");
    }
    if (track.kind === "video" && !hasAudio && !track.mute) {
      throw new AppError("invalid_track", "a video track with no audio stream must be muted");
    }
    const sourceDuration = Math.max(
      probe.durationSeconds,
      ...probe.streams.map((stream) => stream.durationSeconds),
    );
    if (track.trimStart + track.duration * track.rate > sourceDuration + 1e-6) {
      throw new AppError("invalid_track", "trim, duration, and rate run past the source");
    }
  }

  async deleteTrack(id: string, trackId: string): Promise<MediaDocument> {
    return this.exclusive(id, () => this.deleteTrackNow(id, trackId));
  }

  private async deleteTrackNow(id: string, trackId: string): Promise<MediaDocument> {
    const media = await this.getMedia(id);
    if (!media.tracks.some((track) => track.id === trackId)) {
      throw new AppError("not_found", `track ${trackId} does not exist`);
    }
    const next = v.parse(mediaDocumentSchema, {
      ...media,
      tracks: compactLanes(media.tracks.filter((track) => track.id !== trackId)),
    });
    await this.writeMedia(id, next);
    await this.fitDuration(id, next.tracks);
    return next;
  }

  async putMarker(id: string, marker: Marker): Promise<MediaDocument> {
    return this.exclusive(id, () => this.putMarkerNow(id, marker));
  }

  private async putMarkerNow(id: string, marker: Marker): Promise<MediaDocument> {
    const composition = await this.get(id);
    if (marker.timeSeconds > composition.durationSeconds) {
      throw new AppError("invalid_marker", "marker is outside the composition");
    }
    const media = await this.getMedia(id);
    const next = v.parse(mediaDocumentSchema, {
      ...media,
      markers: upsertById(media.markers, marker),
    });
    await this.writeMedia(id, next);
    return next;
  }

  async deleteMarker(id: string, markerId: string): Promise<MediaDocument> {
    return this.exclusive(id, () => this.deleteMarkerNow(id, markerId));
  }

  private async deleteMarkerNow(id: string, markerId: string): Promise<MediaDocument> {
    const media = await this.getMedia(id);
    if (!media.markers.some((marker) => marker.id === markerId)) {
      throw new AppError("not_found", `marker ${markerId} does not exist`);
    }
    const next = v.parse(mediaDocumentSchema, {
      ...media,
      markers: media.markers.filter((marker) => marker.id !== markerId),
    });
    await this.writeMedia(id, next);
    return next;
  }

  async getControls(id: string): Promise<ControlsDocument> {
    await this.get(id);
    const filePath = path.join(this.compositionDir(id), "controls.json");
    return v.parse(
      controlsDocumentSchema,
      JSON.parse((await readBytes(filePath)).toString("utf8")),
    );
  }

  async putControl(id: string, control: Control): Promise<ControlsDocument> {
    return this.exclusive(id, () => this.putControlNow(id, control));
  }

  private async putControlNow(id: string, control: Control): Promise<ControlsDocument> {
    await this.get(id);
    const document = await this.getControls(id);
    const next = v.parse(controlsDocumentSchema, {
      controls: upsertById(document.controls, control),
    });
    await writeAtomic(
      path.join(this.compositionDir(id), "controls.json"),
      `${JSON.stringify(next, null, 2)}\n`,
    );
    await this.touch(id);
    return next;
  }

  async deleteControl(id: string, controlId: string): Promise<ControlsDocument> {
    return this.exclusive(id, () => this.deleteControlNow(id, controlId));
  }

  private async deleteControlNow(id: string, controlId: string): Promise<ControlsDocument> {
    const document = await this.getControls(id);
    if (!document.controls.some((control) => control.id === controlId)) {
      throw new AppError("not_found", `control ${controlId} does not exist`);
    }
    const next = v.parse(controlsDocumentSchema, {
      controls: document.controls.filter((control) => control.id !== controlId),
    });
    await writeAtomic(
      path.join(this.compositionDir(id), "controls.json"),
      `${JSON.stringify(next, null, 2)}\n`,
    );
    await this.touch(id);
    return next;
  }

  private async writeMedia(id: string, document: MediaDocument): Promise<void> {
    await writeAtomic(
      path.join(this.compositionDir(id), "media.json"),
      `${JSON.stringify(document, null, 2)}\n`,
    );
    await this.touch(id);
  }

  private async touch(id: string): Promise<void> {
    const current = await this.get(id);
    const next = { ...current, updatedAt: new Date().toISOString() };
    await writeAtomic(
      path.join(this.compositionDir(id), "composition.json"),
      `${JSON.stringify(next, null, 2)}\n`,
    );
  }
}

async function collectFiles(root: string, current: string): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(root, absolute)));
      continue;
    }
    const info = await stat(absolute);
    if (info.isFile()) {
      files.push(path.relative(root, absolute).replaceAll("\\", "/"));
    }
  }
  return files.toSorted();
}

export type { Composition, Control, Marker, MediaDocument, MediaTrack };
