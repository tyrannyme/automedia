/** Code pane caption: the file name reads first, its folder stays quiet. Lights up while editing. */
export function PanePath({ path }: { path: string }) {
  const cut = path.lastIndexOf("/");
  const folder = cut === -1 ? "" : path.slice(0, cut + 1);
  const name = path.slice(cut + 1);
  return (
    <p className="truncate font-mono text-xs text-muted-foreground transition-colors duration-200 group-focus-within:text-foreground">
      <span className="opacity-60">{folder}</span>
      {name}
    </p>
  );
}
