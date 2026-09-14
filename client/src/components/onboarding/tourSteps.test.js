import { describe, it, expect } from 'vitest';
import { UPLOAD_TOUR, CURATION_TOUR, visibleSteps } from './tourSteps.js';

describe('tour content', () => {
  const all = [...UPLOAD_TOUR, ...CURATION_TOUR];

  it('gives every step a unique id, a title and a body', () => {
    const ids = new Set();
    for (const step of all) {
      expect(step.id).toBeTruthy();
      expect(ids.has(step.id)).toBe(false);
      ids.add(step.id);
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(0);
    }
  });

  it('only uses placements the placement logic understands', () => {
    const valid = new Set(['top', 'bottom', 'left', 'right']);
    for (const step of all) {
      if (step.placement) expect(valid.has(step.placement)).toBe(true);
    }
  });
});

describe('visibleSteps', () => {
  it('drops steps whose anchor is not on screen', () => {
    const present = new Set(['curation-main', 'curation-finish']);
    const steps = visibleSteps(CURATION_TOUR, (a) => present.has(a));
    expect(steps.map((s) => s.anchor)).toEqual(['curation-main', 'curation-finish']);
  });

  it('keeps unanchored steps regardless', () => {
    const steps = visibleSteps(
      [{ id: 'intro', title: 't', body: 'b' }, { id: 'x', anchor: 'gone', title: 't', body: 'b' }],
      () => false,
    );
    expect(steps.map((s) => s.id)).toEqual(['intro']);
  });

  it('keeps every step when all anchors are present', () => {
    expect(visibleSteps(UPLOAD_TOUR, () => true)).toHaveLength(UPLOAD_TOUR.length);
  });
});
