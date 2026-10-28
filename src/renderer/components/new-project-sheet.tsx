import { useEffect, useState } from "react";
import {
  AdjustmentsHorizontalIcon,
  ArrowUpTrayIcon,
  ClockIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  FilmIcon,
  MagnifyingGlassIcon,
  MusicalNoteIcon,
  PhotoIcon,
  PlusIcon,
  SpeakerXMarkIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import type { ExampleId } from "../../engine/examples/index.ts";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import {
  blankTemplate,
  exampleGroups,
  exampleTemplate,
  matchesTemplate,
  type ExampleKind,
} from "@/lib/examples.ts";
import { formatLength } from "@/lib/home.ts";
import { cn } from "@/lib/utils.ts";

export type TemplateChoice = ExampleId | "blank" | "import";

const kindIcon = {
  motion: ClockIcon,
  page: DocumentTextIcon,
  still: PhotoIcon,
  controls: AdjustmentsHorizontalIcon,
  media: FilmIcon,
  silent: SpeakerXMarkIcon,
  music: MusicalNoteIcon,
  check: ExclamationTriangleIcon,
} satisfies Record<ExampleKind, typeof ClockIcon>;

const TILE = 148;
const TILE_GAP = 16;

/**
 * A template's frame: its real shape and background, with an icon for what it does.
 * No example has a rendered thumbnail yet, so nothing here pretends to be one.
 */
export function TemplateArt({ choice, className }: { choice: TemplateChoice; className?: string }) {
  if (choice === "import") {
    return (
      <span className={cn("grid place-items-center text-muted-foreground", className)}>
        <span className="grid justify-items-center gap-1.5">
          <ArrowUpTrayIcon className="size-[18px]" />
          <span className="font-mono text-[11px] leading-none">.automedia</span>
        </span>
      </span>
    );
  }
  const spec = choice === "blank" ? blankTemplate : exampleTemplate(choice);
  const Icon = choice === "blank" ? PlusIcon : kindIcon[exampleTemplate(choice).kind];
  const transparent = spec.background === "transparent";
  return (
    <span className={cn("grid place-items-center [container-type:size]", className)}>
      <span
        className={cn(
          "grid place-items-center rounded-[3px] outline -outline-offset-1 outline-foreground/8",
          transparent ? "chequer text-muted-foreground" : "text-white/55",
        )}
        style={{
          width: `min(100cqw, ${spec.width / spec.height} * 100cqh)`,
          aspectRatio: `${spec.width} / ${spec.height}`,
          backgroundColor: transparent ? undefined : spec.background,
          backgroundSize: transparent ? "12px 12px" : undefined,
        }}
      >
        <Icon className="size-[18px]" />
      </span>
    </span>
  );
}

export type TemplateFacts = { name: string; description: string; meta: string };

export function templateFacts(choice: TemplateChoice): TemplateFacts {
  if (choice === "import") {
    return {
      name: "Import project",
      description: "Pick a .automedia file. It always becomes a new project.",
      meta: "from a file",
    };
  }
  const spec = choice === "blank" ? blankTemplate : exampleTemplate(choice);
  return {
    name: spec.name,
    description: spec.description,
    meta: `${spec.width}×${spec.height} · ${formatLength(spec.durationSeconds)}`,
  };
}

function Tile({
  choice,
  selected,
  onSelect,
  onChoose,
}: {
  choice: TemplateChoice;
  selected: boolean;
  onSelect: () => void;
  onChoose: () => void;
}) {
  const facts = templateFacts(choice);
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "-m-1.5 min-w-0 rounded-xl p-1.5 text-left outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring",
        selected && "bg-surface hover:bg-surface",
      )}
      onClick={onSelect}
      onDoubleClick={onChoose}
    >
      <TemplateArt
        choice={choice}
        className="aspect-[148/83] w-full overflow-hidden rounded-lg bg-raised"
      />
      <span className="mt-[7px] block truncate text-[13px] font-medium">{facts.name}</span>
      <span className="block truncate font-mono text-[11.5px] leading-[1.4] text-dim">
        {facts.meta}
      </span>
    </button>
  );
}

function Group({
  title,
  note,
  count,
  choices,
  children,
}: {
  title: string;
  note?: string | undefined;
  count?: number | undefined;
  choices: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className="max-w-full min-w-0"
      style={{ width: choices * TILE + (choices - 1) * TILE_GAP }}
    >
      <h3 className="flex h-8 items-center gap-2 text-[13px] font-medium">
        {title}
        {count !== undefined && <span className="font-mono text-xs text-dim">{count}</span>}
        <span className="flex-1" />
        {note && <span className="text-xs font-normal text-dim">{note}</span>}
      </h3>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-x-4 gap-y-3.5">
        {children}
      </div>
    </section>
  );
}

/** The New sheet: Blank and Import, then the engine's examples grouped by what they teach. */
export function NewProjectSheet({
  open,
  onOpenChange,
  onCreate,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (example?: ExampleId) => void;
  onImport: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<TemplateChoice>("blank");
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected("blank");
  }, [open]);

  const choose = (choice: TemplateChoice) => {
    onOpenChange(false);
    if (choice === "import") onImport();
    else if (choice === "blank") onCreate();
    else onCreate(choice);
  };
  const start = (["blank", "import"] as const).filter((choice) =>
    matchesTemplate(templateFacts(choice), query),
  );
  const groups = exampleGroups
    .map((group) => ({
      ...group,
      shown: group.ids.filter((id) => matchesTemplate(exampleTemplate(id), query)),
    }))
    .filter((group) => group.shown.length > 0);
  const visible: TemplateChoice[] = [...start, ...groups.flatMap((group) => group.shown)];
  const current = visible.includes(selected) ? selected : (visible[0] ?? null);
  const facts = current ? templateFacts(current) : null;
  const spec =
    current && current !== "import"
      ? current === "blank"
        ? blankTemplate
        : exampleTemplate(current)
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(684px,calc(100vh-48px))] w-[min(1182px,calc(100vw-48px))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        onKeyDown={(event) => {
          if (event.key === "Enter" && current && !(event.target instanceof HTMLButtonElement)) {
            event.preventDefault();
            choose(current);
          }
        }}
      >
        <header className="flex h-9 shrink-0 items-center gap-2.5 px-6 mt-[22px]">
          <DialogTitle className="text-[17px] font-medium tracking-[-0.02em]">
            New project
          </DialogTitle>
          <span className="flex-1" />
          <div className="relative w-[240px] min-w-[140px] shrink">
            <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-dim" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search templates"
              aria-label="Search templates"
              className="h-8 rounded-lg bg-raised pl-8 text-[13px] placeholder:text-dim focus-visible:ring-0"
            />
          </div>
          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                aria-label="Close"
              />
            }
          >
            <XMarkIcon className="size-4" />
          </DialogClose>
        </header>
        <ScrollArea className="min-h-0 flex-1 basis-0">
          <div className="flex flex-wrap gap-x-4 gap-y-3.5 px-6 pt-[18px] pb-1">
            {start.length > 0 && (
              <Group title="Start" choices={2}>
                {start.map((choice) => (
                  <Tile
                    key={choice}
                    choice={choice}
                    selected={current === choice}
                    onSelect={() => setSelected(choice)}
                    onChoose={() => choose(choice)}
                  />
                ))}
              </Group>
            )}
            {groups.map((group) => (
              <Group
                key={group.title}
                title={group.title}
                note={group.note}
                count={group.ids.length}
                choices={group.ids.length}
              >
                {group.shown.map((id) => (
                  <Tile
                    key={id}
                    choice={id}
                    selected={current === id}
                    onSelect={() => setSelected(id)}
                    onChoose={() => choose(id)}
                  />
                ))}
              </Group>
            ))}
            {visible.length === 0 && (
              <p className="py-6 text-sm text-muted-foreground">
                No templates match “{query.trim()}”.
              </p>
            )}
          </div>
        </ScrollArea>
        <footer className="mx-6 mt-[18px] mb-5 flex shrink-0 items-center gap-3 border-t border-border pt-4">
          <p className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
            {facts && (
              <>
                <span className="font-medium text-foreground">{facts.name}</span> ·{" "}
                {facts.description}
                {spec && (
                  <span className="ml-1.5 font-mono text-dim">
                    {spec.width}×{spec.height} · {spec.fps} fps ·{" "}
                    {formatLength(spec.durationSeconds)}
                  </span>
                )}
              </>
            )}
          </p>
          <DialogClose render={<Button variant="ghost" size="sm" className="px-3 text-[13px]" />}>
            Cancel
          </DialogClose>
          <Button
            size="sm"
            className="px-3 text-[13px]"
            disabled={!current}
            onClick={() => current && choose(current)}
          >
            {current === "import" ? "Import" : "Create"}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
