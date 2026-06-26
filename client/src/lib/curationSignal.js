// Curation feedback signal — quality-score histograms of the four confusion
// cells, comparing what we auto-selected (the pickTopK "starter" set) against
// what the user finally kept.
//
//                       kept            not kept
//   auto-selected   TP (good pick)   FP (over-valued — we picked, user dropped)
//   not selected    FN (missed —     TN (correctly ignored)
//                       user added)
//
// The diagnostic question: for each cell, what is the distribution of our
// `qualityScore`? High-quality FPs mean sharpness over-predicts keep; low-quality
// FNs mean users rescue things quality can't see.
//
// Output is bucket *counts* only — all plain scalars, so they pass the
// telemetry sanitizers untouched and carry no per-photo (PII) detail. A cell's
// total is the sum of its four buckets; precision/recall are derived in SQL.

// quartile bucket index for a 0..1 score → 0,1,2,3
function bucket(q) {
  return Math.min(3, Math.max(0, Math.floor(q * 4)));
}

/**
 * Build the quality-error histogram event payload.
 *
 * @param {Set<string>|Iterable<string>} autoIds   ids we auto-selected (starter)
 * @param {Set<string>|Iterable<string>} keptIds   ids the user finally kept
 * @param {Iterable<string>} universeIds            all curatable ids (chapter photos)
 * @param {Record<string, {qualityScore?: number|null}>} photosMap
 * @returns {Record<string, number>} flat scalar bucket counts + nullQuality
 */
export function qualityErrorHistogram(autoIds, keptIds, universeIds, photosMap) {
  const auto = autoIds instanceof Set ? autoIds : new Set(autoIds);
  const kept = keptIds instanceof Set ? keptIds : new Set(keptIds);

  const out = {
    tp_q0: 0, tp_q1: 0, tp_q2: 0, tp_q3: 0,
    fp_q0: 0, fp_q1: 0, fp_q2: 0, fp_q3: 0,
    fn_q0: 0, fn_q1: 0, fn_q2: 0, fn_q3: 0,
    tn_q0: 0, tn_q1: 0, tn_q2: 0, tn_q3: 0,
    nullQuality: 0,
  };

  for (const id of universeIds) {
    const q = photosMap[id]?.qualityScore;
    if (typeof q !== 'number') { out.nullQuality += 1; continue; }
    const cell = auto.has(id)
      ? (kept.has(id) ? 'tp' : 'fp')
      : (kept.has(id) ? 'fn' : 'tn');
    out[`${cell}_q${bucket(q)}`] += 1;
  }

  return out;
}
