import * as v from "valibot";

const STORAGE_KEY = "automedia.layout.v2";
const OPEN_IDS_KEY = "automedia.open-ids.v1";

export const LAYOUT_LIMITS = {
  panel: { min: 280, max: 440 },
  timeline: { min: 132, max: 520, strip: 56 },
  previewMinWidth: 400,
  previewMinHeight: 160,
} as const;

/**
 * The shell's fixed measurements. The stage head and player heights are shared
 * with the stage so the compact panel sheet can stop above the player.
 */
export const SHELL = {
  titlebar: 44,
  insetCompact: 8,
  insetWide: 12,
  wideAt: 1100,
  /** Below this width the panel leaves the layout and opens as a sheet over the stage. */
  compactBelow: 1000,
  stageHead: 48,
  stageHeadCompact: 44,
  player: 56,
  playerCompact: 48,
  sheetWidth: 296,
} as const;

const layoutSchema = v.object({
  panelWidth: v.optional(v.number()),
  timelineHeight: v.optional(v.number()),
  timelineCollapsed: v.optional(v.boolean()),
});

const openIdsSchema = v.array(v.string());

export type StudioLayout = {
  panelWidth: number;
  timelineHeight: number;
  timelineCollapsed: boolean;
};

/** What the shell renders at a given window size. */
export type FittedLayout = StudioLayout & {
  /** The panel is an overlay sheet toggled from the stage head, not a docked column. */
  compact: boolean;
};

export const defaultLayout: StudioLayout = {
  panelWidth: 320,
  timelineHeight: 236,
  timelineCollapsed: false,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isCompact(width: number): boolean {
  return width < SHELL.compactBelow;
}

export function shellInset(width: number): number {
  return width >= SHELL.wideAt ? SHELL.insetWide : SHELL.insetCompact;
}

export function clampLayout(layout: StudioLayout): StudioLayout {
  return {
    panelWidth: clamp(layout.panelWidth, LAYOUT_LIMITS.panel.min, LAYOUT_LIMITS.panel.max),
    timelineHeight: clamp(
      layout.timelineHeight,
      LAYOUT_LIMITS.timeline.min,
      LAYOUT_LIMITS.timeline.max,
    ),
    timelineCollapsed: layout.timelineCollapsed,
  };
}

export function fitLayout(layout: StudioLayout, width: number, height: number): FittedLayout {
  const next = clampLayout(layout);
  const compact = isCompact(width);
  const inset = shellInset(width);
  if (!compact) {
    // Between the breakpoint and a roomy window, the panel gives way before the picture.
    const room = width - inset * 3 - LAYOUT_LIMITS.previewMinWidth;
    next.panelWidth = clamp(
      Math.min(next.panelWidth, room),
      LAYOUT_LIMITS.panel.min,
      next.panelWidth,
    );
  }
  const stage =
    height -
    SHELL.titlebar -
    inset -
    (compact ? SHELL.stageHeadCompact + SHELL.playerCompact : SHELL.stageHead + SHELL.player);
  // The timeline gives back height until the picture keeps its floor, then folds to its strip.
  const room = stage - LAYOUT_LIMITS.previewMinHeight;
  if (room < LAYOUT_LIMITS.timeline.min) next.timelineCollapsed = true;
  else next.timelineHeight = Math.min(next.timelineHeight, room);
  return { ...next, compact };
}

export function readLayout(): StudioLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultLayout };
    const parsed = v.parse(layoutSchema, JSON.parse(raw));
    return clampLayout({
      panelWidth: parsed.panelWidth ?? defaultLayout.panelWidth,
      timelineHeight: parsed.timelineHeight ?? defaultLayout.timelineHeight,
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
