/**
 * SlideshowPlayer — the Wrapped-style slideshow engine.
 *
 * State machine:  idle → playing → (paused ↔ playing) → finished
 *
 *   idle      cover is up, waiting for the "Ready to relive" tap.
 *   playing   auto-advancing through dividers and photo cards.
 *   paused    finger held down; timer suspended, progress bar shown.
 *   finished  coda has finished its 5s hold; play-again affordance shown.
 *
 * Gestures:
 *   tap right   → next
 *   tap left    → previous
 *   hold        → pause (release resumes)
 *
 * Keyboard (desktop / dev route):
 *   ← / →       → prev / next
 *   space       → toggle pause (while playing)
 *   esc         → exit (calls onExit)
 *
 * Timers are ref-based so React re-renders don't restart them; the
 * effect that schedules advance keys off (frameIndex, status, frame.id)
 * so scheduling is deterministic.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CoverFrame from './CoverFrame.jsx';
import ChapterDividerFrame from './ChapterDividerFrame.jsx';
import PhotoCardFrame from './PhotoCardFrame.jsx';
import CodaFrame from './CodaFrame.jsx';
import ProgressBar from './ProgressBar.jsx';
import MusicToggle from './MusicToggle.jsx';
import { useSlideshowMusic } from './music/useSlideshowMusic.js';
import { createStoryRunId, TELEMETRY_EVENTS, track } from '../../lib/analytics.js';
import { DEFAULT_STORY_INTENT, normalizeStoryIntent } from '../../lib/storyPreferences.js';

const FRAME_DURATION = {
  cover: null,
  chapterDivider: 2000,
  photoCard: 2000,
  coda: 2000,
};

const HOLD_THRESHOLD_MS = 300;
const EXIT_ANIM_MS = 400;

export default function SlideshowPlayer({ story, onExit }) {
  const frames = story.frames;
  const photos = story.skeleton.photos;
  const storyRunIdRef = useRef(story.skeleton.meta?.storyRunId || createStoryRunId());
  const storyRunId = storyRunIdRef.current;
  const storyIntent = normalizeStoryIntent(
    story.skeleton.meta?.preferences?.storyIntent || DEFAULT_STORY_INTENT,
  );
  const photoCount = story.skeleton.meta?.totalPhotosInput ?? Object.keys(photos).length;

  const [frameIndex, setFrameIndex] = useState(0);
  const [status, setStatus] = useState('idle');
  const [exiting, setExiting] = useState(false);
  // Bumped on every paused → playing transition so the progress bar can
  // restart its CSS animation in sync with the fresh advance timer.
  const [runKey, setRunKey] = useState(0);

  const currentFrame = frames[frameIndex];
  const isLastFrame = frameIndex === frames.length - 1;
  const duration = FRAME_DURATION[currentFrame?.type] ?? null;

  const advanceTimerRef = useRef(null);
  const exitTimerRef = useRef(null);
  const holdTimerRef = useRef(null);
  const pointerRef = useRef(null);
  const highestFrameIndexRef = useRef(0);
  const completedTrackedRef = useRef(false);
  const replayCountRef = useRef(0);

  const music = useSlideshowMusic();

  const trackingPayload = useCallback((extra = {}) => ({
    storyRunId,
    storyIntent,
    photoCount,
    totalFrames: frames.length,
    ...extra,
  }), [frames.length, photoCount, storyIntent, storyRunId]);

  const clearAdvanceTimer = () => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  };

  // Schedule the auto-advance for the current frame.
  useEffect(() => {
    clearAdvanceTimer();
    setExiting(false);
    highestFrameIndexRef.current = Math.max(highestFrameIndexRef.current, frameIndex);

    if (status !== 'playing' || duration == null) return;

    // Chapter dividers get a brief exit animation before the next frame
    // swaps in. Other frames transition via frame-level CSS on entry.
    const exitStart = duration - EXIT_ANIM_MS;
    if (currentFrame.type === 'chapterDivider' && exitStart > 0) {
      exitTimerRef.current = setTimeout(() => setExiting(true), exitStart);
    }

    advanceTimerRef.current = setTimeout(() => {
      if (isLastFrame) {
        setStatus('finished');
      } else {
        setFrameIndex((i) => i + 1);
      }
    }, duration);

    return clearAdvanceTimer;
  }, [frameIndex, status, duration, isLastFrame, currentFrame?.type]);

  useEffect(() => {
    if (status !== 'finished' || completedTrackedRef.current) return;
    completedTrackedRef.current = true;
    highestFrameIndexRef.current = frames.length - 1;
    track(TELEMETRY_EVENTS.STORY_COMPLETED, trackingPayload({
      reachedFrameIndex: frames.length - 1,
      completionRate: 1,
    }));
  }, [frames.length, status, trackingPayload]);

  const goNext = useCallback(() => {
    clearAdvanceTimer();
    setExiting(false);
    if (!isLastFrame) {
      setFrameIndex((i) => i + 1);
      if (status === 'idle') setStatus('playing');
    } else {
      setStatus('finished');
    }
  }, [isLastFrame, status]);

  const goPrev = useCallback(() => {
    clearAdvanceTimer();
    setExiting(false);
    if (frameIndex > 0) {
      setFrameIndex((i) => i - 1);
      // Stepping back off coda rewinds 'finished' to 'playing'.
      if (status === 'finished') setStatus('playing');
    }
  }, [frameIndex, status]);

  const startPlayback = useCallback(() => {
    clearAdvanceTimer();
    setStatus('playing');
    setFrameIndex((i) => (i === 0 && frames.length > 1 ? 1 : i));
    track(TELEMETRY_EVENTS.STORY_STARTED, trackingPayload());
    // Must run synchronously inside the user gesture to satisfy mobile
    // autoplay restrictions.
    music.start();
  }, [frames.length, music, trackingPayload]);

  const replay = useCallback(() => {
    clearAdvanceTimer();
    setExiting(false);
    replayCountRef.current += 1;
    completedTrackedRef.current = false;
    highestFrameIndexRef.current = 0;
    setFrameIndex(0);
    setStatus('idle');
    track(TELEMETRY_EVENTS.STORY_REPLAYED, trackingPayload({
      replayCount: replayCountRef.current,
    }));
    // Music will fade in again from the next cover CTA tap.
  }, [trackingPayload]);

  const handleExit = useCallback(() => {
    if (status !== 'finished') {
      const reachedFrameIndex = Math.max(highestFrameIndexRef.current, frameIndex);
      track(TELEMETRY_EVENTS.STORY_EXITED, trackingPayload({
        reachedFrameIndex,
        completionRate: computeCompletionRate(reachedFrameIndex, frames.length),
      }));
    }
    onExit?.();
  }, [frameIndex, frames.length, onExit, status, trackingPayload]);

  // Begin the music fade-out as soon as the coda starts playing, so the
  // 2s fade lands before the 5s hold ends.
  useEffect(() => {
    if (currentFrame?.type === 'coda' && status === 'playing') {
      music.fadeOut();
    }
  }, [currentFrame?.type, status, music]);

  // --- Gestures -----------------------------------------------------------

  const handlePointerDown = (e) => {
    if (status === 'finished' || status === 'idle') return;
    pointerRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
      width: e.currentTarget.getBoundingClientRect().width,
      left: e.currentTarget.getBoundingClientRect().left,
    };
    holdTimerRef.current = setTimeout(() => {
      setStatus('paused');
    }, HOLD_THRESHOLD_MS);
  };

  const handlePointerUp = (e) => {
    const start = pointerRef.current;
    pointerRef.current = null;

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    if (!start) return;

    const held = Date.now() - start.time;
    if (held >= HOLD_THRESHOLD_MS) {
      // Release from hold → resume.
      setStatus('playing');
      setRunKey((k) => k + 1);
      return;
    }

    // Short tap → map to prev/next by which half of the screen was tapped.
    const relX = e.clientX - start.left;
    if (relX < start.width / 2) {
      goPrev();
    } else {
      goNext();
    }
  };

  const handlePointerCancel = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    pointerRef.current = null;
    if (status === 'paused') {
      setStatus('playing');
      setRunKey((k) => k + 1);
    }
  };

  // --- Keyboard -----------------------------------------------------------

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') {
        if (status === 'idle') startPlayback();
        else goNext();
      } else if (e.key === 'ArrowLeft') {
        goPrev();
      } else if (e.key === 'Escape') {
        handleExit();
      } else if (e.key === ' ') {
        if (status === 'playing') {
          setStatus('paused');
        } else if (status === 'paused') {
          setStatus('playing');
          setRunKey((k) => k + 1);
        }
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, handleExit, startPlayback, status]);

  // --- Render -------------------------------------------------------------

  const progressVisible = status === 'paused';
  const frameContent = useMemo(() => {
    switch (currentFrame.type) {
      case 'cover':
        return <CoverFrame frame={currentFrame} onStart={startPlayback} />;
      case 'chapterDivider':
        return (
          <ChapterDividerFrame
            frame={currentFrame}
            photos={photos}
            exiting={exiting}
          />
        );
      case 'photoCard':
        return <PhotoCardFrame frame={currentFrame} photos={photos} />;
      case 'coda':
        return (
          <CodaFrame
            frame={currentFrame}
            finished={status === 'finished'}
            onReplay={replay}
          />
        );
      default:
        return null;
    }
  }, [currentFrame, photos, exiting, status, startPlayback, replay]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center select-none">
      {/*
        On desktop the slideshow is shown inside a phone-shaped frame
        (9:19.5 aspect, the iPhone Pro ratio) — letterboxed by the outer
        black backdrop. On mobile (<md) it fills the viewport. Pointer
        handlers live on the phone-frame div so taps in the letterbox
        don't register as next/prev.
      */}
      <div
        className="relative bg-black text-white overflow-hidden touch-none w-full h-full md:w-auto md:h-screen md:max-w-full md:aspect-[9/19.5]"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <ProgressBar
          frames={frames}
          frameIndex={frameIndex}
          durationMs={duration}
          visible={progressVisible}
          paused={status === 'paused'}
          runKey={runKey}
        />

        {/* Frame key forces entry animations to retrigger on each navigation. */}
        <div key={currentFrame.id} className="absolute inset-0">
          {frameContent}
        </div>

        <MusicToggle
          enabled={music.enabled}
          onToggle={music.toggle}
          visible={progressVisible}
        />

        {onExit && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleExit();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            className="absolute top-3 right-3 z-30 w-9 h-9 rounded-full bg-black/40 text-white/70 hover:text-white hover:bg-black/60 text-lg leading-none"
            aria-label="Close slideshow"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

function computeCompletionRate(reachedFrameIndex, totalFrames) {
  if (!totalFrames) return 0;
  return Math.round(((reachedFrameIndex + 1) / totalFrames) * 1000) / 1000;
}
