/* oxlint-disable react/iframe-missing-sandbox -- The Electron parent and loopback iframe are different origins; authored ES-module runtime assets require allow-scripts plus allow-same-origin, and the sandbox prevents that origin from escaping into the parent. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import * as v from "valibot";
import type { Composition, Control, MediaDocument, MediaTrack } from "@shared/schemas.ts";
import { compositionContentUrl, loopbackOrigin } from "@/lib/loopback.ts";
import {
  enqueueUntilOrigin,
  iframeTargetOrigin,
  takeQueuedMessages,
} from "@/lib/preview-bridge.ts";
import { isPreviewFrameMessage } from "@/lib/preview-messaging.ts";
import { useStudioStore } from "@/stores/studio.ts";

type PreviewStageProps = {
  composition: Composition;
  media: MediaDocument;
  controls: Control[];
  onTime: (seconds: number) => void;
};

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

export function PreviewStage({ composition, media, controls, onTime }: PreviewStageProps) {
  const playheadSeconds = useStudioStore((state) => state.playheadSeconds);
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
    send({ type: "documents", tracks: media.tracks, controls });
  }, [controls, media.tracks, send]);
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
  }, [controls, media.tracks, sendControls, sendDocuments]);

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
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const resize = () => {
      const width = Math.max(1, element.clientWidth - 16);
      const height = Math.max(1, element.clientHeight - 16);
      setScale(Math.min(width / composition.width, height / composition.height));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [composition.height, composition.width]);

  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-canvas-preview"
      aria-label="Preview stage"
      data-canvas="preview"
    >
      <div
        ref={stageRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-canvas-preview"
      >
        <div
          className={
            composition.background === "transparent"
              ? "chequer relative shrink-0"
              : "relative shrink-0"
          }
          style={{
            width: composition.width,
            height: composition.height,
            transform: `scale(${scale})`,
          }}
        >
          <iframe
            ref={iframeRef}
            key={expectedSrc}
            title={`${composition.name} preview`}
            src={expectedSrc}
            width={composition.width}
            height={composition.height}
            className="block border border-border"
            style={{ width: composition.width, height: composition.height }}
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
          <div
            role="alert"
            className="absolute inset-x-3 bottom-3 z-10 rounded-md border border-border bg-popover px-3 py-2 text-sm text-destructive"
          >
            Preview error: {runtimeError}
          </div>
        )}
      </div>
    </section>
  );
}
