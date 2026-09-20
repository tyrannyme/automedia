export function sortByOrder<T extends { id: string; createdAt?: string }>(
  items: readonly T[],
  order: readonly string[],
): T[] {
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...items].toSorted((left, right) => {
    const leftRank = rank.get(left.id);
    const rightRank = rank.get(right.id);
    if (leftRank !== undefined || rightRank !== undefined) {
      return (leftRank ?? Number.MAX_SAFE_INTEGER) - (rightRank ?? Number.MAX_SAFE_INTEGER);
    }
    const created = (right.createdAt ?? "").localeCompare(left.createdAt ?? "");
    if (created !== 0) return created;
    return left.id.localeCompare(right.id);
  });
}

export function moveId(
  ids: readonly string[],
  sourceId: string,
  targetId: string | null,
  after = false,
): string[] {
  const next = [...ids];
  const from = next.indexOf(sourceId);
  if (from < 0) return next;
  next.splice(from, 1);
  let to = targetId ? next.indexOf(targetId) : next.length;
  if (targetId && after && to >= 0) to += 1;
  next.splice(Math.max(0, to), 0, sourceId);
  return next;
}

export function applyReorder(
  currentIds: readonly string[],
  requested: readonly string[],
): string[] {
  const known = new Set(currentIds);
  const next = requested.filter((id) => known.has(id));
  for (const id of currentIds) {
    if (!next.includes(id)) next.push(id);
  }
  return next;
}
