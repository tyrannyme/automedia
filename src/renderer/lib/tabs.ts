/** Titlebar tab sizes, in px. Tabs shrink to a floor, then the rightmost fold into "+N". */
export const TAB_SIZES = {
  max: 200,
  floor: 128,
  activeFloor: 156,
  /** Compact windows show non-active tabs as their poster only. */
  mini: 34,
  gap: 2,
  plus: 28,
  overflow: 52,
} as const;

export type TabFit = { visible: string[]; hidden: string[] };

/**
 * Which open tabs fit in `available` px. The active tab always stays visible:
 * when it would fold, it takes the last visible slot instead.
 */
export function fitTabs(
  ids: readonly string[],
  activeId: string | null,
  available: number,
  { compact = false }: { compact?: boolean } = {},
): TabFit {
  const floor = compact ? TAB_SIZES.mini : TAB_SIZES.floor;
  const used = (list: readonly string[], folded: boolean) =>
    list.reduce(
      (sum, id) => sum + (id === activeId ? TAB_SIZES.activeFloor : floor) + TAB_SIZES.gap,
      TAB_SIZES.plus + (folded ? TAB_SIZES.overflow + TAB_SIZES.gap : 0),
    );
  if (used(ids, false) <= available) return { visible: [...ids], hidden: [] };

  const active = activeId !== null && ids.includes(activeId) ? [activeId] : [];
  const kept = new Set(active);
  for (const id of ids) {
    if (kept.has(id)) continue;
    if (used([...kept, id], true) > available) break;
    kept.add(id);
  }
  return {
    visible: ids.filter((id) => kept.has(id)),
    hidden: ids.filter((id) => !kept.has(id)),
  };
}
