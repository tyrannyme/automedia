import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDownIcon, PlusIcon, Squares2X2Icon, XMarkIcon } from "@heroicons/react/24/outline";
import { Squares2X2Icon as Squares2X2Solid } from "@heroicons/react/24/solid";
import type { ExportJob } from "../../engine/export.ts";
import type { ListedComposition } from "@shared/ipc.ts";
import { AgentAvatar } from "@/components/agent-avatar.tsx";
import { AppMark } from "@/components/app-mark.tsx";
import { ProjectPoster } from "@/components/project-poster.tsx";
import { UpdateButton } from "@/components/update-button.tsx";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { exportIsRunning } from "@/lib/export-progress.ts";
import { fitTabs, TAB_SIZES } from "@/lib/tabs.ts";
import { cn } from "@/lib/utils.ts";

type TitlebarProps = {
  compositions: ListedComposition[];
  openIds: string[];
  /** The project on screen, or null while Home is. */
  activeId: string | null;
  homeActive: boolean;
  compact: boolean;
  /** Export only exists while a project is on screen. */
  canExport: boolean;
  exportJob: ExportJob | null;
  /** The panel area fills this with the agent presence chip. */
  presence?: ReactNode;
  onHome: () => void;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onCloseOthers: (keepId: string | null) => void;
  onNew: () => void;
  onExport: () => void;
};

const tabBase =
  "group/tab relative flex h-[30px] min-w-0 shrink items-center rounded-lg text-[13px] leading-none font-medium text-muted-foreground transition-colors duration-150 hover:bg-raised hover:text-foreground hover:transition-none";

function TabThumb({ item }: { item: ListedComposition }) {
  return <ProjectPoster composition={item} className="h-4 w-6 rounded-[4px]" />;
}

function ProjectTab({
  item,
  active,
  mini,
  squeezed,
  onSelect,
  onClose,
}: {
  item: ListedComposition;
  active: boolean;
  mini: boolean;
  /** Some tabs have folded into the overflow menu. */
  squeezed: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const holder = item.lease?.holder ?? null;
  // The active tab keeps its close button, and a live agent keeps its seat; others float.
  const inFlow = active || holder !== null;
  const select = (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={item.name}
      className={cn(
        "flex h-full min-w-0 flex-1 items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring",
        mini ? "justify-center" : "pl-[5px]",
      )}
      onClick={onSelect}
      onAuxClick={(event) => {
        if (event.button === 1) onClose();
      }}
    >
      <TabThumb item={item} />
      {!mini && <span className="min-w-0 flex-1 truncate text-left">{item.name}</span>}
    </button>
  );
  return (
    <div
      className={cn(
        tabBase,
        active && "bg-raised text-foreground",
        mini ? "w-[34px] flex-none" : inFlow ? "pr-1.5" : "pr-2",
      )}
      style={
        mini
          ? undefined
          : // Tabs keep their natural width and shrink only when crowded. The active one
            // keeps its name, up to its own floor once others have folded away.
            {
              maxWidth: active && squeezed ? TAB_SIZES.activeFloor : TAB_SIZES.max,
              flexShrink: active ? 0 : 1,
            }
      }
      data-composition-id={item.id}
    >
      {mini ? (
        <Tooltip>
          <TooltipTrigger delay={300} render={select} />
          <TooltipContent side="bottom">{item.name}</TooltipContent>
        </Tooltip>
      ) : (
        select
      )}
      {!mini && (
        <span
          className={cn(
            "grid size-5 shrink-0 place-items-center",
            inFlow
              ? "ml-1.5"
              : // A squeezed tab spends its width on the name; close floats in on hover.
                "pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 rounded-[5px] bg-raised opacity-0 shadow-[-10px_0_8px_var(--raised)] group-hover/tab:pointer-events-auto group-hover/tab:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100",
          )}
        >
          {holder && (
            <span
              className="col-start-1 row-start-1 group-hover/tab:invisible"
              title={`${holder} is working here`}
            >
              <AgentAvatar
                name={holder}
                live
                size={16}
                ring={active ? "var(--raised)" : "var(--background)"}
              />
            </span>
          )}
          <button
            type="button"
            aria-label={`Close ${item.name}`}
            className={cn(
              "col-start-1 row-start-1 grid size-5 place-items-center rounded-[5px] text-dim outline-none hover:bg-surface hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
              holder && "invisible group-hover/tab:visible focus-visible:visible",
            )}
            onClick={onClose}
          >
            <XMarkIcon className="size-3.5" />
          </button>
        </span>
      )}
    </div>
  );
}

function OverflowMenu({
  items,
  onSelect,
  onCloseOthers,
}: {
  items: ListedComposition[];
  onSelect: (id: string) => void;
  onCloseOthers: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-[30px] flex-none gap-1 px-2 font-mono text-[13px] font-normal text-muted-foreground"
            aria-label={`${items.length} more open projects`}
          />
        }
      >
        +{items.length}
        <ChevronDownIcon className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2.5 pt-2 pb-1 text-xs text-dim">
            {items.length} more open
          </DropdownMenuLabel>
          {items.map((item) => (
            <DropdownMenuItem
              key={item.id}
              className="h-[34px] gap-2.5 px-2.5"
              onClick={() => onSelect(item.id)}
            >
              <TabThumb item={item} />
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {item.lease && (
                <AgentAvatar name={item.lease.holder} live size={18} ring="var(--popover)" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="h-[34px] gap-2.5 px-2.5 [&_svg]:text-muted-foreground"
          onClick={onCloseOthers}
        >
          <XMarkIcon />
          Close other tabs
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Titlebar({
  compositions,
  openIds,
  activeId,
  homeActive,
  compact,
  canExport,
  exportJob,
  presence,
  onHome,
  onSelect,
  onClose,
  onCloseOthers,
  onNew,
  onExport,
}: TitlebarProps) {
  const running = exportIsRunning(exportJob);
  const strip = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(10_000);
  useLayoutEffect(() => {
    const node = strip.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setRoom(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const byId = new Map(compositions.map((item) => [item.id, item]));
  const open = openIds.filter((id) => byId.has(id));
  const tabActive = homeActive ? null : activeId;
  const fit = fitTabs(open, tabActive, room, { compact });
  const lookup = (ids: string[]) =>
    ids.map((id) => byId.get(id)).filter((item): item is ListedComposition => Boolean(item));

  return (
    <header
      className="titlebar studio-titlebar flex h-11 min-h-11 shrink-0 items-center gap-1.5 bg-background"
      aria-label="Automedia"
    >
      <span className="grid size-[30px] shrink-0 place-items-center text-foreground">
        <AppMark className="size-[18px]" />
      </span>
      <Tooltip>
        <TooltipTrigger
          delay={300}
          render={
            <button
              type="button"
              aria-label="Home"
              aria-current={homeActive ? "page" : undefined}
              data-no-drag=""
              className={cn(
                tabBase,
                "w-[30px] flex-none justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring",
                homeActive && "bg-raised text-foreground",
              )}
              onClick={onHome}
            />
          }
        >
          {homeActive ? (
            <Squares2X2Solid className="size-4" />
          ) : (
            <Squares2X2Icon className="size-4" />
          )}
        </TooltipTrigger>
        <TooltipContent side="bottom">All projects</TooltipContent>
      </Tooltip>
      <div ref={strip} className="flex h-full min-w-0 flex-1 items-center">
        <div
          className="flex min-w-0 items-center gap-0.5"
          role="tablist"
          aria-label="Open projects"
        >
          {lookup(fit.visible).map((item) => (
            <ProjectTab
              key={item.id}
              item={item}
              active={item.id === tabActive}
              mini={compact && item.id !== tabActive}
              squeezed={fit.hidden.length > 0}
              onSelect={() => onSelect(item.id)}
              onClose={() => onClose(item.id)}
            />
          ))}
          {fit.hidden.length > 0 && (
            <OverflowMenu
              items={lookup(fit.hidden)}
              onSelect={onSelect}
              onCloseOthers={() => onCloseOthers(tabActive)}
            />
          )}
          <Tooltip>
            <TooltipTrigger
              delay={300}
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="ml-0.5 rounded-[7px] text-muted-foreground"
                  aria-label="New project"
                  onClick={onNew}
                />
              }
            >
              <PlusIcon className="size-4" />
            </TooltipTrigger>
            <TooltipContent side="bottom">New project</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {presence}
      <UpdateButton exporting={running} />

      {canExport && (
        <Button
          variant={running ? "secondary" : "default"}
          size="sm"
          className="ml-0.5 px-3 text-[13px]"
          data-no-drag=""
          data-export-trigger=""
          aria-label={running ? "Export in progress" : "Export"}
          onClick={onExport}
        >
          {running ? "Exporting" : "Export"}
        </Button>
      )}
    </header>
  );
}
