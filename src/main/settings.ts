import path from "node:path";
import * as v from "valibot";
import { appSettingsSchema, type AppSettings } from "@shared/schemas.ts";
import { pathExists, readBytes, writeAtomic } from "./fs.ts";

const defaultSettings: AppSettings = { lastCompositionId: null };

export async function readSettings(userData: string): Promise<AppSettings> {
  const filePath = path.join(userData, "settings.json");
  if (!(await pathExists(filePath))) {
    return { ...defaultSettings };
  }
  return v.parse(appSettingsSchema, JSON.parse((await readBytes(filePath)).toString("utf8")));
}

export async function writeSettings(userData: string, settings: AppSettings): Promise<AppSettings> {
  const parsed = v.parse(appSettingsSchema, settings);
  await writeAtomic(path.join(userData, "settings.json"), `${JSON.stringify(parsed, null, 2)}\n`);
  return parsed;
}
