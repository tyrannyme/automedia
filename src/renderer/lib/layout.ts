import * as v from "valibot";

const STORAGE_KEY = "automedia.layout.v1";
const OPEN_IDS_KEY = "automedia.open-ids.v1";

export const LAYOUT_LIMITS = {
  sidebar: { min: 220, max: 360, rail: 76 },
  inspector: { min: 280, max: 440, strip: 40 },
  timeline: { min: 176, max: 520, strip: 56 },
  previewMinWidth: 400,
  previewMinHeight: 180,
} as const;

export const SHELL = {
  overlay: 44,
  toolbar: 44,
  insetCompact: 8,
  insetWide: 12,
  wideAt: 1100,
} as const;

const layoutSchema = v.object({
  sidebarWidth: v.optional(v.number()),
  inspectorWidth: v.optional(v.number()),
  timelineHeight: v.optional(v.number()),
  sidebarCollapsed: v.optional(v.boolean()),
  inspectorCollapsed: v.optional(v.boolean()),
  timelineCollapsed: v.optional(v.boolean()),
});

const openIdsSchema = v.array(v.string());

export type StudioLayout = {
  sidebarWidth: number;
  inspectorWidth: number;
  timelineHeight: number;
  sidebarCollapsed: boolean;
  inspectorCollapsed: boolean;
  timelineCollapsed: boolean;
};

export const defaultLayout: StudioLayout = {
  sidebarWidth: 252,
  inspectorWidth: 320,
  timelineHeight: 228,
  sidebarCollapsed: false,
  inspectorCollapsed: false,
  timelineCollapsed: false,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function shellInset(width: number): number {
  return width >= SHELL.wideAt ? SHELL.insetWide : SHELL.insetCompact;
}

export function shellChromeX(width: number): number {
  const inset = shellInset(width);
  return inset * 2;
}

export function clampLayout(layout: StudioLayout): StudioLayout {
  return {
    sidebarWidth: clamp(layout.sidebarWidth, LAYOUT_LIMITS.sidebar.min, LAYOUT_LIMITS.sidebar.max),
    inspectorWidth: clamp(
      layout.inspectorWidth,
      LAYOUT_LIMITS.inspector.min,
      LAYOUT_LIMITS.inspector.max,
    ),
    timelineHeight: clamp(
      layout.timelineHeight,
      LAYOUT_LIMITS.timeline.min,
      LAYOUT_LIMITS.timeline.max,
    ),
    sidebarCollapsed: layout.sidebarCollapsed,
    inspectorCollapsed: layout.inspectorCollapsed,
    timelineCollapsed: layout.timelineCollapsed,
  };
}

export function fitLayout(layout: StudioLayout, width: number, height: number): StudioLayout {
  const next = clampLayout(layout);
  const rail = LAYOUT_LIMITS.sidebar.rail;
  const strip = LAYOUT_LIMITS.inspector.strip;
  const chromeX = shellChromeX(width);
  let sidebar = next.sidebarCollapsed ? rail : next.sidebarWidth;
  let inspector = next.inspectorCollapsed ? strip : next.inspectorWidth;
  if (width - sidebar - inspector - chromeX < LAYOUT_LIMITS.previewMinWidth) {
    next.sidebarCollapsed = true;
    sidebar = rail;
  }
  if (width - sidebar - inspector - chromeX < LAYOUT_LIMITS.previewMinWidth) {
    next.inspectorCollapsed = true;
    inspector = strip;
  }
  const chromeY =
    SHELL.overlay +
    shellInset(width) +
    (next.timelineCollapsed ? LAYOUT_LIMITS.timeline.strip : next.timelineHeight);
  if (height - chromeY < LAYOUT_LIMITS.previewMinHeight) {
    next.timelineCollapsed = true;
  }
  return next;
}

export function readLayout(): StudioLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultLayout };
    const parsed = v.parse(layoutSchema, JSON.parse(raw));
    return clampLayout({
      sidebarWidth: parsed.sidebarWidth ?? defaultLayout.sidebarWidth,
      inspectorWidth: parsed.inspectorWidth ?? defaultLayout.inspectorWidth,
      timelineHeight: parsed.timelineHeight ?? defaultLayout.timelineHeight,
      sidebarCollapsed: parsed.sidebarCollapsed ?? defaultLayout.sidebarCollapsed,
      inspectorCollapsed: parsed.inspectorCollapsed ?? defaultLayout.inspectorCollapsed,
      timelineCollapsed: parsed.timelineCollapsed ?? defaultLayout.timelineCollapsed,
    });
  } catch {
    return { ...defaultLayout };
  }
}

export function writeLayout(layout: StudioLayout): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clampLayout(layout)));
}

export function readOpenIds(): string[] {
  try {
    const raw = localStorage.getItem(OPEN_IDS_KEY);
    if (!raw) return [];
    return v.parse(openIdsSchema, JSON.parse(raw));
  } catch {
    return [];
  }
}

export function writeOpenIds(ids: string[]): void {
  localStorage.setItem(OPEN_IDS_KEY, JSON.stringify(ids));
}

export function paneSize(collapsed: boolean, expanded: number, collapsedSize: number): number {
  return collapsed ? collapsedSize : expanded;
}
