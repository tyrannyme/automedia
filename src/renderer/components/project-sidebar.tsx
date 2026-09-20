import {
  ChevronLeftIcon,
  ChevronRightIcon,
  EllipsisHorizontalIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import { moveId } from "@shared/order.ts";
import type { Composition, MediaTrack } from "@shared/schemas.ts";
import type { ExampleId } from "../../main/examples/index.ts";
import { LibraryPanel } from "@/components/library-panel.tsx";
import { ProjectPoster } from "@/components/project-poster.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { exampleChoices } from "@/lib/examples.ts";
import { cn } from "@/lib/utils.ts";

type ProjectSidebarProps = {
  compositions: Composition[];
  compositionId: string | null;
  openIds: string[];
  collapsed: boolean;
  onSelect: (id: string) => void;
  onCreate: (example?: ExampleId) => void;
  onImport: () => void;
  onExport: (id: string) => void;
  onExportPng: (id: string) => void;
  onDuplicate: (id: string) => void;
  onSaveProject: (id: string) => void;
  onTrash: (id: string) => void;
  onReorder?: (ids: string[]) => void;
  onToggle?: () => void;
  files?: string[];
  onTrack?: (track: MediaTrack) => Promise<void>;
};

const PROJECT_MIME = "application/x-automedia-project";

function edgeFromEvent(event: React.DragEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY > rect.top + rect.height / 2 ? "after" : "before";
}

export function ProjectSidebar({
  compositions,
  compositionId,
  openIds,
  collapsed,
  onSelect,
  onCreate,
  onImport,
  onExport,
  onExportPng,
  onDuplicate,
  onSaveProject,
  onTrash,
  onReorder,
  onToggle,
  files = [],
  onTrack,
}: ProjectSidebarProps) {
  const openSet = new Set(openIds);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [overEdge, setOverEdge] = useState<"before" | "after">("before");

  const moveProject = (sourceId: string, targetId: string | null, after = false) => {
    if (!onReorder) return;
    const current = compositions.map((item) => item.id);
    const ids = moveId(current, sourceId, targetId, after);
    if (ids.every((id, index) => id === current[index])) return;
    onReorder(ids);
  };

  return (
    <aside
      className="flex h-full min-h-0 w-full min-w-0 flex-col bg-canvas-rail"
      aria-label="Projects"
      data-canvas="rail"
      data-collapsed={collapsed ? "true" : "false"}
      data-project-count={compositions.length}
    >
      <div
        className={cn(
          "flex shrink-0 items-center px-3 pt-2 pb-1",
          collapsed && "justify-center px-2",
        )}
      >
        {onToggle && collapsed && (
          <Button variant="ghost" size="icon-sm" aria-label="Show projects" onClick={onToggle}>
            <ChevronRightIcon />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size={collapsed ? "icon-sm" : "sm"}
                aria-label="New project"
              />
            }
          >
            <PlusIcon />
            {!collapsed && <span>New</span>}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 shadow-none">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Start a project</DropdownMenuLabel>
              <DropdownMenuItem onClick={onImport}>Import project</DropdownMenuItem>
              <DropdownMenuSeparator />
              {exampleChoices.map((example) => (
                <DropdownMenuItem
                  key={example.value}
                  onClick={() => (example.value === "blank" ? onCreate() : onCreate(example.value))}
                >
                  {example.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {onToggle && !collapsed && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto"
            aria-label="Hide projects"
            onClick={onToggle}
          >
            <ChevronLeftIcon />
          </Button>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1 basis-0">
        <div className={cn("flex flex-col gap-1.5 p-3 pt-1", collapsed && "items-center px-2")}>
          {compositions.length === 0 && !collapsed && (
            <p className="px-2 py-3 text-sm text-muted-foreground">No projects yet.</p>
          )}
          {compositions.map((item) => {
            const selected = item.id === compositionId;
            const open = openSet.has(item.id);
            return (
              <div
                key={item.id}
                draggable={!collapsed}
                className={cn(
                  "group relative flex w-full min-w-0 items-center rounded-xl transition-colors hover:bg-surface hover:transition-none",
                  !collapsed && "cursor-grab active:cursor-grabbing",
                  selected && "bg-surface",
                  collapsed ? "justify-center rounded-lg p-1" : "gap-3 px-2.5 py-2",
                  draggingId === item.id && "opacity-40",
                )}
                onDragStart={(event) => {
                  if (collapsed) return;
                  event.dataTransfer.setData(PROJECT_MIME, item.id);
                  event.dataTransfer.effectAllowed = "move";
                  setDraggingId(item.id);
                }}
                onDragEnd={() => {
                  setDraggingId(null);
                  setOverId(null);
                }}
                onDragOver={(event) => {
                  if (!event.dataTransfer.types.includes(PROJECT_MIME)) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setOverId(item.id);
                  setOverEdge(edgeFromEvent(event));
                }}
                onDrop={(event) => {
                  const source = event.dataTransfer.getData(PROJECT_MIME);
                  if (!source) return;
                  event.preventDefault();
                  moveProject(source, item.id, edgeFromEvent(event) === "after");
                  setDraggingId(null);
                  setOverId(null);
                }}
              >
                <button
                  type="button"
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2.5 text-left",
                    collapsed && "flex-none",
                  )}
                  onClick={() => onSelect(item.id)}
                  aria-current={selected ? "page" : undefined}
                  aria-label={item.name}
                >
                  <ProjectPoster
                    composition={item}
                    className={collapsed ? "h-9 w-12" : "h-10 w-[4.5rem]"}
                  />
                  {!collapsed && (
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.name}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {item.width}×{item.height}
                      </span>
                    </span>
                  )}
                </button>
                {!collapsed && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="opacity-0 group-hover:opacity-100 aria-expanded:opacity-100"
                          aria-label={`${item.name} actions`}
                        />
                      }
                    >
                      <EllipsisHorizontalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 shadow-none">
                      <DropdownMenuItem onClick={() => onExport(item.id)}>Export</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onExportPng(item.id)}>
                        Export PNG
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDuplicate(item.id)}>
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onSaveProject(item.id)}>
                        Save project
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => onTrash(item.id)}>
                        Move to trash
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {collapsed && open && !selected && (
                  <span className="absolute top-1 right-1 size-1.5 rounded-sm bg-foreground" />
                )}
                {overId === item.id && draggingId && draggingId !== item.id && (
                  <span
                    className="pointer-events-none absolute inset-x-2 h-px bg-foreground"
                    style={overEdge === "after" ? { bottom: 0 } : { top: 0 }}
                    aria-hidden="true"
                  />
                )}
              </div>
            );
          })}
          {!collapsed && compositions.length > 0 && (
            <div
              className={cn("h-3", draggingId && "h-8")}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes(PROJECT_MIME)) return;
                event.preventDefault();
                setOverId(null);
              }}
              onDrop={(event) => {
                const source = event.dataTransfer.getData(PROJECT_MIME);
                if (!source) return;
                event.preventDefault();
                moveProject(source, null);
                setDraggingId(null);
                setOverId(null);
              }}
            />
          )}
        </div>
      </ScrollArea>
      {onTrack && (
        <LibraryPanel
          composition={compositions.find((item) => item.id === compositionId) ?? null}
          files={files}
          collapsed={collapsed}
          onTrack={onTrack}
        />
      )}
    </aside>
  );
}
