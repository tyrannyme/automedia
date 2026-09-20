import { useEffect, useState } from "react";
import { musicAsset, useStudioStore } from "@/stores/studio.ts";
import { musicPatternPath } from "@shared/music-paths.ts";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";

type CodedError = Error & { code?: string };

function isConflict(error: CodedError): boolean {
  return error.code === "revision_conflict";
}

export function MusicEditor({ onReload }: { onReload: () => void }) {
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
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    if (!id || !path || pattern === saved) return;
    const timer = window.setTimeout(() => {
      void window.studio.files
        .write({
          compositionId: id,
          path,
          encoding: "utf8",
          content: pattern,
          expectedEtag: etag,
        })
        .then((result) => {
          markSaved(result.content, result.etag);
          setConflict(false);
          onReload();
        })
        .catch((error: Error) => {
          // SAFETY: window.studio errors are IpcClientError values carrying a protocol code.
          if (isConflict(error as CodedError)) setConflict(true);
        });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [etag, id, markSaved, onReload, path, pattern, saved]);

  const reload = async () => {
    if (!id || !path) return;
    const result = await window.studio.files.read(id, path);
    markSaved(result.content, result.etag);
    setConflict(false);
  };
  const overwrite = async () => {
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
    setConflict(false);
    onReload();
  };

  return (
    <section
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas-code"
      aria-label="Music editor"
      data-canvas="music"
    >
      {conflict && (
        <Alert
          variant="destructive"
          className="flex shrink-0 items-center justify-between px-3 py-2"
        >
          <AlertDescription>This file changed on disk. Reload or overwrite.</AlertDescription>
          <span className="flex gap-1">
            <Button type="button" variant="link" size="xs" onClick={() => void reload()}>
              Reload
            </Button>
            <Button type="button" variant="link" size="xs" onClick={() => void overwrite()}>
              Overwrite
            </Button>
          </span>
        </Alert>
      )}
      {!path && (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          Add music on the timeline to edit a Strudel pattern.
        </p>
      )}
      {path && (
        <div className="flex min-h-0 flex-1 flex-col gap-1 px-4 py-3">
          <Label className="font-mono text-xs text-muted-foreground">{path}</Label>
          <Textarea
            value={pattern}
            onChange={(event) => setPattern(event.target.value)}
            spellCheck={false}
            className="min-h-0 flex-1 resize-none rounded-none p-0 font-mono text-sm leading-[1.45] hover:bg-transparent focus-visible:bg-transparent"
          />
        </div>
      )}
    </section>
  );
}
