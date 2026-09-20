export type Appearance = "system" | "light" | "dark";

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

export function applyAppearance(appearance: Appearance): void {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  if (appearance === "light") {
    root.classList.add("light");
    return;
  }
  if (appearance === "dark") {
    root.classList.add("dark");
    return;
  }
  if (darkQuery.matches) {
    root.classList.add("dark");
  }
}

export function watchAppearance(appearance: Appearance): () => void {
  applyAppearance(appearance);
  if (appearance !== "system") {
    return () => {};
  }
  const onChange = () => {
    applyAppearance("system");
  };
  darkQuery.addEventListener("change", onChange);
  return () => {
    darkQuery.removeEventListener("change", onChange);
  };
}
