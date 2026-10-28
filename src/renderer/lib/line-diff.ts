/**
 * A plain line diff for the code-mode conflict view: your text against the
 * file on disk. Longest common subsequence over lines; files here are small.
 */

export type DiffSegment =
  | { kind: "same"; /** 1-based line in yours. */ start: number; count: number }
  | {
      kind: "change";
      mine: { start: number; lines: string[] };
      theirs: { start: number; lines: string[] };
    };

/** Lines past this on either side skip the LCS table and diff as one change. */
const maxLines = 4000;

export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

export function diffLines(mineText: string, theirsText: string): DiffSegment[] {
  const mine = splitLines(mineText);
  const theirs = splitLines(theirsText);
  let head = 0;
  while (head < mine.length && head < theirs.length && mine[head] === theirs[head]) head += 1;
  let tail = 0;
  while (
    tail < mine.length - head &&
    tail < theirs.length - head &&
    mine[mine.length - 1 - tail] === theirs[theirs.length - 1 - tail]
  ) {
    tail += 1;
  }
  const a = mine.slice(head, mine.length - tail);
  const b = theirs.slice(head, theirs.length - tail);
  const pairs = a.length > maxLines || b.length > maxLines ? [] : commonPairs(a, b);

  const segments: DiffSegment[] = [];
  const same = (start: number, count: number) => {
    if (count <= 0) return;
    const last = segments.at(-1);
    if (last?.kind === "same" && last.start + last.count === start) last.count += count;
    else segments.push({ kind: "same", start, count });
  };
  const change = (ai: number, aj: number, bi: number, bj: number) => {
    if (ai === aj && bi === bj) return;
    segments.push({
      kind: "change",
      mine: { start: head + ai + 1, lines: a.slice(ai, aj) },
      theirs: { start: head + bi + 1, lines: b.slice(bi, bj) },
    });
  };

  same(1, head);
  let ai = 0;
  let bi = 0;
  for (const [pa, pb] of pairs) {
    change(ai, pa, bi, pb);
    same(head + pa + 1, 1);
    ai = pa + 1;
    bi = pb + 1;
  }
  change(ai, a.length, bi, b.length);
  same(head + a.length + 1, tail);
  return segments;
}

/** Index pairs of a longest common subsequence of a and b, in order. */
function commonPairs(a: readonly string[], b: readonly string[]): [number, number][] {
  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        a[i] === b[j]
          ? (table[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(table[(i + 1) * width + j] ?? 0, table[i * width + j + 1] ?? 0);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if ((table[(i + 1) * width + j] ?? 0) >= (table[i * width + j + 1] ?? 0)) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return pairs;
}
