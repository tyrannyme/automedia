import { createWriteStream } from "node:fs";
import { readdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import * as v from "valibot";
import { ZipFile } from "yazl";
import { openPromise, validateFileName } from "yauzl";
import { AppError } from "@shared/errors.ts";
import { limits } from "@shared/limits.ts";
import { isBlockKind, isMusicKind } from "@shared/media.ts";
import { normalizeCompositionPath } from "@shared/music-paths.ts";
import {
  catalogsMatch,
  isDeniedProjectPath,
  projectArchiveFormat,
  projectArchiveKind,
  projectArchiveManifestEnvelopeSchema,
  projectArchiveManifestName,
  projectArchiveManifestSchema,
  projectTrackSourcePath,
  shouldCompressArchivePath,
  skipArchiveDirectory,
  type ProjectArchiveCatalog,
  type ProjectArchiveManifest,
} from "@shared/project-archive.ts";
import {
  compositionSchema,
  controlsDocumentSchema,
  legacyCompositionSchema,
  mediaDocumentSchema,
  type Composition,
  type ControlsDocument,
  type MediaDocument,
} from "@shared/schemas.ts";
import { ensureDir, pathExists, resolveInside } from "./fs.ts";

const compositionVersionEnvelopeSchema = v.object({ version: v.number() });
const currentCompositionVersion = 3;

export async function packProjectDirectory(
  sourceDir: string,
  destPath: string,
  manifest: ProjectArchiveManifest,
): Promise<void> {
  const files = await collectArchiveFiles(sourceDir);
  const tempPath = `${destPath}.${randomBytes(6).toString("hex")}.tmp`;
  await ensureDir(path.dirname(destPath));
  const zip = new ZipFile();
  const output = createWriteStream(tempPath);
  const done = pipeline(zip.outputStream, output);
  zip.addBuffer(Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`), projectArchiveManifestName, {
    compress: true,
  });
  for (const relative of files) {
    if (relative === projectArchiveManifestName) continue;
    zip.addFile(path.join(sourceDir, relative), relative, {
      compress: shouldCompressArchivePath(relative),
    });
  }
  zip.end();
  try {
    await done;
    await rename(tempPath, destPath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

export async function extractProjectArchive(archivePath: string, destDir: string): Promise<void> {
  await ensureDir(destDir);
  let zip;
  try {
    zip = await openPromise(archivePath, {
      decodeStrings: true,
      strictFileNames: true,
      validateEntrySizes: true,
    });
  } catch {
    throw new AppError("invalid_project", "not an Automedia project archive");
  }
  let extracted = 0;
  let bytes = 0;
  try {
    for await (const entry of zip.eachEntry()) {
      if (entry.fileName.endsWith("/")) continue;
      if (entry.isEncrypted()) {
        throw new AppError("invalid_project", "encrypted project archives are not supported");
      }
      const relative = normalizeCompositionPath(entry.fileName);
      const nameError = validateFileName(relative);
      if (nameError) {
        throw new AppError("invalid_project", `invalid path in project archive: ${relative}`);
      }
      if (isDeniedProjectPath(relative)) continue;
      resolveInside(destDir, relative);
      extracted += 1;
      if (extracted > limits.maxProjectArchiveFiles) {
        throw new AppError("invalid_project", "project archive has too many files");
      }
      bytes += entry.uncompressedSize;
      if (bytes > limits.maxProjectArchiveBytes) {
        throw new AppError("invalid_project", "project archive is too large");
      }
      const absolute = resolveInside(destDir, relative);
      await ensureDir(path.dirname(absolute));
      const input = await zip.openReadStreamPromise(entry);
      await pipeline(input, createWriteStream(absolute));
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "invalid_project",
      error instanceof Error && error.message.length > 0
        ? error.message
        : "not an Automedia project archive",
    );
  } finally {
    zip.close();
  }
}

export async function readProjectManifest(root: string): Promise<ProjectArchiveManifest> {
  const raw = await readJsonObject(path.join(root, projectArchiveManifestName));
  const envelope = v.safeParse(projectArchiveManifestEnvelopeSchema, raw);
  if (!envelope.success) {
    throw new AppError("invalid_project", "not an Automedia project archive");
  }
  if (envelope.output.kind !== projectArchiveKind) {
    throw new AppError("invalid_project", "not an Automedia project archive");
  }
  if (envelope.output.format !== projectArchiveFormat) {
    throw new AppError(
      "unsupported_project",
      `project format ${envelope.output.format} is newer than this app`,
    );
  }
  const parsed = v.safeParse(projectArchiveManifestSchema, raw);
  if (!parsed.success) {
    throw new AppError("invalid_project", "project archive manifest is invalid");
  }
  return parsed.output;
}

export async function readImportedDocuments(root: string): Promise<{
  composition: Composition | v.InferOutput<typeof legacyCompositionSchema>;
  media: MediaDocument;
  controls: ControlsDocument;
}> {
  for (const name of ["composition.json", "media.json", "controls.json"] as const) {
    if (!(await pathExists(path.join(root, name)))) {
      throw new AppError("invalid_project", `project archive is missing ${name}`);
    }
  }
  const compositionRaw = await readJsonObject(path.join(root, "composition.json"));
  const version = v.safeParse(compositionVersionEnvelopeSchema, compositionRaw);
  if (version.success && version.output.version > currentCompositionVersion) {
    throw new AppError(
      "unsupported_project",
      `composition version ${version.output.version} is newer than this app`,
    );
  }
  const current = v.safeParse(compositionSchema, compositionRaw);
  const legacy = v.safeParse(legacyCompositionSchema, compositionRaw);
  let composition: Composition | v.InferOutput<typeof legacyCompositionSchema>;
  if (current.success) {
    composition = current.output;
  } else if (legacy.success) {
    composition = legacy.output;
  } else {
    throw new AppError("invalid_project", "composition.json is invalid");
  }
  const mediaRaw = await readJsonObject(path.join(root, "media.json"));
  const mediaParsed = v.safeParse(mediaDocumentSchema, mediaRaw);
  if (!mediaParsed.success) {
    throw new AppError("invalid_project", "media.json is invalid");
  }
  const controlsRaw = await readJsonObject(path.join(root, "controls.json"));
  const controlsParsed = v.safeParse(controlsDocumentSchema, controlsRaw);
  if (!controlsParsed.success) {
    throw new AppError("invalid_project", "controls.json is invalid");
  }
  for (const track of mediaParsed.output.tracks) {
    await assertImportedTrackSource(root, track);
  }
  return {
    composition,
    media: mediaParsed.output,
    controls: controlsParsed.output,
  };
}

export function catalogMismatch(
  saved: ProjectArchiveCatalog,
  current: ProjectArchiveCatalog,
): boolean {
  return !catalogsMatch(saved, current);
}

async function assertImportedTrackSource(
  root: string,
  track: MediaDocument["tracks"][number],
): Promise<void> {
  const relative = projectTrackSourcePath(track);
  const absolute = resolveInside(root, relative);
  if (await pathExists(absolute)) return;
  if (isMusicKind(track.kind)) {
    throw new AppError("invalid_project", `music ${track.asset} does not exist`);
  }
  if (isBlockKind(track.kind)) {
    throw new AppError("invalid_project", `block ${track.asset} does not exist`);
  }
  throw new AppError("invalid_project", `asset ${track.asset} does not exist`);
}

async function readJsonObject(filePath: string): Promise<object> {
  let raw: unknown;
  try {
    raw = JSON.parse((await readFile(filePath)).toString("utf8"));
  } catch {
    throw new AppError("invalid_project", `${path.basename(filePath)} is invalid`);
  }
  if (raw === null || Array.isArray(raw) || !(raw instanceof Object)) {
    throw new AppError("invalid_project", `${path.basename(filePath)} is invalid`);
  }
  return raw;
}

async function collectArchiveFiles(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute).replaceAll("\\", "/");
    if (entry.isDirectory()) {
      if (skipArchiveDirectory(relative)) continue;
      files.push(...(await collectArchiveFiles(root, absolute)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (isDeniedProjectPath(relative)) continue;
    files.push(relative);
  }
  return files.toSorted();
}

export async function removeFileIfExists(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
}

export async function writeImportedComposition(
  root: string,
  composition: Composition | v.InferOutput<typeof legacyCompositionSchema>,
): Promise<void> {
  await writeFile(path.join(root, "composition.json"), `${JSON.stringify(composition, null, 2)}\n`);
}

export async function cleanupImportDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
