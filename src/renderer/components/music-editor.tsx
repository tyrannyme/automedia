import { useEffect, useState } from "react";
import { musicAsset, useStudioStore } from "@/stores/studio.ts";
import { musicPatternPath } from "@shared/music-paths.ts";
import {
  CodePane,
  useOtherWriter,
  type Conflict,
  type SaveStatus,
} from "@/components/code-panes.tsx";

export function MusicEditor({
  onReload,
  onStatus,
}: {
  onReload: () => void;
  onStatus?: (status: SaveStatus) => void;
}) {
  const id = useStudioStore((state) => state.compositionId);
  const media = useStudioStore((state) => state.media);
  const selectedTrackId = useStudioStore((state) => state.selectedTrackId);
  const asset = musicAsset(media, selectedTrackId);
  const path = asset ? musicPatternPath(asset) : null;
  const pattern = useStudioStore((state) => state.pattern);
  const saved = useStudioStore((state) => state.savedPattern);
  const etag = useStudioStore((state) => state.patternEtag);
  const setPattern = useStudioStore((state) => state.setPattern);
  const markSaved = useStudioStore((state) => state.markPatternSaved);
  const writer = useOtherWriter();
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [savedOnce, setSavedOnce] = useState(false);

  useEffect(() => {
    setConflict(null);
    setSavedOnce(false);
  }, [path]);

  useEffect(() => {
    onStatus?.({
      saving: pattern !== saved && !conflict,
      conflict: conflict ? "pattern.js" : null,
      savedOnce,
    });
  }, [conflict, onStatus, pattern, saved, savedOnce]);

  useEffect(() => {
    // A conflict waits for Keep mine or Take theirs.
    if (!id || !path || pattern === saved || conflict) return;
    const timer = window.setTimeout(() => {
      void window.studio.files
        .write({ compositionId: id, path, encoding: "utf8", content: pattern, expectedEtag: etag })
        .then((result) => {
          markSaved(result.content, result.etag);
          setSavedOnce(true);
          onReload();
        })
        .catch(async () => {
          // The error's code does not survive the preload bridge, so ask the disk.
          const disk = await window.studio.files.read(id, path);
          if (disk.etag === etag) return;
          setConflict({ theirs: disk.content });
        });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [conflict, etag, id, markSaved, onReload, path, pattern, saved]);

  const takeTheirs = async () => {
    if (!id || !path) return;
    await navigator.clipboard.writeText(pattern).catch(() => undefined);
    const result = await window.studio.files.read(id, path);
    markSaved(result.content, result.etag);
    setConflict(null);
    onReload();
  };
  const keepMine = async () => {
    if (!id || !path) return;
    const latest = await window.studio.files.read(id, path);
    const result = await window.studio.files.write({
      compositionId: id,
      path,
      encoding: "utf8",
      content: pattern,
      expectedEtag: latest.etag,
    });
    markSaved(result.content, result.etag);
    setConflict(null);
    setSavedOnce(true);
    onReload();
  };

  if (!path) {
    return (
      <p className="px-6 py-8 text-sm text-muted-foreground">
        Add music on the timeline to edit its Strudel pattern.
      </p>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-label="Music editor" data-canvas="music">
      <CodePane
        path={path}
        value={pattern}
        onChange={setPattern}
        conflict={conflict}
        writer={writer}
        onKeepMine={() => void keepMine()}
        onTakeTheirs={() => void takeTheirs()}
        autoFocus
        className="flex-1"
      />
    </div>
  );
}
