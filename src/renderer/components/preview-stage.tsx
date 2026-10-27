/* oxlint-disable react/iframe-missing-sandbox -- The Electron parent and loopback iframe are different origins; authored ES-module runtime assets require allow-scripts plus allow-same-origin, and the sandbox prevents that origin from escaping into the parent. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowPathIcon,
  CodeBracketIcon,
  DocumentDuplicateIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import * as v from "valibot";
import { contentDuration } from "@shared/duration.ts";
import { isBlockKind } from "@shared/media.ts";
import type { Composition, Control, MediaDocument, MediaTrack } from "@shared/schemas.ts";
import { StageHead, StagePlayer } from "@/components/stage-head.tsx";
import { Tip } from "@/components/stage-tip.tsx";
import { Button } from "@/components/ui/button.tsx";
import { compositionContentUrl, loopbackOrigin } from "@/lib/loopback.ts";
import {
  enqueueUntilOrigin,
  iframeTargetOrigin,
  takeQueuedMessages,
} from "@/lib/preview-bridge.ts";
import { isPreviewFrameMessage } from "@/lib/preview-messaging.ts";
import { cn } from "@/lib/utils.ts";
import { useStudioStore } from "@/stores/studio.ts";

type PreviewStageProps = {
  composition: Composition;
  media: MediaDocument;
  controls: Control[];
  onTime: (seconds: number) => void;
  onSettings?: (() => void) | undefined;
  /** Opens a block's code, for the runtime error card. */
  onOpenCode?: ((trackId: string) => void) | undefined;
  /** Reloads the preview page, for the runtime error card. */
  onReload?: (() => void) | undefined;
};

/** Room around the picture: 4px over it, 32px beside it, 12px under it. */
const PICTURE_PAD = { top: 4, x: 32, bottom: 12 };
const PICTURE_PAD_COMPACT = { top: 0, x: 24, bottom: 12 };
/** The compact panel sheet is 296px wide, 8px in from the stage edge. */
const SHEET_ROOM = 296 + 8 + 12;

type ControlValue = string | number | boolean;
type PreviewMessage =
  | { type: "play" }
  | { type: "pause" }
  | { type: "seek"; timeSeconds: number; frame: number }
  | { type: "loop"; enabled: boolean }
  | { type: "documents"; tracks: MediaTrack[]; controls: Control[] }
  | { type: "controls"; values: Record<string, ControlValue> };

const previewInboundMessageSchema = v.union([
  v.object({
    source: v.literal("automedia"),
    type: v.literal("ready"),
    scriptErrors: v.optional(v.array(v.string())),
  }),
  v.object({
    source: v.literal("automedia"),
    type: v.literal("time"),
    timeSeconds: v.number(),
  }),
  v.object({
    source: v.literal("automedia"),
    type: v.literal("runtime-error"),
    message: v.string(),
  }),
]);

export function PreviewStage({
  composition,
  media,
  controls,
  onTime,
  onSettings,
  onOpenCode,
  onReload,
}: PreviewStageProps) {
  const playheadSeconds = useStudioStore((state) => state.playheadSeconds);
  const previewMuted = useStudioStore((state) => state.previewMuted);
  const stageZoom = useStudioStore((state) => state.stageZoom);
  const compact = useStudioStore((state) => state.compactLayout);
  const sheetOpen = useStudioStore((state) => state.panelSheetOpen);
  const selectedTrackId = useStudioStore((state) => state.selectedTrackId);
  const durationSeconds = contentDuration(media.tracks);
  const playing = useStudioStore((state) => state.playing);
  const loopPlayback = useStudioStore((state) => state.loopPlayback);
  const seekNonce = useStudioStore((state) => state.seekNonce);
  const stageRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(1);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const expectedSrc = compositionContentUrl(composition.id);
  const queueRef = useRef<PreviewMessage[]>([]);
  const loopbackReadyRef = useRef(false);
  const playheadRef = useRef(playheadSeconds);
  const playingRef = useRef(playing);
  const loopRef = useRef(loopPlayback);
  const frameCount = Math.max(1, Math.round(composition.durationSeconds * composition.fps));
  const frame = Math.min(
    frameCount - 1,
    Math.max(0, Math.round(playheadSeconds * composition.fps)),
  );
  const frameRef = useRef(frame);
  useEffect(() => {
    playheadRef.current = playheadSeconds;
    frameRef.current = frame;
    playingRef.current = playing;
    loopRef.current = loopPlayback;
  }, [frame, loopPlayback, playheadSeconds, playing]);
  useLayoutEffect(() => {
    loopbackReadyRef.current = false;
    queueRef.current = [];
    setRuntimeError(null);
  }, [expectedSrc]);

  const recipientOrigin = useCallback(() => {
    const iframe = iframeRef.current;
    return iframeTargetOrigin(iframe?.src ?? "", iframe?.contentWindow ?? null, loopbackOrigin);
  }, []);

  const send = useCallback(
    (message: PreviewMessage) => {
      const iframe = iframeRef.current;
      const origin = recipientOrigin();
      const outgoing = enqueueUntilOrigin(origin, queueRef.current, message);
      if (!outgoing || !origin || !iframe?.contentWindow) return;
      iframe.contentWindow.postMessage({ source: "automedia", ...outgoing }, origin);
    },
    [recipientOrigin],
  );
  const sendDocuments = useCallback(() => {
    const tracks = previewMuted
      ? media.tracks.map((track) => ({ ...track, mute: true }))
      : media.tracks;
    send({ type: "documents", tracks, controls });
  }, [controls, media.tracks, previewMuted, send]);
  const sendControls = useCallback(() => {
    const values: Record<string, ControlValue> = {};
    for (const control of controls) values[control.id] = control.value;
    send({ type: "controls", values });
  }, [controls, send]);
  const sendInitialState = useCallback(() => {
    sendDocuments();
    send({ type: "loop", enabled: loopRef.current });
    send({ type: "seek", timeSeconds: playheadRef.current, frame: frameRef.current });
    sendControls();
    send({ type: playingRef.current ? "play" : "pause" });
  }, [send, sendControls, sendDocuments]);
  const flushWhenLoopbackLoaded = useCallback(() => {
    const iframe = iframeRef.current;
    const origin = recipientOrigin();
    if (!origin || !iframe?.contentWindow) {
      loopbackReadyRef.current = false;
      return;
    }
    loopbackReadyRef.current = true;
    const queued = takeQueuedMessages(queueRef.current);
    sendInitialState();
    for (const message of queued) {
      iframe.contentWindow.postMessage({ source: "automedia", ...message }, origin);
    }
  }, [recipientOrigin, sendInitialState]);

  useEffect(() => {
    if (loopbackReadyRef.current) {
      sendDocuments();
      sendControls();
    }
  }, [controls, media.tracks, previewMuted, sendControls, sendDocuments]);

  useLayoutEffect(() => {
    const handler = (event: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe || !isPreviewFrameMessage(event, loopbackOrigin, iframe.contentWindow)) return;
      const parsed = v.safeParse(previewInboundMessageSchema, event.data);
      if (!parsed.success) return;
      const message = parsed.output;
      if (message.type === "ready") {
        const scriptErrors = message.scriptErrors ?? [];
        setRuntimeError(scriptErrors[0] ?? null);
        flushWhenLoopbackLoaded();
      }
      if (message.type === "time") onTime(message.timeSeconds);
      if (message.type === "runtime-error") setRuntimeError(message.message);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [flushWhenLoopbackLoaded, onTime]);

  useEffect(() => {
    if (!iframeRef.current) return;
    send({ type: playing ? "play" : "pause" });
  }, [playing, send]);
  useEffect(() => {
    send({ type: "loop", enabled: loopPlayback });
  }, [loopPlayback, send]);
  useEffect(() => {
    send({ type: "seek", timeSeconds: playheadRef.current, frame: frameRef.current });
    if (playingRef.current) send({ type: "play" });
  }, [seekNonce, send]);
  const pad = compact ? PICTURE_PAD_COMPACT : PICTURE_PAD;
  const padRight = compact && sheetOpen ? SHEET_ROOM : pad.x;
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const resize = () => {
      const width = Math.max(1, element.clientWidth - pad.x - padRight);
      const height = Math.max(1, element.clientHeight - pad.top - pad.bottom);
      setScale(Math.min(width / composition.width, height / composition.height));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [composition.height, composition.width, pad.bottom, pad.top, pad.x, padRight]);

  const pictureScale = stageZoom === "fit" ? scale : stageZoom;
  const codeTrack =
    media.tracks.find((track) => track.id === selectedTrackId && isBlockKind(track.kind)) ??
    media.tracks.find((track) => isBlockKind(track.kind));

  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-canvas-preview"
      aria-label="Preview stage"
      data-canvas="preview"
    >
      <StageHead
        composition={composition}
        durationSeconds={durationSeconds}
        compact={compact}
        onSettings={onSettings}
      />
      <div
        ref={stageRef}
        className="relative flex min-h-0 flex-1 overflow-auto bg-canvas-preview"
        style={{
          paddingTop: pad.top,
          paddingBottom: pad.bottom,
          paddingLeft: pad.x,
          paddingRight: padRight,
        }}
      >
        <div
          className="stage-picture relative m-auto shrink-0"
          style={{
            width: composition.width * pictureScale,
            height: composition.height * pictureScale,
          }}
        >
          <div
            className={cn(
              "absolute top-0 left-0 overflow-hidden",
              composition.background === "transparent" && "chequer",
            )}
            style={{
              width: composition.width,
              height: composition.height,
              transform: `scale(${pictureScale})`,
              transformOrigin: "0 0",
            }}
          >
            <iframe
              ref={iframeRef}
              key={expectedSrc}
              title={`${composition.name} preview`}
              src={expectedSrc}
              width={composition.width}
              height={composition.height}
              className="block"
              // Chromium paints an opaque backdrop behind a frame whose color scheme differs
              // from its document. Compositions default to light, so match it to keep alpha.
              style={{
                width: composition.width,
                height: composition.height,
                colorScheme: "normal",
              }}
              sandbox="allow-scripts allow-same-origin"
              onLoad={(event) => {
                const iframe = event.currentTarget;
                if (iframe !== iframeRef.current) return;
                const origin = iframeTargetOrigin(iframe.src, iframe.contentWindow, loopbackOrigin);
                if (!origin) {
                  loopbackReadyRef.current = false;
                  return;
                }
                flushWhenLoopbackLoaded();
              }}
            />
          </div>
          {runtimeError && (
            <div className="pointer-events-none absolute inset-0 bg-black/62" aria-hidden="true" />
          )}
        </div>
        {runtimeError && (
          <RuntimeErrorCard
            message={runtimeError}
            onOpenCode={codeTrack && onOpenCode ? () => onOpenCode(codeTrack.id) : undefined}
            onReload={onReload}
          />
        )}
      </div>
      <StagePlayer composition={composition} durationSeconds={durationSeconds} compact={compact} />
    </section>
  );
}

/**
 * A script threw. The card floats over the dimmed picture it broke, says what
 * still works, and offers the ways out: the code, a copy of the error, a reload.
 */
function RuntimeErrorCard({
  message,
  onOpenCode,
  onReload,
}: {
  message: string;
  onOpenCode?: (() => void) | undefined;
  onReload?: (() => void) | undefined;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
      <div
        role="alert"
        className="pointer-events-auto w-full max-w-[480px] rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-float"
      >
        <div className="flex items-center gap-2">
          <ExclamationTriangleIcon className="size-[18px] shrink-0 text-destructive" />
          <h3 className="text-[15px] font-medium tracking-[-0.015em]">
            A script stopped rendering
          </h3>
        </div>
        <p className="mt-1.5 text-[13px] leading-normal text-muted-foreground">
          Nothing new draws until it is fixed. The timeline and playback still work.
        </p>
        <pre className="mt-3.5 max-h-32 overflow-auto rounded-[10px] bg-raised px-3.5 py-3 font-mono dark:bg-canvas-code text-[13px] leading-[1.6] whitespace-pre-wrap text-foreground">
          {message}
        </pre>
        <div className="mt-4 flex items-center gap-2">
          {onOpenCode && (
            <Button size="sm" className="gap-1.5 px-3 text-[13px]" onClick={onOpenCode}>
              <CodeBracketIcon className="size-4" />
              Open script.js
            </Button>
          )}
          <Tip label={copied ? "Copied" : "Copy error"}>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label="Copy error"
              onClick={() => {
                void navigator.clipboard.writeText(message).then(() => setCopied(true));
              }}
            >
              <DocumentDuplicateIcon className="size-4" />
            </Button>
          </Tip>
          <span className="flex-1" />
          {onReload && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 px-3 text-[13px] text-muted-foreground"
              onClick={onReload}
            >
              <ArrowPathIcon className="size-4" />
              Reload
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
