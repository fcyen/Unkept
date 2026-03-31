/**
 * Strategy registry — maps stage names to available strategy implementations.
 *
 * Adding a new strategy:
 *   1. Create a file in stages/ that exports a function with the stage's signature
 *   2. Import it here and add it to the appropriate stage entry
 *   3. Reference it in the pipeline config: { cluster: { strategy: "day" } }
 */

// Strategies will be registered as pipeline stages are implemented.
// Each entry maps a strategy name to its function.
//
// Example (filled in by subsequent PRs):
//   import { clusterByDay } from './stages/cluster.js';
//   import { selectMiddle } from './stages/heroSelect.js';

const strategies = {
  cluster: {
    // day: clusterByDay,
  },
  heroSelect: {
    // middle: selectMiddle,
  },
  dedup: {
    // default: dedup,
  },
};

/**
 * Look up a strategy function by stage name and strategy name.
 * @param {string} stageName - e.g. "cluster"
 * @param {string} strategyName - e.g. "day"
 * @returns {Function}
 */
export function getStrategy(stageName, strategyName) {
  const stage = strategies[stageName];
  if (!stage) {
    throw new Error(`Unknown pipeline stage: "${stageName}"`);
  }
  const fn = stage[strategyName];
  if (!fn) {
    throw new Error(`Unknown strategy "${strategyName}" for stage "${stageName}". Available: ${Object.keys(stage).join(', ')}`);
  }
  return fn;
}

/**
 * Register a strategy at runtime.
 * @param {string} stageName
 * @param {string} strategyName
 * @param {Function} fn
 */
export function registerStrategy(stageName, strategyName, fn) {
  if (!strategies[stageName]) {
    strategies[stageName] = {};
  }
  strategies[stageName][strategyName] = fn;
}

export default strategies;
