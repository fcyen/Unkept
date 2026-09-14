import { describe, it, expect, beforeEach } from 'vitest';
import {
  shouldShowTour,
  markTourSeen,
  resetTours,
  tourKey,
  TOUR_VERSIONS,
} from './tourState.js';

// Minimal in-memory Storage stand-in; `throwing` models a browser that
// refuses storage access (Safari private mode, blocked site data).
function fakeStorage({ throwing = false } = {}) {
  const map = new Map();
  return {
    getItem(k) { if (throwing) throw new Error('denied'); return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { if (throwing) throw new Error('denied'); map.set(k, String(v)); },
    removeItem(k) { if (throwing) throw new Error('denied'); map.delete(k); },
    _map: map,
  };
}

describe('tour seen-state', () => {
  let store;
  beforeEach(() => { store = fakeStorage(); });

  it('shows the tour on a fresh device', () => {
    expect(shouldShowTour('upload', store)).toBe(true);
    expect(shouldShowTour('curation', store)).toBe(true);
  });

  it('does not show it again once marked seen', () => {
    markTourSeen('upload', store);
    expect(shouldShowTour('upload', store)).toBe(false);
    // Surfaces are tracked independently.
    expect(shouldShowTour('curation', store)).toBe(true);
  });

  it('shows it again after a step-version bump', () => {
    store.setItem(tourKey('upload'), 'old-version');
    expect(shouldShowTour('upload', store)).toBe(true);
  });

  it('writes the current version under a namespaced key', () => {
    markTourSeen('curation', store);
    expect(store._map.get('unkept.tour.curation')).toBe(TOUR_VERSIONS.curation);
  });

  it('ignores unknown surfaces', () => {
    expect(shouldShowTour('nope', store)).toBe(false);
    markTourSeen('nope', store);
    expect(store._map.size).toBe(0);
  });

  it('falls back to showing the tour when storage is unavailable', () => {
    expect(shouldShowTour('upload', null)).toBe(true);
    expect(shouldShowTour('upload', fakeStorage({ throwing: true }))).toBe(true);
  });

  it('never throws when storage refuses writes', () => {
    const blocked = fakeStorage({ throwing: true });
    expect(() => markTourSeen('upload', blocked)).not.toThrow();
    expect(() => resetTours(blocked)).not.toThrow();
    expect(() => resetTours(null)).not.toThrow();
  });

  it('resetTours clears every surface', () => {
    markTourSeen('upload', store);
    markTourSeen('curation', store);
    resetTours(store);
    expect(shouldShowTour('upload', store)).toBe(true);
    expect(shouldShowTour('curation', store)).toBe(true);
  });
});
