/**
 * Procedural ambient pad — placeholder soundtrack for the slideshow.
 *
 * Why procedural: PR 2D's plan calls for bundled Opus tracks (Pixabay /
 * Uppbeat). Until those are sourced and licensed, this generator gives
 * the music system something to play that costs zero bytes in the bundle
 * and zero licensing risk. It is a stub — when a real track is dropped
 * into `/public/audio/`, swap the `loadTrack` factory in
 * `useSlideshowMusic` to instantiate `htmlAudioTrack(url)` instead.
 *
 * Sound design: a soft A-minor pad — A2 / C3 / E3 / A3 — through a low-
 * pass filter, with each oscillator detuned by its own slow LFO so the
 * pad breathes rather than droning. Sine on the bass for warmth,
 * triangles on the upper voices for a bit of upper-harmonic life.
 *
 * The returned object exposes the same `fadeIn / fadeOut / stop`
 * interface as a future `htmlAudioTrack` wrapper, so the consumer
 * (`useSlideshowMusic`) doesn't care which one it is talking to.
 */

const NOTES = [110.0, 130.81, 164.81, 220.0]; // A2, C3, E3, A3
const PEAK_GAIN = 0.5;

export function createAmbientPad(audioContext) {
  const ctx = audioContext;

  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  filter.Q.value = 0.7;
  filter.connect(master);

  const sources = NOTES.map((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = i === 0 ? 'sine' : 'triangle';
    osc.frequency.value = freq;

    // Slow detune LFO so each voice drifts independently.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05 + i * 0.03;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 4 + i;
    lfo.connect(lfoGain).connect(osc.detune);

    const voiceGain = ctx.createGain();
    voiceGain.gain.value = i === 0 ? 0.20 : 0.12 / Math.sqrt(i + 1);
    osc.connect(voiceGain).connect(filter);

    osc.start();
    lfo.start();
    return { osc, lfo };
  });

  let stopped = false;

  return {
    fadeIn(ms = 2000, target = PEAK_GAIN) {
      if (stopped) return;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(target, now + ms / 1000);
    },
    fadeOut(ms = 2000) {
      if (stopped) return;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + ms / 1000);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      sources.forEach(({ osc, lfo }) => {
        try { osc.stop(); } catch { /* already stopped */ }
        try { lfo.stop(); } catch { /* already stopped */ }
      });
    },
  };
}
