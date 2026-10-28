/** Pure pieces of the ⌘K palette: matching, ordering and key labels. */

/** A key chord as the palette shows it. "mod" is ⌘ on macOS and Ctrl elsewhere. */
export type Chord = readonly string[];

export function isMac(platform: string): boolean {
  return /mac|iphone|ipad/i.test(platform);
}

/** Keycap labels for a chord, in order. */
export function chordKeys(chord: Chord, mac: boolean): string[] {
  return chord.map((key) => {
    if (key === "mod") return mac ? "⌘" : "Ctrl";
    if (key === "ctrl") return mac ? "⌃" : "Ctrl";
    if (key === "shift") return "⇧";
    if (key === "alt") return mac ? "⌥" : "Alt";
    if (key === "space") return "Space";
    if (key === "left") return "←";
    if (key === "right") return "→";
    if (key === "tab") return "Tab";
    if (key === "esc") return "esc";
    if (key === "delete") return "⌫";
    return key.toUpperCase();
  });
}

/** True for the palette's own chord: ⌘K on macOS, Ctrl+K elsewhere. */
export function isPaletteChord(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
  mac: boolean,
): boolean {
  if (event.key.toLowerCase() !== "k" || event.altKey || event.shiftKey) return false;
  return mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

/** Every word of the query appears in the text, in any order, ignoring case. */
export function matches(query: string, text: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = text.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/** Open tabs first, in tab order, then the rest of the library in its order. */
export function orderProjects<T extends { id: string }>(
  projects: readonly T[],
  openIds: readonly string[],
): T[] {
  const open = openIds
    .map((id) => projects.find((project) => project.id === id))
    .filter((project): project is T => project !== undefined);
  return [...open, ...projects.filter((project) => !openIds.includes(project.id))];
}

/** Moves a selection through a flat list, wrapping at both ends. */
export function stepIndex(index: number, delta: number, length: number): number {
  if (length === 0) return 0;
  return (((index + delta) % length) + length) % length;
}

/** The first index of the next group after `index`, wrapping; groups are [start, length] pairs. */
export function nextGroupStart(
  index: number,
  groups: readonly (readonly [number, number])[],
  backward = false,
): number {
  const filled = groups.filter(([, length]) => length > 0);
  if (filled.length === 0) return 0;
  const at = filled.findIndex(([start, length]) => index >= start && index < start + length);
  const next = stepIndex(at === -1 ? 0 : at, backward ? -1 : 1, filled.length);
  return filled[next]?.[0] ?? 0;
}
