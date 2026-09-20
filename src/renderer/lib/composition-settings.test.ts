import { describe, expect, it } from "vitest";
import { validateCompositionSettings } from "./composition-settings.ts";

const valid = {
  name: "Meadow",
  width: "1920",
  height: "1080",
  fps: "30",
  background: "#87CEEB",
};

describe("composition settings validation", () => {
  it("returns normalized valid settings", () => {
    expect(validateCompositionSettings({ ...valid, name: "  Meadow  " })).toEqual({
      ok: true,
      input: { name: "Meadow", width: 1920, height: 1080, fps: 30, background: "#87CEEB" },
    });
  });

  it("reports every invalid field before saving", () => {
    const result = validateCompositionSettings({
      name: "   ",
      width: "0",
      height: "1.5",
      fps: "0",
      background: "blue",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors)).toEqual(["name", "width", "height", "fps", "background"]);
  });
});
