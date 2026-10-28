/** The viewfinder mark, drawn in the current text color so it follows appearance. */
export function AppMark({ className }: { className?: string }) {
  return (
    <svg viewBox="210 190 604 642" className={className} aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M210 190h604v470H712V298H372l73 85h-97L210 242z" />
      <path fill="currentColor" d="M210 365h101v359h340l-73-84h98l138 140v52H210z" />
    </svg>
  );
}
