export type TransportToolSize = {
  id: string;
  width: number;
  priority: number;
};

export type TransportToolPartition = {
  visible: string[];
  overflow: string[];
};

export const TRANSPORT_GAP = 4;
export const TRANSPORT_ICON = 36;
export const TRANSPORT_OVERFLOW = 36;
export const TRANSPORT_SHOW = 118;

export function partitionTransportTools(
  tools: readonly TransportToolSize[],
  availableWidth: number,
  overflowWidth = TRANSPORT_OVERFLOW,
  gap = TRANSPORT_GAP,
): TransportToolPartition {
  if (tools.length === 0) return { visible: [], overflow: [] };

  const widthOf = (ids: ReadonlySet<string>, withOverflow: boolean) => {
    const shown = tools.filter((tool) => ids.has(tool.id));
    const gaps = Math.max(0, shown.length - 1) * gap;
    const extra = withOverflow ? overflowWidth + (shown.length > 0 ? gap : 0) : 0;
    return shown.reduce((sum, tool) => sum + tool.width, 0) + gaps + extra;
  };

  const all = new Set(tools.map((tool) => tool.id));
  if (widthOf(all, false) <= availableWidth) {
    return { visible: tools.map((tool) => tool.id), overflow: [] };
  }

  const hidden = new Set<string>();
  const hideOrder = [...tools].toSorted((left, right) => left.priority - right.priority);
  for (const tool of hideOrder) {
    hidden.add(tool.id);
    const visible = new Set([...all].filter((id) => !hidden.has(id)));
    if (widthOf(visible, true) <= availableWidth) break;
  }

  return {
    visible: tools.filter((tool) => !hidden.has(tool.id)).map((tool) => tool.id),
    overflow: tools.filter((tool) => hidden.has(tool.id)).map((tool) => tool.id),
  };
}
