import { useEffect, useState } from "react";
import type { Composition } from "@shared/schemas.ts";
import { loopbackOrigin } from "@/lib/loopback.ts";
import { compositionThumbnailSrc } from "@/lib/thumbnails.ts";
import { useStudioStore } from "@/stores/studio.ts";
import { cn } from "@/lib/utils.ts";

export function ProjectPoster({
  composition,
  className,
}: {
  composition: Composition;
  className?: string;
}) {
  const revision = useStudioStore((state) => state.thumbnailRevisions[composition.id] ?? 0);
  const failed = useStudioStore((state) => state.thumbnailFailures[composition.id] === true);
  const [attempt, setAttempt] = useState(0);
  const [shown, setShown] = useState<string | null>(null);
  const [missed, setMissed] = useState(false);
  const src = `${compositionThumbnailSrc(loopbackOrigin, composition.id, revision)}&poll=${attempt}`;
  const ready = shown !== null;
  const state = ready ? "ready" : failed ? "error" : "pending";

  useEffect(() => {
    setAttempt(0);
    setMissed(false);
  }, [revision]);

  useEffect(() => {
    if (!missed || failed) return;
    const timer = window.setTimeout(() => {
      setMissed(false);
      setAttempt((value) => value + 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [failed, missed]);

  return (
    <div
      className={cn("relative shrink-0 overflow-hidden rounded-lg bg-surface", className)}
      aria-hidden="true"
      data-thumbnail-state={state}
      data-composition-id={composition.id}
      data-composition-name={composition.name}
    >
      {shown ? (
        <img src={shown} alt="" className="absolute inset-0 size-full object-cover" />
      ) : null}
      <img
        key={src}
        src={src}
        alt=""
        className="absolute inset-0 size-full object-cover"
        hidden
        onLoad={() => {
          setShown(src);
          setMissed(false);
        }}
        onError={() => {
          setMissed(true);
          setShown((current) => (current === src ? null : current));
        }}
      />
    </div>
  );
}
