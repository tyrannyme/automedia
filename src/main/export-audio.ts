import type { Composition, MediaTrack } from "@shared/schemas.ts";

export function atempoChain(rate: number): string {
  const filters: string[] = [];
  let remaining = rate;
  while (remaining > 2) {
    filters.push("atempo=2.0");
    remaining /= 2;
  }
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining *= 2;
  }
  filters.push(`atempo=${remaining.toFixed(6)}`);
  return filters.join(",");
}

export function audioFilterGraph(
  composition: Composition,
  tracks: MediaTrack[],
  extraTimedAudioCount = 0,
  firstInputIndex = 1,
): string {
  const chains: string[] = [];
  const labels: string[] = [];
  for (const [index, track] of tracks.entries()) {
    const delayMs = Math.round(track.start * 1000);
    const label = `a${index}`;
    chains.push(
      `[${firstInputIndex + index}:a]atrim=start=${track.trimStart}:duration=${track.duration * track.rate},${atempoChain(track.rate)},volume=${track.volume},adelay=${delayMs}|${delayMs},apad=whole_dur=${composition.durationSeconds},atrim=duration=${composition.durationSeconds}[${label}]`,
    );
    labels.push(`[${label}]`);
  }
  for (let index = 0; index < extraTimedAudioCount; index += 1) {
    const inputIndex = firstInputIndex + tracks.length + index;
    const label = `m${index}`;
    chains.push(
      `[${inputIndex}:a]apad=whole_dur=${composition.durationSeconds},atrim=duration=${composition.durationSeconds}[${label}]`,
    );
    labels.push(`[${label}]`);
  }
  if (chains.length === 0) {
    return "";
  }
  if (chains.length === 1) {
    return chains[0]?.replace(/\[[^\]]+]$/, "[aout]") ?? "";
  }
  return `${chains.join(";")};${labels.join("")}amix=inputs=${labels.length}:duration=first[aout]`;
}

export function audioCodecArgs(
  format: "mp4" | "webm" | "mp3" | "wav" | "ogg",
  quality?: number,
): string[] {
  if (format === "mp4") {
    return ["-c:a", "aac", "-b:a", "192k"];
  }
  if (format === "webm") {
    return ["-c:a", "libopus", "-b:a", "160k"];
  }
  if (format === "mp3") {
    const bitrate = 64_000 + Math.round(((quality ?? 80) - 1) * (256_000 / 99));
    return ["-c:a", "libmp3lame", "-b:a", String(bitrate)];
  }
  if (format === "ogg") {
    const qScale = Math.round(((quality ?? 80) - 1) * (10 / 99));
    return ["-c:a", "libvorbis", "-q:a", String(qScale)];
  }
  return ["-c:a", "pcm_s16le"];
}
