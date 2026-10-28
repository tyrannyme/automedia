import { describe, expect, it } from "vitest";
import {
  clampLayout,
  defaultLayout,
  fitLayout,
  isCompact,
  LAYOUT_LIMITS,
  SHELL,
} from "./layout.ts";

describe("studio layout", () => {
  it("clamps pane sizes to the published min and max", () => {
    expect(clampLayout({ panelWidth: 9999, timelineHeight: 10, timelineCollapsed: false })).toEqual(
      {
        panelWidth: LAYOUT_LIMITS.panel.max,
        timelineHeight: LAYOUT_LIMITS.timeline.min,
        timelineCollapsed: false,
      },
    );
  });

  it("docks the panel at 1280x800 and keeps the timeline", () => {
    expect(fitLayout(defaultLayout, 1280, 800)).toEqual({ ...defaultLayout, compact: false });
  });

  it("turns the panel into a sheet below the compact breakpoint", () => {
    expect(isCompact(SHELL.compactBelow - 1)).toBe(true);
    expect(isCompact(SHELL.compactBelow)).toBe(false);
    const fitted = fitLayout(defaultLayout, 800, 600);
    expect(fitted.compact).toBe(true);
    expect(fitted.timelineCollapsed).toBe(false);
  });

  it("narrows a wide panel before the picture drops under its floor", () => {
    const fitted = fitLayout({ ...defaultLayout, panelWidth: 440 }, 1000, 800);
    expect(1000 - 12 * 3 - fitted.panelWidth).toBeGreaterThanOrEqual(LAYOUT_LIMITS.previewMinWidth);
    expect(fitted.panelWidth).toBeGreaterThanOrEqual(LAYOUT_LIMITS.panel.min);
  });

  it("shrinks, then folds, the timeline on a short window", () => {
    const tall = fitLayout({ ...defaultLayout, timelineHeight: 520 }, 1280, 700);
    expect(tall.timelineCollapsed).toBe(false);
    expect(tall.timelineHeight).toBeLessThan(520);
    expect(fitLayout(defaultLayout, 1280, 360).timelineCollapsed).toBe(true);
  });
});
