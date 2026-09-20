export function upsertById<T extends { id: string }>(items: readonly T[], item: T): T[] {
  const index = items.findIndex((entry) => entry.id === item.id);
  if (index === -1) return [...items, item];
  return items.map((entry, entryIndex) => (entryIndex === index ? item : entry));
}

export function replaceById<T extends { id: string }>(items: readonly T[], item: T): T[] {
  return items.map((entry) => (entry.id === item.id ? item : entry));
}
