import { useEffect, useRef, useState } from "react";
import {
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  ArrowUpTrayIcon,
  ArrowsUpDownIcon,
  ChevronDownIcon,
  DocumentDuplicateIcon,
  EllipsisHorizontalIcon,
  FilmIcon,
  MagnifyingGlassIcon,
  PhotoIcon,
  PlusIcon,
  TrashIcon,
  WindowIcon,
} from "@heroicons/react/24/outline";
import { moveId } from "@shared/order.ts";
import type { ListedComposition } from "@shared/ipc.ts";
import { AgentAvatar } from "@/components/agent-avatar.tsx";
import { ProjectPoster } from "@/components/project-poster.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Input } from "@/components/ui/input.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import {
  formatLength,
  homeSortLabels,
  lastTouch,
  visibleProjects,
  type HomeSort,
} from "@/lib/home.ts";
import { isTypingTarget } from "@/lib/playback.ts";
import { cn } from "@/lib/utils.ts";

export type ProjectActions = {
  onOpen: (id: string) => void;
  onExport: (id: string) => void;
  onExportPng: (id: string) => void;
  onDuplicate: (id: string) => void;
  onSaveProject: (id: string) => void;
  onTrash: (id: string) => void;
};

type HomeGalleryProps = ProjectActions & {
  compositions: ListedComposition[];
  openIds: string[];
  onNew: () => void;
  onImport: () => void;
  onReorder: (ids: string[]) => void;
};

const sortKeys: readonly HomeSort[] = ["custom", "edited", "name"];
const PROJECT_MIME = "application/x-automedia-project";
const menuItem = "h-[34px] gap-2.5 px-2.5 text-sm [&_svg]:text-muted-foreground";

/** A poster at the project's true shape, centred in a box every card shares. */
export function PosterBox({
  item,
  className,
  children,
}: {
  item: Pick<ListedComposition, "id" | "name" | "background" | "width" | "height">;
  className?: string;
  children?: React.ReactNode;
}) {
  const ratio = item.width > 0 && item.height > 0 ? item.width / item.height : 16 / 9;
  return (
    <span className={cn("relative grid place-items-center [container-type:size]", className)}>
      <ProjectPoster
        composition={item}
        className="rounded-[4px] outline-foreground/8"
        style={{
          width: `min(100cqw, ${ratio} * 100cqh)`,
          aspectRatio: `${item.width} / ${item.height}`,
        }}
      />
      {children}
    </span>
  );
}

function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function edgeOf(event: React.DragEvent<HTMLElement>): "before" | "after" {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientX > rect.left + rect.width / 2 ? "after" : "before";
}

function CardMenu({ item, actions }: { item: ListedComposition; actions: ProjectActions }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`${item.name} actions`}
            className="absolute top-2 right-2 z-10 grid size-7 place-items-center rounded-[7px] bg-[rgb(10_10_10/0.78)] text-[#f5f5f5] opacity-0 outline-none group-hover/card:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-[#f5f5f5] aria-expanded:text-[#0a0a0a] aria-expanded:opacity-100"
          />
        }
      >
        <EllipsisHorizontalIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[220px]">
        <DropdownMenuItem className={menuItem} onClick={() => actions.onOpen(item.id)}>
          <ArrowTopRightOnSquareIcon />
          Open
        </DropdownMenuItem>
        <DropdownMenuItem className={menuItem} onClick={() => actions.onExport(item.id)}>
          <FilmIcon />
          Export…
        </DropdownMenuItem>
        <DropdownMenuItem className={menuItem} onClick={() => actions.onExportPng(item.id)}>
          <PhotoIcon />
          Export PNG
        </DropdownMenuItem>
        <DropdownMenuItem className={menuItem} onClick={() => actions.onDuplicate(item.id)}>
          <DocumentDuplicateIcon />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem className={menuItem} onClick={() => actions.onSaveProject(item.id)}>
          <ArrowDownTrayIcon />
          Save project…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          className={menuItem}
          onClick={() => actions.onTrash(item.id)}
        >
          <TrashIcon />
          Move to trash
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProjectCard({
  item,
  open,
  now,
  actions,
  draggable,
  dragging,
  dropEdge,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  item: ListedComposition;
  open: boolean;
  now: number;
  actions: ProjectActions;
  draggable: boolean;
  dragging: boolean;
  dropEdge: "before" | "after" | null;
  onDragStart: (event: React.DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onDragOver: (event: React.DragEvent<HTMLElement>) => void;
  onDrop: (event: React.DragEvent<HTMLElement>) => void;
}) {
  const touch = lastTouch(item, now);
  return (
    <div
      role="listitem"
      className={cn(
        "group/card @container/card relative min-w-0 transition-opacity duration-150",
        dragging && "opacity-30",
      )}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      data-composition-id={item.id}
    >
      <button
        type="button"
        className="block w-full rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Open ${item.name}`}
        onClick={() => actions.onOpen(item.id)}
      >
        <PosterBox
          item={item}
          className="aspect-[37/20] w-full rounded-xl bg-raised p-3.5 transition-colors duration-150 group-hover/card:bg-surface group-hover/card:transition-none"
        >
          {open && (
            <span className="absolute top-2.5 left-2.5 flex h-5 items-center gap-1 rounded-md bg-[rgb(10_10_10/0.78)] px-1.5 text-[11px] font-medium text-[#d4d4d4]">
              <WindowIcon className="size-3" />
              Open
            </span>
          )}
          {item.lease && (
            <span className="absolute bottom-2.5 left-2.5 flex h-[26px] max-w-[calc(100%-20px)] items-center gap-[7px] rounded-lg bg-[rgb(10_10_10/0.84)] pr-2.5 pl-1 text-xs text-[#f5f5f5] outline -outline-offset-1 outline-white/8">
              <AgentAvatar name={item.lease.holder} live size={18} ring="#0a0a0a" />
              <span className="truncate">{item.lease.holder}</span>
              <span className="shrink-0 text-[#a3a3a3]">working now</span>
            </span>
          )}
        </PosterBox>
        <span className="mt-2.5 flex h-5 items-center text-sm font-medium">
          <span className="truncate">{item.name}</span>
        </span>
        <span className="mt-0.5 flex h-[18px] items-center gap-2">
          <span className="shrink-0 font-mono text-xs text-dim">
            {item.width}×{item.height} · {formatLength(item.durationSeconds)}
          </span>
          <span className="ml-auto flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <AgentAvatar name={touch.who} you={!item.lease} size={16} />
            <span className="truncate @max-[250px]/card:hidden">{touch.who}</span>
            <span className="shrink-0 font-mono text-dim">{touch.when}</span>
          </span>
        </span>
      </button>
      <CardMenu item={item} actions={actions} />
      {dropEdge && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-20 aspect-[37/20]"
        >
          <span
            className={cn(
              "absolute inset-y-0 w-0.5 rounded-full bg-foreground",
              dropEdge === "before" ? "-left-[11px]" : "-right-[11px]",
            )}
          />
        </span>
      )}
    </div>
  );
}

export function HomeGallery({
  compositions,
  openIds,
  onNew,
  onImport,
  onReorder,
  ...actions
}: HomeGalleryProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<HomeSort>("custom");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; edge: "before" | "after" } | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const now = useMinuteClock();
  const openSet = new Set(openIds);
  const shown = visibleProjects(compositions, query, sort);
  const canDrag = sort === "custom" && query.trim() === "";

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "/" || isTypingTarget(event.target)) return;
      event.preventDefault();
      search.current?.focus();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const finishDrag = () => {
    setDraggingId(null);
    setOver(null);
  };
  const drop = (sourceId: string, targetId: string, after: boolean) => {
    const current = compositions.map((item) => item.id);
    const ids = moveId(current, sourceId, targetId, after);
    if (!ids.every((id, index) => id === current[index])) onReorder(ids);
  };

  return (
    <section
      className="studio-nest flex min-h-0 min-w-0 flex-1 flex-col bg-canvas-preview"
      aria-label="Projects"
      data-canvas="home"
    >
      <header className="flex h-16 shrink-0 items-center gap-2 pr-5 pl-7">
        <h2 className="text-[15px] font-medium tracking-[-0.015em]">Projects</h2>
        <span className="ml-1 font-mono text-[13px] text-dim">{compositions.length}</span>
        <div className="min-w-0 flex-1" />
        <div className="relative w-[260px] min-w-[140px] shrink">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-dim" />
          <Input
            ref={search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setQuery("");
                event.currentTarget.blur();
              }
            }}
            placeholder="Search projects"
            aria-label="Search projects"
            className="h-8 rounded-lg bg-raised pr-8 pl-8 text-[13px] placeholder:text-dim"
          />
          {!query && (
            <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-[5px] bg-surface px-[5px] py-[3px] font-mono text-xs leading-none text-dim">
              /
            </kbd>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 px-2.5 text-[13px] text-muted-foreground max-[860px]:px-2"
                aria-label={`Sort: ${homeSortLabels[sort]}`}
              />
            }
          >
            <ArrowsUpDownIcon className="size-4" />
            <span className="max-[860px]:hidden">{homeSortLabels[sort]}</span>
            <ChevronDownIcon className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuRadioGroup
              value={sort}
              onValueChange={(value) => {
                const next = sortKeys.find((key) => key === value);
                if (next) setSort(next);
              }}
            >
              {sortKeys.map((key) => (
                <DropdownMenuRadioItem key={key} value={key} className="h-[34px] text-sm">
                  {homeSortLabels[key]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="sm" className="gap-1.5 px-2.5 text-[13px]" onClick={onImport}>
          <ArrowUpTrayIcon className="size-4" />
          Import
        </Button>
        <Button size="sm" className="ml-1 gap-1.5 px-3 text-[13px]" onClick={onNew}>
          <PlusIcon className="size-4" />
          New
        </Button>
      </header>
      <ScrollArea className="min-h-0 flex-1 basis-0">
        {shown.length === 0 ? (
          <p className="px-7 pt-10 text-sm text-muted-foreground">
            No projects match “{query.trim()}”.
          </p>
        ) : (
          <div
            role="list"
            className="grid grid-cols-2 gap-x-5 gap-y-[18px] px-7 pb-5 min-[700px]:grid-cols-3 min-[1100px]:grid-cols-4 min-[1640px]:grid-cols-5"
          >
            {shown.map((item) => (
              <ProjectCard
                key={item.id}
                item={item}
                open={openSet.has(item.id)}
                now={now}
                actions={actions}
                draggable={canDrag}
                dragging={draggingId === item.id}
                dropEdge={
                  draggingId && draggingId !== item.id && over?.id === item.id ? over.edge : null
                }
                onDragStart={(event) => {
                  if (!canDrag) return;
                  event.dataTransfer.setData(PROJECT_MIME, item.id);
                  event.dataTransfer.effectAllowed = "move";
                  setDraggingId(item.id);
                }}
                onDragEnd={finishDrag}
                onDragOver={(event) => {
                  if (!event.dataTransfer.types.includes(PROJECT_MIME)) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  const edge = edgeOf(event);
                  if (over?.id !== item.id || over.edge !== edge) setOver({ id: item.id, edge });
                }}
                onDrop={(event) => {
                  const source = event.dataTransfer.getData(PROJECT_MIME);
                  if (!source) return;
                  event.preventDefault();
                  drop(source, item.id, edgeOf(event) === "after");
                  finishDrag();
                }}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </section>
  );
}
