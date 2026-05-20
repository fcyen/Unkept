import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkCompatibility } from './compatibility.js';

function stubNavigator({ hardwareConcurrency, deviceMemory }) {
  const nav = { hardwareConcurrency };
  if (deviceMemory !== undefined) nav.deviceMemory = deviceMemory;
  vi.stubGlobal('navigator', nav);
}

describe('checkCompatibility', () => {
  beforeEach(() => {
    vi.stubGlobal('Worker', class {});
    vi.stubGlobal('OffscreenCanvas', class {});
    stubNavigator({ hardwareConcurrency: 8, deviceMemory: 8 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes when every requirement is met', () => {
    const result = checkCompatibility();
    expect(result.passed).toBe(true);
    expect(result.checks).toEqual({
      webWorkers: true,
      offscreenCanvas: true,
      minCores: true,
      minMemory: true,
    });
  });

  it('fails when Worker is unavailable', () => {
    vi.stubGlobal('Worker', undefined);
    const result = checkCompatibility();
    expect(result.checks.webWorkers).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('fails when OffscreenCanvas is unavailable', () => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    const result = checkCompatibility();
    expect(result.checks.offscreenCanvas).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('fails when fewer than 2 cores are reported', () => {
    stubNavigator({ hardwareConcurrency: 1, deviceMemory: 8 });
    const result = checkCompatibility();
    expect(result.checks.minCores).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('passes when 2 cores are reported (privacy browsers cap here)', () => {
    stubNavigator({ hardwareConcurrency: 2, deviceMemory: 8 });
    const result = checkCompatibility();
    expect(result.checks.minCores).toBe(true);
    expect(result.passed).toBe(true);
  });

  it('passes the core check when hardwareConcurrency is unreported (like deviceMemory)', () => {
    stubNavigator({ hardwareConcurrency: undefined, deviceMemory: 8 });
    const result = checkCompatibility();
    expect(result.checks.minCores).toBe(true);
    expect(result.passed).toBe(true);
  });

  it('fails when deviceMemory is reported below 4 GB', () => {
    stubNavigator({ hardwareConcurrency: 8, deviceMemory: 2 });
    const result = checkCompatibility();
    expect(result.checks.minMemory).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('passes the memory check when deviceMemory is unreported (Safari/Firefox)', () => {
    stubNavigator({ hardwareConcurrency: 8, deviceMemory: undefined });
    const result = checkCompatibility();
    expect(result.checks.minMemory).toBe(true);
    expect(result.passed).toBe(true);
  });
});
