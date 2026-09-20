export type PreviewContentWindow = {
  location: {
    origin: string;
  };
};

export function originFromUrl(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * `liveOrigin` is the readable `contentWindow.location.origin`. `undefined` means the
 * frame is already cross-origin, so the live origin cannot be read and the src origin
 * is the only check that remains.
 */
export function previewIframeTargetOrigin(
  iframeSrc: string,
  expectedOrigin: string,
  liveOrigin: string | undefined,
): string | null {
  const srcOrigin = originFromUrl(iframeSrc);
  if (srcOrigin !== expectedOrigin) return null;
  if (liveOrigin === undefined) return expectedOrigin;
  if (liveOrigin !== expectedOrigin) return null;
  return expectedOrigin;
}

export function readWindowOrigin(contentWindow: PreviewContentWindow): string | undefined {
  try {
    return contentWindow.location.origin;
  } catch {
    return undefined;
  }
}

export function iframeTargetOrigin(
  iframeSrc: string,
  contentWindow: PreviewContentWindow | null,
  expectedOrigin: string,
): string | null {
  if (!contentWindow) return null;
  return previewIframeTargetOrigin(iframeSrc, expectedOrigin, readWindowOrigin(contentWindow));
}

export function enqueueUntilOrigin<T>(origin: string | null, queue: T[], message: T): T | null {
  if (!origin) {
    queue.push(message);
    return null;
  }
  return message;
}

export function takeQueuedMessages<T>(queue: T[]): T[] {
  return queue.splice(0, queue.length);
}
