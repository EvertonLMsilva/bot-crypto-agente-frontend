/** Contrato apenas visual da fixture 2.1; não representa o runtime financeiro. */
export interface SimulationSnapshot {
  readonly version: 1;
  readonly source: 'local-fixture';
  readonly fictional: true;
  readonly state: 'paused';
  readonly tick: number;
  readonly timestamp: string;
}

export function isSimulationSnapshot(value: unknown): value is SimulationSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Record<string, unknown>;
  return data.version === 1 && data.source === 'local-fixture' && data.fictional === true &&
    data.state === 'paused' && Number.isSafeInteger(data.tick) && (data.tick as number) >= 0 &&
    typeof data.timestamp === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(data.timestamp) &&
    Number.isFinite(Date.parse(data.timestamp)) && new Date(data.timestamp).toISOString() === data.timestamp;
}
