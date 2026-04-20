import { describe, it, expect } from 'vitest';
import { parallelMap } from './concurrency.js';

describe('parallelMap', () => {
  it('preserves input order', async () => {
    const items = [3, 1, 2];
    const result = await parallelMap(items, 4, async (n) => {
      // Resolve in reverse-ish order so parallel ordering matters.
      await new Promise((r) => setTimeout(r, 10 - n * 2));
      return n * 10;
    });
    expect(result).toEqual([30, 10, 20]);
  });

  it('bounds in-flight work to the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);
    await parallelMap(items, 4, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
      return n;
    });
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  it('calls onEach once per completion with monotonic progress', async () => {
    const events = [];
    await parallelMap([1, 2, 3, 4, 5], 2, async (n) => n, (done, total) => {
      events.push({ done, total });
    });
    expect(events).toHaveLength(5);
    expect(events.map((e) => e.done)).toEqual([1, 2, 3, 4, 5]);
    expect(events[0].total).toBe(5);
  });

  it('returns [] for empty input', async () => {
    expect(await parallelMap([], 4, async () => 1)).toEqual([]);
  });
});
