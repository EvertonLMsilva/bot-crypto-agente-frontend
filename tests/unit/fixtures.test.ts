import { describe, expect, it, vi } from 'vitest';
import { createSnapshot } from '../../src/fixtures/simulation';
import { isSimulationSnapshot } from '../../src/contracts/simulation';

describe('contrato e fixtures locais', () => {
  it('publica um snapshot fictício válido', () => {
    expect(isSimulationSnapshot(createSnapshot())).toBe(true);
    expect(createSnapshot()).toEqual({ version: 1, source: 'local-fixture', fictional: true,
      state: 'paused', tick: 0, timestamp: '2026-01-01T00:00:00.000Z' });
  });
  it.each([null, {}, { ...{ version: 1 }, fictional: false },
    { ...createSnapshot(), tick: -1 }, { ...createSnapshot(), timestamp: 'invalid' },
    { ...createSnapshot(), source: 'remote' }, { ...createSnapshot(), state: 'trading' }])(
    'rejeita contrato inválido: %j', value => expect(isSimulationSnapshot(value)).toBe(false));
  it('é determinístico, imutável e não consulta rede, relógio ou aleatoriedade', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const random = vi.spyOn(Math, 'random');
    const clock = vi.spyOn(Date, 'now');
    const first = createSnapshot();
    expect(first).toEqual(createSnapshot());
    expect(Object.isFrozen(first)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
    expect(clock).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
