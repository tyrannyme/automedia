import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border-0 bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground hover:bg-surface hover:transition-none focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
