import type { SimulationSnapshot } from '../contracts/simulation';

export function createSnapshot(): SimulationSnapshot {
  return Object.freeze({ version: 1, source: 'local-fixture', fictional: true,
    state: 'paused', tick: 0, timestamp: '2026-01-01T00:00:00.000Z' });
}
