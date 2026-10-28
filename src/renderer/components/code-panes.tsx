import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowsRightLeftIcon, ChevronUpDownIcon } from "@heroicons/react/24/outline";
import type { CodeFile } from "@/stores/studio.ts";
import { blockDir, useStudioStore } from "@/stores/studio.ts";
import { blockPaths, type BlockPaths } from "@/lib/block-paths.ts";
import { diffLines, splitLines } from "@/lib/line-diff.ts";
import { cn } from "@/lib/utils.ts";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";

const codeFiles: CodeFile[] = ["html", "css", "js"];

/** DM Mono 13 on a 21px line, so the gutter and the caret line stay on the text. */
const lineHeight = 21;
const padTop = 4;

/** Who else writes to this project: the claim holder, or a plain fallback. */
export function useOtherWriter(): string {
  return useStudioStore((state) => {
    const holder = state.compositions.find((item) => item.id === state.compositionId)?.lease
      ?.holder;
    return holder?.trim() || "Someone else";
  });
}

export type SaveStatus = { saving: boolean; conflict: string | null; savedOnce: boolean };

/** A file's conflict: what is on disk now, which the studio's text was not based on. */
export type Conflict = { theirs: string };

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function lineCount(text: string): string {
  const count = splitLines(text).length;
  return count === 1 ? "1 line" : `${count} lines`;
}

type Caret = { line: number; col: number };

function caretOf(text: string, offset: number): Caret {
  const before = text.slice(0, offset);
  const line = before.split("\n").length;
  const col = offset - before.lastIndexOf("\n");
  return { line, col };
}

/** A textarea with a line gutter and a caret-line highlight; the pane scrolls, not the field. */
export function CodeEditor({
  label,
  value,
  onChange,
  onCaret,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCaret?: (caret: { line: number; col: number } | null) => void;
  autoFocus?: boolean | undefined;
}) {
  const [caretLine, setCaretLine] = useState<number | null>(null);
  const lines = useMemo(() => splitLines(value).length, [value]);
  const numbers = useMemo(
    () => Array.from({ length: lines }, (_, index) => index + 1).join("\n"),
    [lines],
  );
  const track = (event: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = event.currentTarget;
    const caret = caretOf(target.value, target.selectionStart);
    setCaretLine(caret.line);
    onCaret?.(caret);
  };
  return (
    <div className="relative min-h-0 flex-1 overflow-auto">
      <div className="grid min-h-full min-w-max grid-cols-[auto_minmax(0,1fr)]">
        <pre
          aria-hidden="true"
          className="sticky left-0 z-[1] bg-inherit pr-3 pl-4 text-right font-mono text-[13px] text-faint select-none"
          style={{ lineHeight: `${lineHeight}px`, paddingTop: padTop }}
        >
          {numbers}
        </pre>
        <div className="relative">
          {caretLine !== null && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bg-foreground/[0.045]"
              style={{ top: padTop + (caretLine - 1) * lineHeight, height: lineHeight }}
            />
          )}
          <Textarea
            aria-label={label}
            value={value}
            wrap="off"
            spellCheck={false}
            autoFocus={autoFocus}
            onChange={(event) => {
              onChange(event.target.value);
              track(event);
            }}
            onSelect={track}
            onFocus={track}
            onBlur={() => {
              setCaretLine(null);
              onCaret?.(null);
            }}
            className="relative block h-full min-h-full w-full resize-none overflow-hidden rounded-none py-0 pr-6 pl-0 font-mono text-[13px] whitespace-pre caret-foreground hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 md:text-[13px]"
            style={{ lineHeight: `${lineHeight}px`, paddingTop: padTop, paddingBottom: 24 }}
          />
        </div>
      </div>
    </div>
  );
}

/** A file pane: its caption, then the editor, the conflict banner, or the diff. */
export function CodePane({
  path,
  value,
  onChange,
  conflict,
  writer,
  onKeepMine,
  onTakeTheirs,
  autoFocus,
  className,
}: {
  path: string;
  value: string;
  onChange: (value: string) => void;
  conflict: Conflict | null;
  writer: string;
  onKeepMine: () => void;
  onTakeTheirs: () => void;
  autoFocus?: boolean | undefined;
  className?: string | undefined;
}) {
  const [caret, setCaret] = useState<{ line: number; col: number } | null>(null);
  const [comparing, setComparing] = useState(false);
  useEffect(() => {
    if (!conflict) setComparing(false);
  }, [conflict]);
  const name = fileName(path);
  return (
    <section
      className={cn("group flex min-h-0 min-w-0 flex-col bg-canvas-code", className)}
      aria-label={name}
      data-code-file={name}
      data-conflict={conflict ? "" : undefined}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 pr-4 pl-4" title={path}>
        <span className="text-[13px] font-medium text-muted-foreground transition-colors group-focus-within:text-foreground">
          {name}
        </span>
        {conflict && <span className="size-1.5 rounded-full bg-foreground" aria-label="Conflict" />}
        <span className="font-mono text-[12px] text-dim">{lineCount(value)}</span>
        <span className="min-w-0 flex-1" />
        {caret && (
          <span className="font-mono text-[12px] text-dim">
            Ln {caret.line}, Col {caret.col}
          </span>
        )}
      </header>
      {conflict && (
        <ConflictBanner
          file={name}
          writer={writer}
          comparing={comparing}
          onCompare={() => setComparing((shown) => !shown)}
          onKeepMine={onKeepMine}
          onTakeTheirs={onTakeTheirs}
        />
      )}
      {conflict && comparing ? (
        <ConflictDiff mine={value} theirs={conflict.theirs} writer={writer} />
      ) : (
        <CodeEditor
          label={name}
          value={value}
          onChange={onChange}
          onCaret={setCaret}
          autoFocus={autoFocus}
        />
      )}
    </section>
  );
}

export function ConflictBanner({
  file,
  writer,
  comparing,
  onCompare,
  onKeepMine,
  onTakeTheirs,
}: {
  file: string;
  writer: string;
  comparing: boolean;
  onCompare: () => void;
  onKeepMine: () => void;
  onTakeTheirs: () => void;
}) {
  const initial = writer.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      role="status"
      className="mx-4 mb-2 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-raised py-2.5 pr-2.5 pl-3"
    >
      <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-dialog-surface-2 text-[11px] font-medium">
        {initial}
      </span>
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-[14px] leading-snug">
          {writer} saved {file} while you were typing
        </p>
        <p className="text-[13px] leading-snug text-muted-foreground">
          Your version is safe here. Autosave waits until you choose.
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onCompare}>
          {comparing ? null : <ArrowsRightLeftIcon />}
          {comparing ? "Hide difference" : "Compare"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onTakeTheirs}>
          Take {writer === "Someone else" ? "theirs" : `${writer}'s`}
        </Button>
        <Button size="sm" onClick={onKeepMine}>
          Keep mine
        </Button>
      </div>
    </div>
  );
}

/** Yours above, theirs below, unchanged runs folded. Grey only: the art owns colour. */
export function ConflictDiff({
  mine,
  theirs,
  writer,
}: {
  mine: string;
  theirs: string;
  writer: string;
}) {
  const segments = useMemo(() => diffLines(mine, theirs), [mine, theirs]);
  const theirsLabel = writer === "Someone else" ? "Theirs" : `${writer}'s`;
  return (
    <div
      className="min-h-0 flex-1 overflow-auto pb-6 font-mono text-[12px] leading-5"
      aria-label="Difference"
    >
      {segments.map((segment, index) => {
        if (segment.kind === "same") {
          const end = segment.start + segment.count - 1;
          return (
            <div
              key={index}
              className="flex h-7 items-center gap-2.5 border-y border-border/70 bg-dialog-well/40 px-4 text-dim not-first:-mt-px"
            >
              <ChevronUpDownIcon className="size-3.5 shrink-0" aria-hidden="true" />
              {segment.count === 1 ? `line ${segment.start}` : `lines ${segment.start}–${end}`}{" "}
              unchanged
            </div>
          );
        }
        return (
          <div key={index} className="py-1">
            <DiffSide label="Yours" state="not saved" side={segment.mine} strong />
            <DiffSide label={theirsLabel} state="on disk" side={segment.theirs} />
          </div>
        );
      })}
    </div>
  );
}

function DiffSide({
  label,
  state,
  side,
  strong = false,
}: {
  label: string;
  state: string;
  side: { start: number; lines: string[] };
  strong?: boolean;
}) {
  return (
    <div>
      <p className="flex h-7 items-center gap-2 px-4 font-sans text-[13px]">
        <span className="font-medium">{label}</span>
        <span className="text-dim">{side.lines.length === 0 ? "no lines here" : state}</span>
      </p>
      {side.lines.map((line, index) => (
        <div key={index} className="grid grid-cols-[48px_minmax(0,1fr)] bg-foreground/[0.025]">
          <span className="pr-3 text-right text-faint select-none">{side.start + index}</span>
          <span
            className={cn(
              "border-l-2 pl-3 whitespace-pre",
              strong
                ? "border-foreground text-foreground"
                : "border-foreground/30 text-muted-foreground",
            )}
          >
            {line || " "}
          </span>
        </div>
      ))}
    </div>
  );
}

function pathsFor(dir: string | null): BlockPaths | null {
  if (!dir) return null;
  return blockPaths(dir);
}

export function CodePanes({
  onReload,
  onStatus,
}: {
  onReload: () => void;
  onStatus?: (status: SaveStatus) => void;
}) {
  const id = useStudioStore((state) => state.compositionId);
  const media = useStudioStore((state) => state.media);
  const selectedTrackId = useStudioStore((state) => state.selectedTrackId);
  const dir = blockDir(media, selectedTrackId);
  const paths = useMemo(() => pathsFor(dir), [dir]);
  const html = useStudioStore((state) => state.html);
  const css = useStudioStore((state) => state.css);
  const js = useStudioStore((state) => state.js);
  const saved = useStudioStore((state) => state.savedCode);
  const htmlEtag = useStudioStore((state) => state.htmlEtag);
  const cssEtag = useStudioStore((state) => state.cssEtag);
  const jsEtag = useStudioStore((state) => state.jsEtag);
  const setCode = useStudioStore((state) => state.setCode);
  const markSaved = useStudioStore((state) => state.markCodeSaved);
  const writer = useOtherWriter();
  const [conflicts, setConflicts] = useState<Partial<Record<CodeFile, Conflict>>>({});
  const [savedOnce, setSavedOnce] = useState(false);
  const conflictsRef = useRef(conflicts);
  conflictsRef.current = conflicts;
  const values = { html, css, js };
  const dirty = codeFiles.some((file) => values[file] !== saved[file]);
  const conflictFile = codeFiles.find((file) => conflicts[file]);

  useEffect(() => {
    setConflicts({});
    setSavedOnce(false);
  }, [dir]);

  useEffect(() => {
    onStatus?.({
      saving: dirty && !conflictFile,
      conflict: conflictFile && paths ? fileName(paths[conflictFile]) : null,
      savedOnce,
    });
  }, [conflictFile, dirty, onStatus, paths, savedOnce]);

  useEffect(() => {
    if (!id || !paths) return;
    const current = { html, css, js };
    const etags = { html: htmlEtag, css: cssEtag, js: jsEtag };
    const timers = codeFiles.map((file) => {
      // A file in conflict waits for Keep mine or Take theirs.
      if (current[file] === saved[file] || conflictsRef.current[file]) return undefined;
      return window.setTimeout(() => {
        void window.studio.files
          .write({
            compositionId: id,
            path: paths[file],
            encoding: "utf8",
            content: current[file],
            expectedEtag: etags[file],
          })
          .then((result) => {
            markSaved(file, result.content, result.etag);
            setSavedOnce(true);
            onReload();
          })
          .catch(async () => {
            // The error's code does not survive the preload bridge, so ask the disk:
            // a new etag there means another writer got in first.
            const disk = await window.studio.files.read(id, paths[file]);
            if (disk.etag === etags[file]) return;
            setConflicts((list) => ({ ...list, [file]: { theirs: disk.content } }));
          });
      }, 400);
    });
    return () => {
      for (const timer of timers) if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [css, cssEtag, html, htmlEtag, id, js, jsEtag, markSaved, onReload, paths, saved, conflicts]);

  const resolve = (file: CodeFile) =>
    setConflicts((list) => {
      const next = { ...list };
      delete next[file];
      return next;
    });
  const takeTheirs = async (file: CodeFile) => {
    if (!id || !paths) return;
    // Your text goes to the clipboard first, so nothing typed is gone for good.
    await navigator.clipboard.writeText(values[file]).catch(() => undefined);
    const result = await window.studio.files.read(id, paths[file]);
    markSaved(file, result.content, result.etag);
    resolve(file);
    onReload();
  };
  const keepMine = async (file: CodeFile) => {
    if (!id || !paths) return;
    const latest = await window.studio.files.read(id, paths[file]);
    const result = await window.studio.files.write({
      compositionId: id,
      path: paths[file],
      encoding: "utf8",
      content: values[file],
      expectedEtag: latest.etag,
    });
    markSaved(file, result.content, result.etag);
    resolve(file);
    setSavedOnce(true);
    onReload();
  };

  if (!paths) {
    return (
      <p className="px-6 py-8 text-sm text-muted-foreground">
        Add a block on the timeline to edit its HTML, CSS, and JS.
      </p>
    );
  }
  const pane = (file: CodeFile, className?: string) => (
    <CodePane
      key={file}
      path={paths[file]}
      value={values[file]}
      onChange={(value) => setCode(file, value)}
      conflict={conflicts[file] ?? null}
      writer={writer}
      onKeepMine={() => void keepMine(file)}
      onTakeTheirs={() => void takeTheirs(file)}
      autoFocus={file === "js"}
      className={className}
    />
  );
  return (
    <div
      className="grid min-h-0 flex-1 grid-cols-[minmax(0,9fr)_minmax(0,16fr)] gap-px bg-border"
      aria-label="Code editor"
      data-canvas="code"
    >
      <div className="grid min-h-0 grid-rows-[minmax(96px,2fr)_minmax(0,5fr)] gap-px">
        {pane("html")}
        {pane("css")}
      </div>
      {pane("js")}
    </div>
  );
}
