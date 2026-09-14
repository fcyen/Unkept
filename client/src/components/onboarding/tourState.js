// "Has this user seen the tour?" state.
//
// localStorage is the right store here: it is per-device, needs no server,
// and the only thing written is a version string against a known key — no
// photo data, no identifiers. Every access is wrapped because Safari private
// mode and hardened browser settings throw on both read and write; a browser
// that refuses storage simply shows the tour every visit rather than breaking
// the app.

export const TOUR_KEY_PREFIX = 'unkept.tour.';

// Bump a surface's version when its steps change enough that returning users
// should be shown the tour again.
export const TOUR_VERSIONS = {
  upload: '1',
  curation: '1',
};

export function tourKey(surface) {
  return `${TOUR_KEY_PREFIX}${surface}`;
}

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null; // access itself can throw when cookies/storage are blocked
  }
}

/**
 * True when the tour for `surface` should run on this device — i.e. it has
 * never been completed, or was completed at an older step version.
 * @param {string} surface  'upload' | 'curation'
 * @param {Storage} [store] injectable for tests
 */
export function shouldShowTour(surface, store = storage()) {
  const version = TOUR_VERSIONS[surface];
  if (!version) return false;
  if (!store) return true; // no storage — better to offer the tour than hide it
  try {
    return store.getItem(tourKey(surface)) !== version;
  } catch {
    return true;
  }
}

/** Record that the tour for `surface` has been seen at the current version. */
export function markTourSeen(surface, store = storage()) {
  const version = TOUR_VERSIONS[surface];
  if (!version || !store) return;
  try {
    store.setItem(tourKey(surface), version);
  } catch {
    // storage full or blocked — the tour just shows again next visit
  }
}

/** Forget every surface's seen-state (used by the dev route / manual replay). */
export function resetTours(store = storage()) {
  if (!store) return;
  for (const surface of Object.keys(TOUR_VERSIONS)) {
    try {
      store.removeItem(tourKey(surface));
    } catch {
      /* ignore */
    }
  }
}
