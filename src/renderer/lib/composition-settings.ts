import { limits } from "@shared/limits.ts";
import type { Composition } from "@shared/schemas.ts";

export type CompositionSettingsDraft = {
  name: string;
  width: string;
  height: string;
  fps: string;
  background: string;
};

export type CompositionSettingsField = keyof CompositionSettingsDraft;
export type CompositionSettingsErrors = Partial<Record<CompositionSettingsField, string>>;
export type CompositionSettingsInput = Pick<
  Composition,
  "name" | "width" | "height" | "fps" | "background"
>;

type ValidationResult =
  | { ok: true; input: CompositionSettingsInput }
  | { ok: false; errors: CompositionSettingsErrors };

type IntegerFieldResult = { ok: true; value: number } | { ok: false; error: string };

function integerField(value: string, label: string, min: number, max: number): IntegerFieldResult {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return { ok: false, error: `${label} must be a whole number.` };
  if (parsed < min || parsed > max) {
    return { ok: false, error: `${label} must be between ${min} and ${max}.` };
  }
  return { ok: true, value: parsed };
}

export function validateCompositionSettings(draft: CompositionSettingsDraft): ValidationResult {
  const errors: CompositionSettingsErrors = {};
  const name = draft.name.trim();
  if (!name) errors.name = "Enter a project name.";

  const width = integerField(draft.width, "Width", limits.minSize, limits.maxSize);
  if (!width.ok) errors.width = width.error;
  const height = integerField(draft.height, "Height", limits.minSize, limits.maxSize);
  if (!height.ok) errors.height = height.error;
  const fps = integerField(draft.fps, "FPS", limits.minFps, limits.maxFps);
  if (!fps.ok) errors.fps = fps.error;

  const background = draft.background.trim();
  if (background !== "transparent" && !/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(background)) {
    errors.background = "Use a six or eight digit hex color, or transparent.";
  }

  if (!name || !width.ok || !height.ok || !fps.ok || errors.background) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    input: {
      name,
      width: width.value,
      height: height.value,
      fps: fps.value,
      background,
    },
  };
}
