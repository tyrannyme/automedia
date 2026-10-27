import { useEffect, useMemo, useRef, useState, type ComponentType, type SVGProps } from "react";
import {
  ArrowUpTrayIcon,
  BookmarkIcon,
  ChatBubbleLeftRightIcon,
  CodeBracketIcon,
  Cog6ToothIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  MusicalNoteIcon,
  PauseIcon,
  PhotoIcon,
  PlayIcon,
  Square2StackIcon,
} from "@heroicons/react/24/outline";
import { formatTimecode } from "@/lib/timecode.ts";
import { ProjectPoster } from "@/components/project-poster.tsx";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  chordKeys,
  isMac,
  isPaletteChord,
  matches,
  nextGroupStart,
  orderProjects,
  stepIndex,
  type Chord,
} from "@/lib/command-palette.ts";
import { newLocalId } from "@/lib/ids.ts";
import { cn } from "@/lib/utils.ts";
import { useStudioStore } from "@/stores/studio.ts";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

type Command = {
  id: string;
  group: "project" | "view";
  label: string;
  hint?: string | undefined;
  icon: Icon;
  chord?: Chord;
  run: () => void;
};

type CommandPaletteProps = {
  onExport: () => void;
  onExportFrame: () => void;
  onSettings: () => void;
  onActivity: () => void;
};

const mac = isMac(navigator.platform);
const optionId = (at: number) => `palette-option-${at}`;
const posterCount = 5;

/**
 * ⌘K (Ctrl+K elsewhere): one field over projects and commands. Every command
 * here already exists in the studio; the keys shown are the ones it handles.
 */
export function CommandPalette({
  onExport,
  onExportFrame,
  onSettings,
  onActivity,
}: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const compositions = useStudioStore((state) => state.compositions);
  const openIds = useStudioStore((state) => state.openIds);
  const compositionId = useStudioStore((state) => state.compositionId);
  const composition = useStudioStore((state) => state.composition);
  const homeOpen = useStudioStore((state) => state.homeOpen);
  const playing = useStudioStore((state) => state.playing);
  const playheadSeconds = useStudioStore((state) => (open ? state.playheadSeconds : 0));
  const selected = useStudioStore((state) =>
    state.media.tracks.find((track) => track.id === state.selectedTrackId),
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!isPaletteChord(event, mac)) return;
      // Another modal (export, code) owns the keyboard; the palette waits.
      const other = document.querySelector(
        "[data-slot=dialog-content][data-open]:not([data-command-palette])",
      );
      if (other && !open) return;
      event.preventDefault();
      setOpen((value) => !value);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const projects = useMemo(
    () =>
      orderProjects(compositions, openIds)
        .filter((item) => matches(query, item.name))
        .slice(0, posterCount),
    [compositions, openIds, query],
  );

  const inProject = Boolean(composition) && !homeOpen;
  const commands = useMemo<Command[]>(() => {
    const store = () => useStudioStore.getState();
    const list: Command[] = [];
    if (inProject && composition) {
      list.push(
        {
          id: "export",
          group: "project",
          label: "Export…",
          hint: "MP4, WebM, GIF, PNG, audio",
          icon: ArrowUpTrayIcon,
          run: onExport,
        },
        {
          id: "export-frame",
          group: "project",
          label: "Export this frame as PNG",
          hint: formatTimecode(playheadSeconds, composition.fps),
          icon: PhotoIcon,
          run: onExportFrame,
        },
        {
          id: "play",
          group: "project",
          label: playing ? "Pause" : "Play",
          icon: playing ? PauseIcon : PlayIcon,
          chord: ["space"],
          run: () => store().togglePlay(),
        },
        {
          id: "add-block",
          group: "project",
          label: "Add block at playhead",
          icon: Square2StackIcon,
          run: () => void store().createBlock(),
        },
        {
          id: "add-music",
          group: "project",
          label: "Add music at playhead",
          icon: MusicalNoteIcon,
          run: () => void store().createMusicBlock(),
        },
        {
          id: "add-marker",
          group: "project",
          label: "Add marker",
          icon: BookmarkIcon,
          run: () =>
            void store().putMarker({
              id: newLocalId("m"),
              timeSeconds: store().playheadSeconds,
              label: "Marker",
            }),
        },
      );
      if (selected?.kind === "block" || selected?.kind === "music") {
        list.push({
          id: "edit-code",
          group: "project",
          label: selected.kind === "music" ? "Edit pattern" : "Edit code",
          hint: selected.name || undefined,
          icon: CodeBracketIcon,
          run: () => store().setMode(selected.kind === "music" ? "music" : "code"),
        });
      }
      list.push({
        id: "settings",
        group: "project",
        label: "Composition settings",
        hint: `${composition.width} × ${composition.height} · ${composition.fps} fps`,
        icon: Cog6ToothIcon,
        run: onSettings,
      });
    }
    if (inProject) {
      list.push({
        id: "activity",
        group: "view",
        label: "Show agent activity",
        icon: ChatBubbleLeftRightIcon,
        chord: ["shift", "mod", "a"],
        run: onActivity,
      });
    }
    if (!homeOpen) {
      list.push({
        id: "home",
        group: "view",
        label: "Go to Home",
        hint: "every project",
        icon: HomeIcon,
        run: () => store().showHome(),
      });
    }
    return list.filter((command) => matches(query, `${command.label} ${command.hint ?? ""}`));
  }, [
    composition,
    homeOpen,
    inProject,
    onActivity,
    onExport,
    onExportFrame,
    onSettings,
    playheadSeconds,
    playing,
    query,
    selected,
  ]);

  const projectCommands = commands.filter((command) => command.group === "project");
  const viewCommands = commands.filter((command) => command.group === "view");
  const ordered = [...projectCommands, ...viewCommands];
  const total = projects.length + ordered.length;
  const groups = [
    [0, projects.length],
    [projects.length, projectCommands.length],
    [projects.length + projectCommands.length, viewCommands.length],
  ] as const;
  const active = Math.min(index, Math.max(0, total - 1));

  // An empty query starts on the first command; typing starts on the best match.
  useEffect(() => {
    if (!open) return;
    setIndex(projects.length > 0 && query === "" && inProject ? projects.length : 0);
  }, [open, query, projects.length, inProject]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-palette-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (at: number) => {
    setOpen(false);
    if (at < projects.length) {
      const project = projects[at];
      if (project) void useStudioStore.getState().openProject(project.id);
      return;
    }
    // Close first, so the command's own dialog opens over the studio, not over the palette.
    const command = ordered[at - projects.length];
    if (command) window.setTimeout(command.run, 0);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setIndex(stepIndex(active, event.key === "ArrowDown" ? 1 : -1, total));
    } else if (
      (event.key === "ArrowRight" || event.key === "ArrowLeft") &&
      active < projects.length
    ) {
      event.preventDefault();
      setIndex(stepIndex(active, event.key === "ArrowRight" ? 1 : -1, projects.length));
    } else if (event.key === "Tab") {
      event.preventDefault();
      setIndex(nextGroupStart(active, groups, event.shiftKey));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (total > 0) run(active);
    }
  };

  const row = (command: Command, at: number) => {
    const Glyph = command.icon;
    return (
      <div
        key={command.id}
        id={optionId(at)}
        role="option"
        aria-selected={at === active}
        data-palette-index={at}
        onPointerMove={() => setIndex(at)}
        onClick={() => run(at)}
        className={cn(
          "flex h-[34px] cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-[14px]",
          at === active && "bg-dialog-selected",
        )}
      >
        <Glyph className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="shrink-0">{command.label}</span>
        {command.hint && (
          <span className="min-w-0 truncate text-[13px] text-dim">{command.hint}</span>
        )}
        <span className="min-w-0 flex-1" />
        {command.chord && <Keys chord={command.chord} />}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        data-command-palette=""
        className="top-[11vh] flex max-h-[78vh] w-[min(640px,calc(100vw-2rem))] max-w-none translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        onKeyDown={onKeyDown}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-4">
          <MagnifyingGlassIcon
            className="size-[18px] shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects and commands"
            aria-label="Search projects and commands"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={total > 0 ? optionId(active) : undefined}
            className="h-10 flex-1 px-0 text-[15px] hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0"
          />
          <span className="font-mono text-[12px] text-dim">esc</span>
        </div>
        <div
          ref={listRef}
          id="palette-list"
          role="listbox"
          aria-label="Projects and commands"
          className="min-h-0 flex-1 overflow-y-auto p-1.5"
        >
          {projects.length > 0 && (
            <section role="group" aria-label="Projects" className="pb-1.5">
              <GroupLabel>Projects</GroupLabel>
              <div className="grid grid-cols-5 gap-1.5 px-1">
                {projects.map((project, at) => (
                  <div
                    key={project.id}
                    id={optionId(at)}
                    role="option"
                    aria-selected={at === active}
                    aria-label={project.name}
                    data-palette-index={at}
                    onPointerMove={() => setIndex(at)}
                    onClick={() => run(at)}
                    className={cn(
                      "min-w-0 cursor-pointer rounded-[10px] p-1",
                      at === active && "bg-dialog-selected",
                    )}
                  >
                    <div className="relative">
                      <ProjectPoster
                        composition={project}
                        className="aspect-video w-full rounded-md"
                      />
                      {project.lease && (
                        <span className="absolute bottom-1 left-1 grid size-[18px] place-items-center rounded-full bg-dialog-surface-2 text-[10px] font-medium text-foreground ring-2 ring-popover">
                          {project.lease.holder.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 flex items-baseline gap-1 px-0.5 text-[13px]">
                      <span
                        className={cn(
                          "min-w-0 truncate",
                          project.id === compositionId && !homeOpen
                            ? "text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {project.name}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
          {projectCommands.length > 0 && (
            <section
              role="group"
              aria-label={composition?.name ?? "Project"}
              className="border-t border-border py-1.5"
            >
              <GroupLabel>{composition?.name ?? "Project"}</GroupLabel>
              {projectCommands.map((command, at) => row(command, projects.length + at))}
            </section>
          )}
          {viewCommands.length > 0 && (
            <section role="group" aria-label="View" className="border-t border-border pt-1.5">
              <GroupLabel>View</GroupLabel>
              {viewCommands.map((command, at) =>
                row(command, projects.length + projectCommands.length + at),
              )}
            </section>
          )}
          {total === 0 && (
            <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
              Nothing matches “{query.trim()}”.
            </p>
          )}
        </div>
        <footer className="flex h-10 shrink-0 items-center gap-4 border-t border-border px-4 text-[12px] text-dim">
          <FootKey keys={["↑", "↓"]} label="move" />
          <FootKey keys={["↵"]} label="run" />
          <FootKey keys={["Tab"]} label="next group" />
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-2.5 pt-1.5 pb-1.5 text-[12px] font-medium text-dim">{children}</p>;
}

function Keys({ chord }: { chord: Chord }) {
  return (
    <span className="flex shrink-0 gap-1" aria-label={chordKeys(chord, mac).join(" ")}>
      {chordKeys(chord, mac).map((key) => (
        <kbd
          key={key}
          className="min-w-[22px] rounded-[5px] bg-dialog-well px-[5px] py-[3px] text-center font-mono text-[12px] leading-none text-dim"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

function FootKey({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {keys.map((key) => (
        <kbd
          key={key}
          className="rounded-[5px] bg-dialog-selected px-[5px] py-[3px] font-mono text-[11px] leading-none text-muted-foreground"
        >
          {key}
        </kbd>
      ))}
      {label}
    </span>
  );
}
