/**
 * Compatibility check — runs on app load before any pipeline code.
 * Returns a result object with per-check booleans and an aggregate pass flag.
 *
 * deviceMemory is only exposed in Chromium (~85% of browsers); a missing value
 * is treated as a pass rather than a fail to avoid blocking Safari/Firefox.
 *
 * hardwareConcurrency is treated the same way: privacy browsers (e.g. Brave on iOS)
 * cap the value at 2 regardless of actual hardware, so missing = pass and the
 * threshold is 2 rather than 4.
 */
export function checkCompatibility() {
  const checks = {
    webWorkers: typeof Worker !== 'undefined',
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    minCores: !navigator.hardwareConcurrency || navigator.hardwareConcurrency >= 2,
    minMemory: !navigator.deviceMemory || navigator.deviceMemory >= 4,
  };

  return {
    checks,
    passed: Object.values(checks).every(Boolean),
  };
}

export const CHECK_LABELS = {
  webWorkers: 'Web Workers',
  offscreenCanvas: 'OffscreenCanvas',
  minCores: 'At least 2 CPU cores',
  minMemory: 'At least 4 GB of memory',
};
