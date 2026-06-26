import { describe, it, expect } from 'vitest';
import { qualityErrorHistogram } from './curationSignal.js';

const photos = {
  // qualityScore chosen to land in known quartile buckets:
  // [0,.25)->q0  [.25,.5)->q1  [.5,.75)->q2  [.75,1]->q3
  a: { qualityScore: 0.10 }, // q0
  b: { qualityScore: 0.30 }, // q1
  c: { qualityScore: 0.60 }, // q2
  d: { qualityScore: 0.90 }, // q3
  e: { qualityScore: 0.95 }, // q3
  f: { qualityScore: null }, // null
};

describe('qualityErrorHistogram', () => {
  it('classifies each photo into the right confusion cell and bucket', () => {
    const auto = new Set(['c', 'd']); // we auto-selected c, d
    const kept = new Set(['c', 'e']); // user kept c, added e, dropped d
    const universe = ['a', 'b', 'c', 'd', 'e'];
    const h = qualityErrorHistogram(auto, kept, universe, photos);

    expect(h.tp_q2).toBe(1); // c: auto + kept, quality .60
    expect(h.fp_q3).toBe(1); // d: auto + dropped, quality .90
    expect(h.fn_q3).toBe(1); // e: added (not auto), quality .95
    expect(h.tn_q0).toBe(1); // a: ignored, quality .10
    expect(h.tn_q1).toBe(1); // b: ignored, quality .30
  });

  it('counts null-quality photos separately, not in any bucket', () => {
    const h = qualityErrorHistogram(new Set(), new Set(['f']), ['f'], photos);
    expect(h.nullQuality).toBe(1);
    const bucketSum = Object.entries(h)
      .filter(([k]) => k !== 'nullQuality')
      .reduce((s, [, v]) => s + v, 0);
    expect(bucketSum).toBe(0);
  });

  it('puts a score of exactly 1 in the top bucket (clamped)', () => {
    const h = qualityErrorHistogram(new Set(['x']), new Set(['x']), ['x'], { x: { qualityScore: 1 } });
    expect(h.tp_q3).toBe(1);
  });

  it('accepts arrays as well as Sets for auto/kept', () => {
    const h = qualityErrorHistogram(['c'], ['c'], ['c'], photos);
    expect(h.tp_q2).toBe(1);
  });

  it('cell totals equal the sum of their buckets (so SQL can derive counts)', () => {
    const auto = new Set(['a', 'b', 'c', 'd']);
    const kept = new Set(['a', 'c', 'e']);
    const universe = ['a', 'b', 'c', 'd', 'e'];
    const h = qualityErrorHistogram(auto, kept, universe, photos);
    const tp = h.tp_q0 + h.tp_q1 + h.tp_q2 + h.tp_q3;
    const fp = h.fp_q0 + h.fp_q1 + h.fp_q2 + h.fp_q3;
    const fn = h.fn_q0 + h.fn_q1 + h.fn_q2 + h.fn_q3;
    const tn = h.tn_q0 + h.tn_q1 + h.tn_q2 + h.tn_q3;
    expect(tp).toBe(2); // a(kept,auto), c(kept,auto)
    expect(fp).toBe(2); // b, d (auto, not kept)
    expect(fn).toBe(1); // e (kept, not auto)
    expect(tn).toBe(0);
    expect(tp + fp + fn + tn).toBe(universe.length);
  });

  it('emits a complete schema of zeros for an empty universe', () => {
    const h = qualityErrorHistogram(new Set(), new Set(), [], photos);
    expect(Object.values(h).every((v) => v === 0)).toBe(true);
    expect(Object.keys(h)).toHaveLength(17); // 16 buckets + nullQuality
  });
});
