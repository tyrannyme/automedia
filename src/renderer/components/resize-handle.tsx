import { cn } from "@/lib/utils.ts";

type ResizeHandleProps = {
  orientation: "vertical" | "horizontal";
  label: string;
  active?: boolean;
  gutter?: boolean;
  onDragStart: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onToggle: () => void;
};

export function ResizeHandle({
  orientation,
  label,
  active = false,
  gutter = false,
  onDragStart,
  onToggle,
}: ResizeHandleProps) {
  return (
    <button
      type="button"
      className={cn("resize-handle", "border-0 p-0")}
      data-orientation={orientation}
      data-active={active ? "true" : "false"}
      data-gutter={gutter ? "true" : undefined}
      aria-label={label}
      title={`${label}. Drag to resize, double-click to collapse.`}
      onPointerDown={onDragStart}
      onDoubleClick={(event) => {
        event.preventDefault();
        onToggle();
      }}
    />
  );
}
