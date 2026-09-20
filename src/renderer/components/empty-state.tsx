import { FilmIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button.tsx";

export function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="flex flex-1 items-center justify-center bg-canvas-preview">
      <div className="flex max-w-sm flex-col items-center gap-2 text-center">
        <FilmIcon className="size-6" aria-hidden="true" />
        <h2 className="font-wordmark text-xl leading-[1.2] font-semibold">No projects</h2>
        <p className="text-sm text-muted-foreground">Create a project in the sidebar to start.</p>
        <Button onClick={onCreate}>New composition</Button>
      </div>
    </section>
  );
}
