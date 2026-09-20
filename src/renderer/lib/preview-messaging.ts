export type PreviewFrameState = {
  loadedSrc: string | null;
  readySrc: string | null;
};

export function isPreviewFrameMessage(
  event: Pick<MessageEvent, "origin" | "source">,
  expectedOrigin: string,
  expectedSource: MessageEventSource | null,
): boolean {
  return event.origin === expectedOrigin && event.source === expectedSource;
}

export function canSendPreviewMessage(
  state: PreviewFrameState,
  frameSrc: string | null | undefined,
  expectedSrc: string,
): boolean {
  return (
    frameSrc === expectedSrc && state.loadedSrc === expectedSrc && state.readySrc === expectedSrc
  );
}
