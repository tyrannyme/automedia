const maxChanges = 8;

/** Drops the "by @user in #12" credit GitHub's generated notes append. */
export function stripCredit(line: string): string {
  return line.replace(/\s+by @\S+ in \S+$/, "").trim();
}

/**
 * The change lines of a release, from the HTML notes GitHub's feed carries.
 * Prefers the "What's Changed" list, falls back to every list item, then to
 * paragraphs.
 */
export function releaseChanges(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const heading = [...doc.querySelectorAll("h1, h2, h3")].find((node) =>
    /what.s changed/i.test(node.textContent ?? ""),
  );
  const list = heading?.nextElementSibling;
  const items =
    list && (list.tagName === "UL" || list.tagName === "OL")
      ? [...list.querySelectorAll("li")]
      : [...doc.querySelectorAll("li")];
  const nodes = items.length > 0 ? items : [...doc.querySelectorAll("p")];
  const lines = nodes.map((node) => stripCredit(node.textContent ?? "")).filter(Boolean);
  const text = doc.body.textContent?.trim();
  if (lines.length === 0 && text) lines.push(text);
  return lines.slice(0, maxChanges);
}
