import type { CompositionStore } from "../store.ts";
import type { Composition } from "@shared/schemas.ts";

export const spec = {
  name: "Strudel music",
  description: "A music clip with a managed Strudel pattern.",
};

export async function write(store: CompositionStore): Promise<Composition> {
  const composition = await store.create(spec.name);
  await store.updateSettings({
    compositionId: composition.id,
    width: 640,
    height: 360,
    fps: 30,
    durationSeconds: 4,
    background: "#111111",
  });
  const track = await store.createMusicBlock(composition.id, spec.name);
  await store.putTrack(composition.id, { ...track, duration: 4 });
  return store.get(composition.id);
}
