/**
 * Per-photo model votes: { [photoId]: modelLabel }.
 *
 * In demo mode votes persist to localStorage only — never sent anywhere —
 * keyed by fixture version so a regenerated fixture starts a fresh tally.
 * In live mode they are kept in memory for the session (persist=false).
 * Every storage access is guarded: private windows and blocked storage throw.
 */
export function storageKey(version) {
  return `unkept.pipelineDemo.votes.${version ?? 'v1'}`;
}

export function loadVotes(storage, key) {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    // Keep only string → string entries.
    return Object.fromEntries(Object.entries(parsed).filter(([k, v]) => typeof k === 'string' && typeof v === 'string'));
  } catch {
    return {};
  }
}

export function saveVotes(storage, key, votes) {
  try {
    if (Object.keys(votes).length === 0) storage?.removeItem(key);
    else storage?.setItem(key, JSON.stringify(votes));
    return true;
  } catch {
    return false;
  }
}

/** Toggle: voting for the already-voted model clears the vote. */
export function toggleVote(votes, photoId, model) {
  const next = { ...votes };
  if (next[photoId] === model) delete next[photoId];
  else next[photoId] = model;
  return next;
}

export function tally(labels, votes) {
  const counts = labels.map((label) => ({
    label,
    count: Object.values(votes).filter((v) => v === label).length,
  }));
  const total = counts.reduce((s, c) => s + c.count, 0);
  return { counts, total };
}
