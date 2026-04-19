/**
 * Compatibility check — runs on app load before any pipeline code.
 * Returns a result object with per-check booleans and an aggregate pass flag.
 *
 * deviceMemory is only exposed in Chromium (~85% of browsers); a missing value
 * is treated as a pass rather than a fail to avoid blocking Safari/Firefox.
 */
export function checkCompatibility() {
  const checks = {
    webWorkers: typeof Worker !== 'undefined',
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    minCores: (navigator.hardwareConcurrency || 0) >= 4,
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
  minCores: 'At least 4 CPU cores',
  minMemory: 'At least 4 GB of memory',
};
