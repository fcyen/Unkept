/**
 * Run async work over a list with a bounded pool of concurrent workers.
 *
 * Why: most Phase 1 stages decode or hash photos one at a time via
 * `await createImageBitmap(...)`. On multi-core machines that leaves the
 * CPU idle most of the time. A small pool (default 4) is enough to keep
 * the browser busy without thrashing memory with too many decoded bitmaps.
 *
 * Preserves input order in the returned results array.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} concurrency  max concurrent workers (clamped to items.length)
 * @param {(item: T, index: number) => Promise<R>} work
 * @param {(done: number, total: number) => void} [onEach]
 *        called once per completed item, with a monotonic `done` count
 * @returns {Promise<R[]>}
 */
export async function parallelMap(items, concurrency, work, onEach) {
  const results = new Array(items.length);
  const total = items.length;
  if (total === 0) return results;

  let cursor = 0;
  let completed = 0;
  const runnerCount = Math.min(Math.max(1, concurrency), total);

  const runners = Array.from({ length: runnerCount }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= total) return;
      results[idx] = await work(items[idx], idx);
      completed++;
      if (onEach) onEach(completed, total);
    }
  });

  await Promise.all(runners);
  return results;
}

/**
 * Default concurrency for pipeline stages. Four workers is a pragmatic
 * sweet spot for phones (2 perf cores + 2 efficiency) and desktops
 * (GPU-bound image decode saturates well before this).
 */
export const DEFAULT_STAGE_CONCURRENCY = 4;
