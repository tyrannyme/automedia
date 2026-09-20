import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "@shared/errors.ts";

export function createId(prefix: string): string {
  return `${prefix}${randomBytes(6).toString("hex")}`;
}

export function etagFor(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function readBytes(filePath: string): Promise<Buffer> {
  return readFile(filePath);
}

export async function writeAtomic(filePath: string, data: string | Uint8Array): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tempPath, data);
  await rename(tempPath, filePath);
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export function resolveInside(root: string, relativePath: string): string {
  const normalized = relativePath.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.includes("\0")) {
    throw new AppError("invalid_path", "path must be relative to the composition");
  }
  const resolved = path.resolve(root, normalized);
  const rootResolved = path.resolve(root);
  if (resolved !== rootResolved && !resolved.startsWith(`${rootResolved}${path.sep}`)) {
    throw new AppError("invalid_path", "path escapes the composition");
  }
  return resolved;
}

export async function removeToTrash(source: string, trashDir: string): Promise<void> {
  await ensureDir(trashDir);
  const dest = path.join(trashDir, `${path.basename(source)}-${Date.now()}`);
  await rename(source, dest);
}

export async function removeFile(filePath: string): Promise<void> {
  const delaysMs = [0, 25, 50, 100, 200, 400];
  let lastError: unknown;
  for (const delayMs of delaysMs) {
    if (delayMs > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }
    try {
      await rm(filePath, { force: true });
      return;
    } catch (error) {
      lastError = error;
      const busy =
        error instanceof Error &&
        "code" in error &&
        (error.code === "EBUSY" || error.code === "EPERM" || error.code === "EACCES");
      if (!busy) {
        throw error;
      }
    }
  }
  throw lastError;
}
