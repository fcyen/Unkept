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
 *
 * Implementation note: the track is currently a procedural Web Audio
 * pad (see `ambientPad.js`). The `loadTrack` factory is the swap point
 * — replace with an `<audio>`-element wrapper once a real Opus track is
 * bundled in `/public/audio/`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createAmbientPad } from './ambientPad.js';

const STORAGE_KEY = 'photostory.music.enabled';
const FADE_IN_MS = 2000;
const FADE_OUT_MS = 2000;
const TOGGLE_FADE_MS = 400;

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
  } catch { /* private mode etc. — ignore */ }
}

function loadTrack(ctx) {
  // Single seam: swap this out for `htmlAudioTrack(url)` once a real
  // bundled track exists. The returned object must match the
  // `{ fadeIn, fadeOut, stop }` shape.
  return createAmbientPad(ctx);
}

export function useSlideshowMusic() {
  const [enabled, setEnabled] = useState(readPref);
  const [active, setActive] = useState(false);

  const ctxRef = useRef(null);
  const trackRef = useRef(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Tear down on unmount so we don't leak an AudioContext if the player
  // is exited mid-playback.
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
      try { await ctx.resume(); } catch { /* user gesture required — caller handles */ }
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
