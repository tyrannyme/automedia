import { note, stack } from "@strudel/web";

// One cycle is two seconds: four kicks, eight hats, one chord.
export default function pattern(gain) {
  const kick = note("c1*4")
    .s("sine")
    .decay(0.22)
    .sustain(0)
    .gain(0.9 * gain);
  const hats = note("[~ c6]*4")
    .s("square")
    .decay(0.03)
    .sustain(0)
    .lpf(9000)
    .gain(0.06 * gain);
  const bass = note("<[a1 a1 a2 a1] [f1 f1 f2 f1] [c2 c2 c3 c2] [g1 g1 g2 g1]>")
    .s("sawtooth")
    .decay(0.18)
    .sustain(0.1)
    .cutoff(900)
    .gain(0.3 * gain);
  const chords = note("<[a3,c4,e4,g4] [f3,a3,c4,e4] [c4,e4,g4,b4] [g3,b3,d4,f4]>")
    .s("triangle")
    .attack(0.04)
    .release(1.2)
    .gain(0.14 * gain);
  return stack(kick, hats, bass, chords);
}
