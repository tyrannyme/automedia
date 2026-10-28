/** Peak resolution kept per asset; enough for 800 px per second at 3 px a bar. */
export const PEAK_BINS_PER_SECOND = 200;

/** The loudest sample of every bin, across channels. */
export function peaksFromChannels(
  channels: readonly Float32Array[],
  sampleRate: number,
  binsPerSecond = PEAK_BINS_PER_SECOND,
): Float32Array {
  const length = channels[0]?.length ?? 0;
  if (length === 0 || sampleRate <= 0) return new Float32Array(0);
  const perBin = Math.max(1, Math.round(sampleRate / binsPerSecond));
  const bins = Math.ceil(length / perBin);
  const peaks = new Float32Array(bins);
  for (const channel of channels) {
    for (let bin = 0; bin < bins; bin += 1) {
      const end = Math.min(channel.length, (bin + 1) * perBin);
      let peak = peaks[bin] ?? 0;
      for (let i = bin * perBin; i < end; i += 1) {
        const value = Math.abs(channel[i] ?? 0);
        if (value > peak) peak = value;
      }
      peaks[bin] = peak;
    }
  }
  return peaks;
}

/**
 * Bar heights from 0 to 1 for `count` bars covering media time `from`..`to`.
 * Heights are relative to the loudest moment of the whole file, so a quiet
 * trim of a loud file still reads as quiet.
 */
export function waveBars(
  peaks: Float32Array,
  binsPerSecond: number,
  from: number,
  to: number,
  count: number,
): number[] {
  if (count <= 0 || peaks.length === 0 || to <= from) return [];
  let loudest = 0;
  for (const peak of peaks) if (peak > loudest) loudest = peak;
  if (loudest <= 0) return Array.from({ length: count }, () => 0);
  const bars: number[] = [];
  const span = (to - from) / count;
  for (let i = 0; i < count; i += 1) {
    const a = Math.floor((from + i * span) * binsPerSecond);
    const b = Math.max(a + 1, Math.floor((from + (i + 1) * span) * binsPerSecond));
    let peak = 0;
    for (let bin = Math.max(0, a); bin < Math.min(peaks.length, b); bin += 1) {
      const value = peaks[bin] ?? 0;
      if (value > peak) peak = value;
    }
    bars.push(peak / loudest);
  }
  return bars;
}
