import { describe, expect, it } from "vitest";
import { clampLayout, defaultLayout, fitLayout, LAYOUT_LIMITS, shellChromeX } from "./layout.ts";

describe("studio layout", () => {
  it("clamps pane sizes to the published min and max", () => {
    expect(
      clampLayout({
        sidebarWidth: 10,
        inspectorWidth: 9999,
        timelineHeight: 10,
        sidebarCollapsed: false,
        inspectorCollapsed: false,
        timelineCollapsed: false,
      }),
    ).toEqual({
      sidebarWidth: LAYOUT_LIMITS.sidebar.min,
      inspectorWidth: LAYOUT_LIMITS.inspector.max,
      timelineHeight: LAYOUT_LIMITS.timeline.min,
      sidebarCollapsed: false,
      inspectorCollapsed: false,
      timelineCollapsed: false,
    });
  });

  it("keeps a preview column at 800x600 by collapsing the sidebar and inspector", () => {
    const fitted = fitLayout(defaultLayout, 800, 600);
    const sidebar = fitted.sidebarCollapsed ? LAYOUT_LIMITS.sidebar.rail : fitted.sidebarWidth;
    const inspector = fitted.inspectorCollapsed
      ? LAYOUT_LIMITS.inspector.strip
      : fitted.inspectorWidth;
    expect(800 - sidebar - inspector - shellChromeX(800)).toBeGreaterThanOrEqual(
      LAYOUT_LIMITS.previewMinWidth,
    );
    expect(fitted.sidebarCollapsed).toBe(true);
    expect(fitted.inspectorCollapsed).toBe(true);
    expect(fitted.timelineCollapsed).toBe(false);
  });

  it("keeps preview and timeline at 1280x800 without collapsing", () => {
    const fitted = fitLayout(defaultLayout, 1280, 800);
    expect(fitted.sidebarCollapsed).toBe(false);
    expect(fitted.inspectorCollapsed).toBe(false);
    expect(fitted.timelineCollapsed).toBe(false);
  });
});
