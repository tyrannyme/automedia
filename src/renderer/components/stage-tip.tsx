import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";

/** A delayed tooltip for the stage's icon buttons. */
export function Tip({
  label,
  side = "top",
  children,
}: {
  label: string;
  side?: "top" | "bottom";
  children: React.ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger delay={400} render={children} />
      <TooltipContent
        side={side}
        className="data-closed:animate-none data-open:animate-none data-[state=delayed-open]:animate-none"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
