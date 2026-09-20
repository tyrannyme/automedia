import { useEffect, useState } from "react";
import type { CodeFile } from "@/stores/studio.ts";
import { blockDir, useStudioStore } from "@/stores/studio.ts";
import { blockPaths, type BlockPaths } from "@/lib/block-paths.ts";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";

const codeFiles: CodeFile[] = ["html", "css", "js"];

function pathsFor(dir: string | null): BlockPaths | null {
  if (!dir) return null;
  return blockPaths(dir);
}

type CodedError = Error & { code?: string };

function isConflict(error: CodedError): boolean {
  return error.code === "revision_conflict";
}

export function CodePanes({ onReload }: { onReload: () => void }) {
  const id = useStudioStore((state) => state.compositionId);
  const media = useStudioStore((state) => state.media);
  const selectedTrackId = useStudioStore((state) => state.selectedTrackId);
  const dir = blockDir(media, selectedTrackId);
  const paths = pathsFor(dir);
  const html = useStudioStore((state) => state.html);
  const css = useStudioStore((state) => state.css);
  const js = useStudioStore((state) => state.js);
  const saved = useStudioStore((state) => state.savedCode);
  const htmlEtag = useStudioStore((state) => state.htmlEtag);
  const cssEtag = useStudioStore((state) => state.cssEtag);
  const jsEtag = useStudioStore((state) => state.jsEtag);
  const setCode = useStudioStore((state) => state.setCode);
  const markSaved = useStudioStore((state) => state.markCodeSaved);
  const [conflict, setConflict] = useState<CodeFile | null>(null);
  useEffect(() => {
    if (!id || !paths) return;
    const values = { html, css, js };
    const etags = { html: htmlEtag, css: cssEtag, js: jsEtag };
    const timers = codeFiles.map((file) => {
      if (values[file] === saved[file]) return undefined;
      return window.setTimeout(() => {
        void window.studio.files
          .write({
            compositionId: id,
            path: paths[file],
            encoding: "utf8",
            content: values[file],
            expectedEtag: etags[file],
          })
          .then((result) => {
            markSaved(file, result.content, result.etag);
            setConflict(null);
            onReload();
          })
          .catch((error: Error) => {
            // SAFETY: window.studio errors are IpcClientError values carrying a protocol code.
            if (isConflict(error as CodedError)) {
              setConflict(file);
            }
          });
      }, 400);
    });
    return () => {
      for (const timer of timers) if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [css, cssEtag, dir, html, htmlEtag, id, js, jsEtag, markSaved, onReload, paths, saved]);

  const reload = async (file: CodeFile) => {
    if (!id || !paths) return;
    const result = await window.studio.files.read(id, paths[file]);
    markSaved(file, result.content, result.etag);
    setConflict(null);
  };
  const overwrite = async (file: CodeFile) => {
    if (!id || !paths) return;
    const latest = await window.studio.files.read(id, paths[file]);
    const value = file === "html" ? html : file === "css" ? css : js;
    const result = await window.studio.files.write({
      compositionId: id,
      path: paths[file],
      encoding: "utf8",
      content: value,
      expectedEtag: latest.etag,
    });
    markSaved(file, result.content, result.etag);
    setConflict(null);
    onReload();
  };

  return (
    <section
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas-code"
      aria-label="Code editor"
      data-canvas="code"
    >
      {conflict && (
        <Alert
          variant="destructive"
          className="flex shrink-0 items-center justify-between px-3 py-2"
        >
          <AlertDescription>This file changed on disk. Reload or overwrite.</AlertDescription>
          <span className="flex gap-1">
            <Button type="button" variant="link" size="xs" onClick={() => void reload(conflict)}>
              Reload
            </Button>
            <Button type="button" variant="link" size="xs" onClick={() => void overwrite(conflict)}>
              Overwrite
            </Button>
          </span>
        </Alert>
      )}
      {!paths && (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          Add a block on the timeline to edit HTML, CSS, and JS.
        </p>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-1 divide-border min-[1120px]:grid-cols-3 min-[1120px]:divide-x">
        {paths &&
          codeFiles.map((file) => (
            <div key={file} className="flex min-h-32 min-w-0 flex-1 flex-col gap-1 px-4 py-3">
              <Label className="font-mono text-xs text-muted-foreground">{paths[file]}</Label>
              <Textarea
                value={file === "html" ? html : file === "css" ? css : js}
                onChange={(event) => setCode(file, event.target.value)}
                spellCheck={false}
                className="min-h-0 flex-1 resize-none rounded-none p-0 font-mono text-sm leading-[1.45] hover:bg-transparent focus-visible:bg-transparent"
              />
            </div>
          ))}
      </div>
    </section>
  );
}
