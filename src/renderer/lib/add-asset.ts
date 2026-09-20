import { nextFreeStart, preferredLane } from "@shared/clips.ts";
import { limits } from "@shared/limits.ts";
import type { MediaTrack } from "@shared/schemas.ts";
import { newLocalId } from "@/lib/ids.ts";
import { imageTrackFromLibrary, isImageLibraryAsset } from "@/lib/library.ts";
import { useStudioStore } from "@/stores/studio.ts";

export async function addAssetToTimeline(
  compositionId: string,
  asset: string,
  onTrack: (track: MediaTrack) => Promise<void>,
  start?: number,
  lane?: number,
): Promise<MediaTrack> {
  const studio = useStudioStore.getState();
  if (isImageLibraryAsset(asset)) {
    const track = imageTrackFromLibrary({
      id: newLocalId("t"),
      asset,
      playheadSeconds: start ?? studio.playheadSeconds,
      tracks: studio.media.tracks,
      selectedTrackId: studio.selectedTrackId,
      lane,
    });
    await onTrack(track);
    return track;
  }
  const result = await window.studio.media.probe(compositionId, asset);
  if (result.durationSeconds <= 0) {
    throw Object.assign(new Error("Could not read this media file."), { code: "probe_failed" });
  }
  const hasVideo = result.streams.some((stream) => stream.codecType === "video");
  const hasAudio = result.streams.some((stream) => stream.codecType === "audio");
  const tracks = studio.media.tracks;
  const selectedTrack = tracks.find((track) => track.id === studio.selectedTrackId);
  const kind = hasVideo ? "video" : "audio";
  const duration = Math.min(result.durationSeconds, limits.maxDurationSeconds);
  const nextLane = preferredLane(
    tracks,
    kind,
    lane ?? (selectedTrack?.kind === kind ? selectedTrack.lane : undefined),
  );
  const track: MediaTrack = {
    id: newLocalId("t"),
    asset,
    kind,
    start: nextFreeStart(tracks, nextLane, start ?? studio.playheadSeconds, duration),
    trimStart: 0,
    rate: 1,
    volume: 1,
    mute: !hasAudio,
    duration,
    lane: nextLane,
  };
  await onTrack(track);
  return track;
}
