import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { crc32 } from "node:zlib";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ZipFile } from "yazl";
import { openPromise } from "yauzl";
import { AppError } from "@shared/errors.ts";
import { projectArchiveManifestName } from "@shared/project-archive.ts";
import { appendActivity } from "./activity.ts";
import { pathExists } from "./fs.ts";
import { CompositionStore } from "./store.ts";

const dirs: string[] = [];
const catalog = {
  three: "0.185.1",
  tailwindBrowser: "4.3.3",
  motion: "13.1.0",
  strudel: "1.2.8",
  vgpu: "0.3.0",
};
const pixel =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempStore(): Promise<CompositionStore> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "automedia-archive-"));
  dirs.push(dir);
  return new CompositionStore(dir);
}

function utf8(text: string): Uint8Array {
  return Buffer.from(text, "utf8");
}

function storeZip(entries: { name: string; data: Uint8Array }[]): Buffer {
  const parts: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralBuf, eocd]);
}

function manifestJson(format = 1): string {
  return `${JSON.stringify(
    {
      kind: "automedia.composition",
      format,
      appVersion: "0.1.0",
      catalog,
    },
    null,
    2,
  )}\n`;
}

async function writeZip(filePath: string, files: Map<string, string>): Promise<void> {
  const zip = new ZipFile();
  const done = pipeline(zip.outputStream, createWriteStream(filePath));
  for (const [name, data] of files) {
    zip.addBuffer(Buffer.from(data), name);
  }
  zip.end();
  await done;
}

describe("composition project archive", () => {
  it("round-trips authored files, keeps extra files, and drops derived junk", async () => {
    const store = await tempStore();
    const created = await store.create("Clock");
    const block = await store.createBlock(created.id, "Intro");
    const music = await store.createMusicBlock(created.id, "Theme");
    await store.writeFile(created.id, "notes.md", "utf8", "keep me\n", "");
    await store.writeFile(created.id, "assets/dot.png", "base64", pixel, "");
    const thumbnailDir = path.join(store.compositionDir(created.id), ".automedia");
    await mkdir(thumbnailDir, { recursive: true });
    await writeFile(path.join(thumbnailDir, "thumbnail.png"), Buffer.from(pixel, "base64"));
    await writeFile(path.join(store.compositionDir(created.id), "exports", "job.mp4"), "export");
    await writeFile(
      path.join(store.compositionDir(created.id), "music", music.asset, "index.html"),
      "<html></html>",
    );
    await appendActivity(store.compositionDir(created.id), {
      at: "2026-01-01T00:00:00.000Z",
      operation: "create_composition",
      compositionId: created.id,
    });

    const archivePath = path.join(store.root, "Clock.automedia");
    await store.saveProject(created.id, archivePath, "0.1.0", catalog);

    const imported = await store.importProject(archivePath, catalog);
    expect(imported.catalogMismatch).toBe(false);
    expect(imported.composition.id).not.toBe(created.id);
    expect(imported.composition.name).toBe("Clock");
    expect(imported.composition.version).toBe(3);

    const files = await store.listFiles(imported.composition.id);
    expect(files).toContain("notes.md");
    expect(files).toContain("assets/dot.png");
    expect(files).toContain(`blocks/${block.asset}/index.html`);
    expect(files).toContain(`music/${music.asset}/pattern.js`);
    expect(files).not.toContain("exports/job.mp4");
    expect(files).not.toContain(projectArchiveManifestName);
    expect(files.some((file) => file.endsWith("index.html") && file.startsWith("music/"))).toBe(
      false,
    );
    expect(
      await pathExists(
        path.join(store.compositionDir(imported.composition.id), ".automedia", "thumbnail.png"),
      ),
    ).toBe(true);
    expect(
      await pathExists(
        path.join(store.compositionDir(imported.composition.id), ".agent-activity.jsonl"),
      ),
    ).toBe(false);

    const media = await store.getMedia(imported.composition.id);
    expect(media.tracks.map((track) => track.asset).toSorted()).toEqual(
      [block.asset, music.asset].toSorted(),
    );
    expect((await store.list()).map((item) => item.id)[0]).toBe(imported.composition.id);
  });

  it("warns when the saved runtime catalog does not match", async () => {
    const store = await tempStore();
    const created = await store.create("Clock");
    const archivePath = path.join(store.root, "Clock.automedia");
    await store.saveProject(created.id, archivePath, "0.1.0", catalog);
    const imported = await store.importProject(archivePath, { ...catalog, strudel: "9.9.9" });
    expect(imported.catalogMismatch).toBe(true);
  });

  it("refuses a newer archive format and a newer composition schema", async () => {
    const store = await tempStore();
    const futureFormat = path.join(store.root, "future-format.automedia");
    await writeFile(
      futureFormat,
      storeZip([{ name: "automedia.json", data: utf8(manifestJson(2)) }]),
    );
    await expect(store.importProject(futureFormat, catalog)).rejects.toMatchObject({
      code: "unsupported_project",
    } satisfies Partial<AppError>);

    const created = await store.create("Clock");
    const archivePath = path.join(store.root, "Clock.automedia");
    await store.saveProject(created.id, archivePath, "0.1.0", catalog);
    const unpacked = await readArchiveJson(archivePath);
    const compositionJson = unpacked.get("composition.json");
    if (!compositionJson) throw new Error("packed archive missing composition.json");
    unpacked.set("composition.json", compositionJson.replace('"version": 3', '"version": 4'));
    const futureSchema = path.join(store.root, "future-schema.automedia");
    await writeZip(futureSchema, unpacked);
    await expect(store.importProject(futureSchema, catalog)).rejects.toMatchObject({
      code: "unsupported_project",
    } satisfies Partial<AppError>);
  });

  it("refuses missing track sources, zip-slip paths, and wrapping folders", async () => {
    const store = await tempStore();
    const created = await store.create("Clock");
    const block = await store.createBlock(created.id, "Intro");
    const archivePath = path.join(store.root, "Clock.automedia");
    await store.saveProject(created.id, archivePath, "0.1.0", catalog);
    const unpacked = await readArchiveJson(archivePath);
    unpacked.delete(`blocks/${block.asset}/index.html`);
    const missing = path.join(store.root, "missing-block.automedia");
    await writeZip(missing, unpacked);
    await expect(store.importProject(missing, catalog)).rejects.toMatchObject({
      code: "invalid_project",
    } satisfies Partial<AppError>);

    const slip = path.join(store.root, "slip.automedia");
    await writeFile(
      slip,
      storeZip([
        { name: "automedia.json", data: utf8(manifestJson()) },
        { name: "../secret.txt", data: utf8("nope") },
      ]),
    );
    await expect(store.importProject(slip, catalog)).rejects.toMatchObject({
      code: "invalid_project",
    } satisfies Partial<AppError>);

    const wrapped = path.join(store.root, "wrapped.automedia");
    const wrapEntries = new Map<string, string>();
    for (const [name, data] of unpacked) wrapEntries.set(`folder/${name}`, data);
    await writeZip(wrapped, wrapEntries);
    await expect(store.importProject(wrapped, catalog)).rejects.toMatchObject({
      code: "invalid_project",
    } satisfies Partial<AppError>);
  });

  it("migrates a version 2 document inside a format 1 archive", async () => {
    const store = await tempStore();
    const now = "2026-01-01T00:00:00.000Z";
    const archivePath = path.join(store.root, "legacy.automedia");
    await writeFile(
      archivePath,
      storeZip([
        { name: "automedia.json", data: utf8(manifestJson()) },
        {
          name: "composition.json",
          data: utf8(
            `${JSON.stringify({
              version: 2,
              id: "cold",
              name: "Legacy",
              width: 800,
              height: 600,
              fps: 30,
              durationSeconds: 3,
              background: "transparent",
              createdAt: now,
              updatedAt: now,
            })}\n`,
          ),
        },
        { name: "media.json", data: utf8(`${JSON.stringify({ tracks: [], markers: [] })}\n`) },
        { name: "controls.json", data: utf8(`${JSON.stringify({ controls: [] })}\n`) },
        {
          name: "index.html",
          data: utf8("<!doctype html><title>Legacy</title><body></body>"),
        },
        { name: "style.css", data: utf8("html { margin: 0; }\n") },
        { name: "script.js", data: utf8("\n") },
      ]),
    );
    const imported = await store.importProject(archivePath, catalog);
    expect(imported.composition.version).toBe(3);
    expect(imported.composition.name).toBe("Legacy");
    const media = await store.getMedia(imported.composition.id);
    expect(media.tracks.some((track) => track.kind === "block")).toBe(true);
    const files = await store.listFiles(imported.composition.id);
    expect(files.some((file) => file.startsWith("blocks/") && file.endsWith("index.html"))).toBe(
      true,
    );
  });
});

async function readArchiveJson(archivePath: string): Promise<Map<string, string>> {
  const zip = await openPromise(archivePath, { decodeStrings: true });
  const files = new Map<string, string>();
  try {
    for await (const entry of zip.eachEntry()) {
      if (entry.fileName.endsWith("/")) continue;
      const chunks: Buffer[] = [];
      const stream = await zip.openReadStreamPromise(entry);
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      files.set(entry.fileName, Buffer.concat(chunks).toString("utf8"));
    }
  } finally {
    zip.close();
  }
  return files;
}
