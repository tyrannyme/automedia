import { PlusIcon } from "@heroicons/react/24/outline";
import { AppMark } from "@/components/app-mark.tsx";
import { Button } from "@/components/ui/button.tsx";

export function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="flex flex-1 items-center justify-center bg-canvas-preview">
      <div className="flex max-w-sm flex-col items-center text-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300">
        <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-surface">
          <AppMark className="size-6" />
        </div>
        <h2 className="font-wordmark text-xl leading-[1.2] font-semibold text-balance">
          No projects yet
        </h2>
        <p className="mt-2 text-sm text-pretty text-muted-foreground">
          Start a blank composition, pick an example from New, or let an agent make one over MCP.
        </p>
        <Button className="mt-6" onClick={onCreate}>
          <PlusIcon />
          New composition
        </Button>
      </div>
    </section>
  );
}
