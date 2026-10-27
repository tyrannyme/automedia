import type { ListedComposition } from "@shared/ipc.ts";

export type HomeSort = "custom" | "edited" | "name";

export const homeSortLabels = {
  custom: "Custom order",
  edited: "Last edited",
  name: "Name",
} satisfies Record<HomeSort, string>;

/** Short ages for cards and tabs: now, 18m, 2h, 3d, 5w, then a date. */
export function shortAge(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (!Number.isFinite(seconds) || seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 9) return `${weeks}w`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Seconds as the cards print them: 8.0 s. */
export function formatLength(seconds: number): string {
  return `${seconds.toFixed(1)} s`;
}

/**
 * Who touched a project last. A live claim names its holder; otherwise the
 * studio has no actor for the last write, so it is "You" and never a guess.
 */
export type LastTouch = { who: string; live: boolean; when: string };

export function lastTouch(
  item: Pick<ListedComposition, "lease" | "updatedAt">,
  now = Date.now(),
): LastTouch {
  if (item.lease) return { who: item.lease.holder, live: true, when: "now" };
  return { who: "You", live: false, when: shortAge(item.updatedAt, now) };
}

/** The first letter an avatar shows for a holder name. */
export function initialOf(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}

export function visibleProjects<T extends Pick<ListedComposition, "name" | "updatedAt">>(
  items: readonly T[],
  query: string,
  sort: HomeSort,
): T[] {
  const needle = query.trim().toLowerCase();
  const found = needle
    ? items.filter((item) => item.name.toLowerCase().includes(needle))
    : [...items];
  if (sort === "name") return found.toSorted((a, b) => a.name.localeCompare(b.name));
  if (sort === "edited")
    return found.toSorted((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return found;
}

/** Fit a cw×ch frame inside a bw×bh box, keeping its shape. */
export function fitInside(cw: number, ch: number, bw: number, bh: number): [number, number] {
  if (cw <= 0 || ch <= 0) return [bw, bh];
  const scale = Math.min(bw / cw, bh / ch);
  return [Math.round(cw * scale), Math.round(ch * scale)];
}
