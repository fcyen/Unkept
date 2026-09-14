import { describe, it, expect } from 'vitest';
import {
  spotlightRect,
  scrimPanels,
  choosePlacement,
  placeTooltip,
  TOOLTIP_GAP,
  VIEWPORT_PAD,
} from './tourPlacement.js';

const VIEWPORT = { width: 1000, height: 800 };
const CARD = { width: 320, height: 200 };

describe('spotlightRect', () => {
  it('inflates the anchor by the padding', () => {
    const hole = spotlightRect({ top: 100, left: 200, width: 60, height: 40 }, VIEWPORT, 8);
    expect(hole).toMatchObject({ top: 92, left: 192, width: 76, height: 56 });
    expect(hole.bottom).toBe(148);
    expect(hole.right).toBe(268);
  });

  it('clamps a hole that would hang off the viewport edge', () => {
    const hole = spotlightRect({ top: -20, left: -10, width: 60, height: 40 }, VIEWPORT, 8);
    expect(hole.top).toBe(0);
    expect(hole.left).toBe(0);
    expect(hole.bottom).toBe(28); // 40 - 20 + 8
  });

  it('returns null without an anchor rect', () => {
    expect(spotlightRect(null, VIEWPORT)).toBeNull();
  });
});

describe('scrimPanels', () => {
  it('covers the viewport exactly once when there is no hole', () => {
    const panels = scrimPanels(null, VIEWPORT);
    expect(panels).toHaveLength(1);
    expect(panels[0]).toMatchObject({ top: 0, left: 0, width: 1000, height: 800 });
  });

  it('leaves the hole uncovered and the rest covered', () => {
    const hole = spotlightRect({ top: 300, left: 400, width: 200, height: 100 }, VIEWPORT, 0);
    const panels = scrimPanels(hole, VIEWPORT);

    const covers = (x, y) => panels.some(
      (p) => x >= p.left && x < p.left + p.width && y >= p.top && y < p.top + p.height,
    );
    expect(covers(450, 350)).toBe(false); // inside the hole
    expect(covers(450, 100)).toBe(true);  // above
    expect(covers(450, 700)).toBe(true);  // below
    expect(covers(100, 350)).toBe(true);  // left
    expect(covers(900, 350)).toBe(true);  // right
  });

  it('never produces a negative-size panel for an edge-hugging hole', () => {
    const hole = spotlightRect({ top: 0, left: 0, width: 1000, height: 800 }, VIEWPORT, 0);
    for (const p of scrimPanels(hole, VIEWPORT)) {
      expect(p.width).toBeGreaterThanOrEqual(0);
      expect(p.height).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('choosePlacement', () => {
  const hole = spotlightRect({ top: 300, left: 400, width: 200, height: 100 }, VIEWPORT, 0);

  it('honours the preferred side when it fits', () => {
    expect(choosePlacement(hole, CARD, VIEWPORT, 'top')).toBe('top');
    expect(choosePlacement(hole, CARD, VIEWPORT, 'right')).toBe('right');
  });

  it('falls back to another side when the preferred one is too tight', () => {
    // Anchor pinned to the bottom edge — no room underneath.
    const low = spotlightRect({ top: 740, left: 400, width: 200, height: 40 }, VIEWPORT, 0);
    expect(choosePlacement(low, CARD, VIEWPORT, 'bottom')).not.toBe('bottom');
  });

  it('centres when the card cannot fit beside the hole at all', () => {
    const tiny = { width: 300, height: 300 };
    expect(choosePlacement(hole, CARD, tiny, 'bottom')).toBe('center');
  });

  it('centres when there is no hole', () => {
    expect(choosePlacement(null, CARD, VIEWPORT, 'bottom')).toBe('center');
  });

  it('picks the roomiest side when nothing fits outright', () => {
    // Full-height hole with a wide gap on the right and a sliver on the left.
    const tall = spotlightRect({ top: 0, left: 40, width: 200, height: 800 }, VIEWPORT, 0);
    expect(choosePlacement(tall, CARD, VIEWPORT, 'top')).toBe('right');
  });
});

describe('placeTooltip', () => {
  const hole = spotlightRect({ top: 300, left: 400, width: 200, height: 100 }, VIEWPORT, 0);

  it('sits below and centred on the anchor for bottom placement', () => {
    const pos = placeTooltip(hole, CARD, VIEWPORT, 'bottom');
    expect(pos.placement).toBe('bottom');
    expect(pos.top).toBe(hole.bottom + TOOLTIP_GAP);
    expect(pos.left + CARD.width / 2).toBe(hole.left + hole.width / 2);
  });

  it('keeps the card inside the viewport when the anchor hugs an edge', () => {
    const corner = spotlightRect({ top: 20, left: 960, width: 30, height: 30 }, VIEWPORT, 0);
    const pos = placeTooltip(corner, CARD, VIEWPORT, 'right');
    expect(pos.left).toBeGreaterThanOrEqual(VIEWPORT_PAD);
    expect(pos.left + CARD.width).toBeLessThanOrEqual(VIEWPORT.width - VIEWPORT_PAD);
    expect(pos.top).toBeGreaterThanOrEqual(VIEWPORT_PAD);
    expect(pos.top + CARD.height).toBeLessThanOrEqual(VIEWPORT.height - VIEWPORT_PAD);
  });

  it('centres the card in the viewport when there is no anchor', () => {
    const pos = placeTooltip(null, CARD, VIEWPORT, 'bottom');
    expect(pos.placement).toBe('center');
    expect(pos.left).toBe((VIEWPORT.width - CARD.width) / 2);
    expect(pos.top).toBe((VIEWPORT.height - CARD.height) / 2);
  });

  it('stays on-screen on a phone-sized viewport', () => {
    const phone = { width: 390, height: 844 };
    const main = spotlightRect({ top: 140, left: 14, width: 300, height: 480 }, phone, 4);
    const card = { width: 366, height: 210 };
    const pos = placeTooltip(main, card, phone, 'bottom');
    expect(pos.left).toBeGreaterThanOrEqual(VIEWPORT_PAD);
    expect(pos.left + card.width).toBeLessThanOrEqual(phone.width - VIEWPORT_PAD);
    expect(pos.top + card.height).toBeLessThanOrEqual(phone.height - VIEWPORT_PAD);
  });
});
