import { describe, it, expect } from 'vitest';
import { modelErrorCopy, aestheticStageState, stageViewState } from './pipelineStates.js';

const ORDER = ['exif', 'dedup', 'embedding', 'cluster', 'aestheticScore', 'heroSelect'];

describe('modelErrorCopy', () => {
  it('gives an actionable 429 message naming the model and the wait', () => {
    const c = modelErrorCopy('moonshot-v1-8k-vision-preview', { kind: 'rate_limit', status: 429, retryAfter: 20 });
    expect(c.kind).toBe('error');
    expect(c.title).toMatch(/moonshot-v1-8k-vision-preview.*rate limit.*429/);
    expect(c.body).toMatch(/about 20s/);
    expect(c.body).toMatch(/re-run/i);
  });
  it('defaults the wait to a minute without retry-after', () => {
    expect(modelErrorCopy('A', { kind: 'rate_limit' }).body).toMatch(/a minute/);
  });
  it('explains a failed score with the provider detail', () => {
    const c = modelErrorCopy('gpt-4o-mini', { kind: 'failed', status: 500, message: 'Upstream timeout' });
    expect(c.title).toMatch(/gpt-4o-mini didn’t return a score/);
    expect(c.body).toMatch(/Upstream timeout \(HTTP 500\)/);
  });
  it('treats a cache miss in the demo as empty, not an error', () => {
    expect(modelErrorCopy('A', { kind: 'not_cached' }).kind).toBe('empty');
  });
  it('never renders a bare null — unknown kinds fall back to failed copy', () => {
    expect(modelErrorCopy(null, undefined).title).toMatch(/This model/);
  });
});

describe('aestheticStageState', () => {
  const ok = { status: 'ok', candidateCount: 4, scoredCount: 4, rateLimitedCount: 0, failedCount: 0, modelErrorCount: 0 };
  it('is null (show content) when everything scored', () => {
    expect(aestheticStageState(ok)).toBeNull();
  });
  it.each([
    ['unreachable', /isn’t running/],
    ['unconfigured', /no model is configured/],
    ['not_bundled', /aren’t bundled/],
    ['demo', /off in demo mode/],
    ['empty', /Nothing to score/],
  ])('maps status %s to an empty state', (status, title) => {
    const s = aestheticStageState({ ...ok, status, scoredCount: 0 });
    expect(s.kind).toBe('empty');
    expect(s.title).toMatch(title);
  });
  it('is an error when every request was rate-limited', () => {
    const s = aestheticStageState({ ...ok, scoredCount: 0, rateLimitedCount: 4 });
    expect(s.kind).toBe('error');
    expect(s.title).toMatch(/rate-limited \(429\)/);
  });
  it('is an error when every request failed', () => {
    expect(aestheticStageState({ ...ok, scoredCount: 0, failedCount: 4 }).title).toMatch(/failed for every photo/);
  });
  it('warns on partial failure with counts', () => {
    const s = aestheticStageState({ ...ok, scoredCount: 2, rateLimitedCount: 1, failedCount: 1 });
    expect(s.kind).toBe('warning');
    expect(s.body).toMatch(/1 photo was rate-limited \(429\) and 1 photo failed/);
  });
  it('warns when only one of two models is missing', () => {
    expect(aestheticStageState({ ...ok, modelErrorCount: 1 }).body).toMatch(/1 individual model score is missing/);
  });
});

describe('stageViewState', () => {
  it('shows loading with progress for the running stage', () => {
    const s = stageViewState({ stage: 'dedup', snapshots: { exif: {} }, running: true, progress: { stage: 'dedup', progress: 3, total: 12 }, stageOrder: ORDER });
    expect(s).toMatchObject({ kind: 'loading', pct: 25 });
    expect(s.body).toBe('3 of 12 done');
  });
  it('shows waiting for a later stage', () => {
    const s = stageViewState({ stage: 'cluster', snapshots: { exif: {} }, running: true, progress: { stage: 'dedup', progress: 1, total: 2 }, stageOrder: ORDER });
    expect(s.title).toMatch(/Waiting/);
    expect(s.body).toMatch(/after embedding/);
  });
  it('explains a skipped embedding stage once the run is done', () => {
    expect(stageViewState({ stage: 'embedding', snapshots: {}, running: false, stageOrder: ORDER }).title).toMatch(/Semantic clustering was off/);
  });
  it('explains an unreachable CLIP server', () => {
    const s = stageViewState({ stage: 'embedding', snapshots: { embedding: { embeddedCount: 0, nullCount: 5 } }, running: false, stageOrder: ORDER });
    expect(s.title).toMatch(/CLIP embedding server/);
  });
  it('is empty when no photos reached the stage', () => {
    expect(stageViewState({ stage: 'cluster', snapshots: { cluster: { perPhoto: {} } }, running: false, stageOrder: ORDER }).kind).toBe('empty');
  });
  it('is null for a populated stage', () => {
    expect(stageViewState({ stage: 'cluster', snapshots: { cluster: { perPhoto: { a: {} } } }, running: false, stageOrder: ORDER })).toBeNull();
  });
  it('delegates the aesthetic stage', () => {
    expect(stageViewState({ stage: 'aestheticScore', snapshots: { aestheticScore: { status: 'unreachable' } }, running: false, stageOrder: ORDER }).title).toMatch(/proxy/);
  });
});

import { compareModels } from './pipelineStates.js';

describe('compareModels', () => {
  it('summarises averages, keep agreement and mean gap over paired photos only', () => {
    const snap = {
      modelLabels: ['A', 'B'],
      perPhoto: {
        p1: { models: [{ model: 'A', score: 0.8, keep: true }, { model: 'B', score: 0.6, keep: true }] },
        p2: { models: [{ model: 'A', score: 0.4, keep: false }, { model: 'B', score: 0.8, keep: true }] },
        p3: { models: [{ model: 'A', score: 0.6, keep: true }, { model: 'B', score: null, error: { kind: 'rate_limit' } }] },
        p4: { models: null },
      },
    };
    const r = compareModels(snap);
    expect(r.models[0]).toEqual({ label: 'A', n: 3, avg: expect.closeTo(0.6, 5) });
    expect(r.models[1]).toEqual({ label: 'B', n: 2, avg: expect.closeTo(0.7, 5) });
    expect(r.paired).toBe(2);
    expect(r.agree).toBe(1);
    expect(r.meanGap).toBeCloseTo(0.3, 5);
  });
  it('handles a missing snapshot', () => {
    expect(compareModels(undefined)).toEqual({ models: [], paired: 0, agree: 0, meanGap: null });
  });
});
