/**
 * useSlideshowMusic — owns the slideshow soundtrack lifecycle.
 *
 * Contract:
 *   start()    — call from the user gesture that begins playback (cover
 *                CTA tap or arrow-right). This is the only safe moment
 *                to create / resume an AudioContext on mobile.
 *   fadeOut()  — call when the coda begins; ramps to silence over 2s.
 *   toggle()   — flip the user's on/off preference (persisted in
 *                localStorage).
 *   enabled    — current preference (default: on).
 *   active     — whether sound is currently playing (true between
 *                start() and fadeOut() complete, gated by enabled).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const TRACK_URL = '/audio/street-life.mp3';
const STORAGE_KEY = 'photostory.music.enabled';
const FADE_IN_MS = 2000;
const FADE_OUT_MS = 2000;
const TOGGLE_FADE_MS = 400;
const PEAK_GAIN = 0.75;

function readPref() {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === null) return true; // on by default for first play
    return v === 'on';
  } catch {
    return true;
  }
}

function writePref(enabled) {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch { /* private mode — ignore */ }
}

/**
 * Wraps an HTMLAudioElement in the { fadeIn, fadeOut, stop } interface.
 * Gain control goes through a Web Audio GainNode so the fade curves are
 * identical to the procedural-pad path.
 */
function createHtmlAudioTrack(ctx, url) {
  const audio = new Audio(url);
  audio.loop = true;

  const source = ctx.createMediaElementSource(audio);
  const master = ctx.createGain();
  master.gain.value = 0;
  source.connect(master);
  master.connect(ctx.destination);

  let stopped = false;
  let fadeOutTimer = null;

  return {
    fadeIn(ms = FADE_IN_MS, target = PEAK_GAIN) {
      if (stopped) return;
      if (fadeOutTimer) { clearTimeout(fadeOutTimer); fadeOutTimer = null; }
      if (audio.paused) audio.play().catch(() => {});
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(target, now + ms / 1000);
    },
    fadeOut(ms = FADE_OUT_MS) {
      if (stopped) return;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + ms / 1000);
      fadeOutTimer = setTimeout(() => {
        if (!stopped) audio.pause();
        fadeOutTimer = null;
      }, ms);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      if (fadeOutTimer) { clearTimeout(fadeOutTimer); fadeOutTimer = null; }
      audio.pause();
      audio.src = '';
    },
  };
}

function loadTrack(ctx) {
  return createHtmlAudioTrack(ctx, TRACK_URL);
}

export function useSlideshowMusic() {
  const [enabled, setEnabled] = useState(readPref);
  const [active, setActive] = useState(false);

  const ctxRef = useRef(null);
  const trackRef = useRef(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Tear down on unmount so we don't leak an AudioContext when the player exits.
  useEffect(() => {
    return () => {
      if (trackRef.current) {
        trackRef.current.stop();
        trackRef.current = null;
      }
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {});
        ctxRef.current = null;
      }
    };
  }, []);

  const ensureTrack = useCallback(async () => {
    if (trackRef.current) return trackRef.current;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch { /* caller is in user gesture */ }
    }
    ctxRef.current = ctx;
    trackRef.current = loadTrack(ctx);
    return trackRef.current;
  }, []);

  const start = useCallback(async () => {
    if (!enabledRef.current) return;
    const track = await ensureTrack();
    if (!track) return;
    track.fadeIn(FADE_IN_MS);
    setActive(true);
  }, [ensureTrack]);

  const fadeOut = useCallback(() => {
    if (!trackRef.current) return;
    trackRef.current.fadeOut(FADE_OUT_MS);
    setActive(false);
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      writePref(next);
      const track = trackRef.current;
      if (track) {
        if (next) {
          track.fadeIn(TOGGLE_FADE_MS);
          setActive(true);
        } else {
          track.fadeOut(TOGGLE_FADE_MS);
          setActive(false);
        }
      }
      return next;
    });
  }, []);

  return { enabled, active, start, fadeOut, toggle };
}
