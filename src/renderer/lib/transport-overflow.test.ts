import { describe, expect, it } from "vitest";
import {
  partitionTransportTools,
  TRANSPORT_GAP,
  TRANSPORT_ICON,
  TRANSPORT_OVERFLOW,
} from "./transport-overflow.ts";

const tools = [
  { id: "split", width: TRANSPORT_ICON, priority: 50 },
  { id: "delete", width: TRANSPORT_ICON, priority: 40 },
  { id: "marker", width: TRANSPORT_ICON, priority: 70 },
  { id: "block", width: TRANSPORT_ICON, priority: 90 },
  { id: "music", width: TRANSPORT_ICON, priority: 65 },
  { id: "settings", width: TRANSPORT_ICON, priority: 100 },
];

function clusterWidth(ids: string[], overflow: boolean) {
  const shown = tools.filter((tool) => ids.includes(tool.id));
  const gaps = Math.max(0, shown.length - 1) * TRANSPORT_GAP;
  const extra = overflow ? TRANSPORT_OVERFLOW + (shown.length > 0 ? TRANSPORT_GAP : 0) : 0;
  return shown.reduce((sum, tool) => sum + tool.width, 0) + gaps + extra;
}

describe("partitionTransportTools", () => {
  it("keeps the full cluster when the nest is wide", () => {
    const next = partitionTransportTools(tools, 400);
    expect(next.overflow).toEqual([]);
    expect(next.visible).toEqual(tools.map((tool) => tool.id));
  });

  it("folds the lowest-priority tools first so add and settings stay", () => {
    const next = partitionTransportTools(tools, 200);
    expect(next.overflow).toContain("delete");
    expect(next.overflow).toContain("split");
    expect(next.visible).not.toContain("delete");
    expect(next.visible).toContain("block");
    expect(next.visible).toContain("settings");
    expect(clusterWidth(next.visible, next.overflow.length > 0)).toBeLessThanOrEqual(200);
  });

  it("keeps display order of the icons that remain", () => {
    const next = partitionTransportTools(tools, 200);
    const order = tools.map((tool) => tool.id);
    expect(next.visible.map((id) => order.indexOf(id))).toEqual(
      next.visible.map((id) => order.indexOf(id)).toSorted((left, right) => left - right),
    );
  });

  it("can fold everything into More when the nest is a strip", () => {
    const next = partitionTransportTools(tools, TRANSPORT_OVERFLOW);
    expect(next.visible).toEqual([]);
    expect(next.overflow).toEqual(tools.map((tool) => tool.id));
  });
});
