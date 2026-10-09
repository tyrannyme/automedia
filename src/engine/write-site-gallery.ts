import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import * as v from "valibot";
import { controlSchema, type Control, type StartExportInput } from "@shared/schemas.ts";
import { htmlShell, writeSpec, type ExampleSpec } from "./examples/common.ts";
import { exportFileExists } from "./export.ts";
import { startEngine, type RunningEngine } from "./engine.ts";

/** One showcase on the site, read from site/gallery/<id>/meta.json. */
type GalleryMeta = {
  order: number;
  name: string;
  description: string;
  tags: string[];
  settings: {
    width: number;
    height: number;
    fps: number;
    durationSeconds: number;
    background: string;
  };
  /** Seconds into the composition for the poster still. */
  poster: number;
  /** Animated formats to export. Defaults to MP4. */
  formats?: ("mp4" | "webm" | "webp" | "gif")[];
  quality?: number;
  controls?: Control[];
  /** Renders the same template once per entry, overriding control values. */
  variants?: { name: string; controls: Record<string, string | number | boolean> }[];
};

type GalleryRender = {
  name: string;
  controls: Record<string, string | number | boolean>;
  poster: string;
  media: Record<string, string>;
};

type GalleryEntry = {
  id: string;
  order: number;
  name: string;
  description: string;
  tags: string[];
  width: number;
  height: number;
  fps: number;
  duration: number;
  audio: boolean;
  renders: GalleryRender[];
  bytes: number;
  renderSeconds: number;
  sources: Record<string, string>;
};

const sourceNames = new Set(["meta.json", "body.html", "style.css", "script.js", "pattern.js"]);

const fonts = {
  "nunito.woff2": "nunito-latin-600-normal.woff2",
  "poppins.woff2": "poppins-latin-400-normal.woff2",
  "poppins-500.woff2": "poppins-latin-500-normal.woff2",
  "dm-mono.woff2": "dm-mono-latin-400-normal.woff2",
};

export async function writeSiteGallery(
  cwd = process.cwd(),
  only = process.env.SITE_GALLERY_ONLY?.split(",").filter(Boolean),
): Promise<GalleryEntry[]> {
  const sourceRoot = path.join(cwd, "site", "gallery");
  const outputRoot = path.join(cwd, "site", "public", "gallery");
  const manifestPath = path.join(outputRoot, "gallery.json");
  const ids = (await readdir(sourceRoot)).filter((id) => !only || only.includes(id));
  const previous: GalleryEntry[] = only
    ? JSON.parse(await readFile(manifestPath, "utf8").catch(() => "[]"))
    : [];

  const library = path.join(cwd, ".automedia-site-gallery");
  await rm(library, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });
  const stack = await startEngine(library, { port: 0 });
  try {
    const entries: GalleryEntry[] = [];
    for (const id of ids) {
      entries.push(await renderShowcase(stack, path.join(sourceRoot, id), outputRoot, cwd));
    }
    const merged = [...previous.filter((entry) => !ids.includes(entry.id)), ...entries];
    merged.sort((a, b) => a.order - b.order);
    await writeFile(manifestPath, `${JSON.stringify(merged, null, 2)}\n`);
    return merged;
  } finally {
    await stack.close();
    await rm(library, { recursive: true, force: true });
  }
}

async function renderShowcase(
  stack: RunningEngine,
  dir: string,
  outputRoot: string,
  cwd: string,
): Promise<GalleryEntry> {
  const id = path.basename(dir);
  const meta: GalleryMeta = JSON.parse(await readFile(path.join(dir, "meta.json"), "utf8"));
  const read = (name: string) => readFile(path.join(dir, name), "utf8").catch(() => undefined);
  const body = (await read("body.html")) ?? "";
  const css = (await read("style.css")) ?? "";
  const js = (await read("script.js")) ?? "\n";
  const pattern = await read("pattern.js");
  const files: Record<string, string> = {};
  for (const name of await readdir(dir)) {
    if (!sourceNames.has(name)) files[name] = await readFile(path.join(dir, name), "utf8");
  }

  const variants = meta.variants ?? [{ name: meta.name, controls: {} }];
  const formats = meta.formats ?? ["mp4"];
  const started = performance.now();
  const renders: GalleryRender[] = [];
  for (const [index, variant] of variants.entries()) {
    const spec: ExampleSpec = {
      name: variant.name,
      description: meta.description,
      settings: meta.settings,
      body,
      css,
      js,
      files,
    };
    if (meta.controls) {
      spec.controls = meta.controls.map((control) =>
        Object.hasOwn(variant.controls, control.id)
          ? v.parse(controlSchema, { ...control, value: variant.controls[control.id] })
          : control,
      );
    }
    const composition = await writeSpec(stack.store, spec);
    // Fonts sit beside the block's style.css, so they stay out of the project library.
    const blocks = path.join(stack.store.compositionDir(composition.id), "blocks");
    const [asset = ""] = await readdir(blocks);
    const fontDir = path.join(blocks, asset, "fonts");
    await mkdir(fontDir, { recursive: true });
    for (const [name, source] of Object.entries(fonts)) {
      await copyFile(path.join(cwd, "src/renderer/fonts", source), path.join(fontDir, name));
    }
    if (pattern !== undefined) {
      const track = await stack.store.createMusicBlock(composition.id, "Music");
      await stack.store.putTrack(composition.id, {
        ...track,
        duration: meta.settings.durationSeconds,
      });
      await stack.store.writeFile(
        composition.id,
        `music/${track.asset}/pattern.js`,
        "utf8",
        pattern,
        (await stack.store.readFile(composition.id, `music/${track.asset}/pattern.js`)).etag,
      );
    }
    const stem = variants.length > 1 ? `${id}-${index + 1}` : id;
    const poster = `${stem}.png`;
    await exportTo(
      stack,
      { compositionId: composition.id, format: "png", timeSeconds: meta.poster },
      path.join(outputRoot, poster),
    );
    const media: Record<string, string> = {};
    for (const format of formats) {
      const file = `${stem}.${format}`;
      await exportTo(
        stack,
        { compositionId: composition.id, format, quality: meta.quality ?? 60 },
        path.join(outputRoot, file),
      );
      media[format] = file;
    }
    renders.push({ name: variant.name, controls: variant.controls, poster, media });
  }
  const renderSeconds = (performance.now() - started) / 1000;

  let bytes = 0;
  for (const render of renders) {
    for (const file of Object.values(render.media)) {
      bytes += (await stat(path.join(outputRoot, file))).size;
    }
  }
  const sources: Record<string, string> = {};
  if (pattern !== undefined) sources["pattern.js"] = pattern;
  if (js.trim()) sources["script.js"] = js;
  if (css.trim()) sources["style.css"] = css;
  sources["index.html"] = htmlShell(meta.name, body);
  if (meta.controls)
    sources["controls.json"] = `${JSON.stringify({ controls: meta.controls }, null, 2)}\n`;
  for (const [name, content] of Object.entries(files)) sources[name] = content;

  return {
    id,
    order: meta.order,
    name: meta.name,
    description: meta.description,
    tags: meta.tags,
    width: meta.settings.width,
    height: meta.settings.height,
    fps: meta.settings.fps,
    duration: meta.settings.durationSeconds,
    audio: pattern !== undefined,
    renders,
    bytes,
    renderSeconds: Math.round(renderSeconds * 10) / 10,
    sources,
  };
}

async function exportTo(
  stack: RunningEngine,
  input: StartExportInput,
  outputPath: string,
): Promise<void> {
  const job = await stack.queue.start(input);
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    const current = stack.queue.get(job.id);
    if (current.phase === "completed") {
      await copyFile(await exportFileExists(stack.store, input.compositionId, job.id), outputPath);
      return;
    }
    if (current.phase === "failed" || current.phase === "canceled") {
      throw new Error(`${path.basename(outputPath)}: ${current.error?.message ?? current.phase}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out exporting ${path.basename(outputPath)}`);
}
