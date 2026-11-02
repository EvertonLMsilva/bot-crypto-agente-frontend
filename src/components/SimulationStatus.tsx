import type { SimulationSnapshot } from '../contracts/simulation';

export function SimulationStatus({ snapshot }: { snapshot: SimulationSnapshot }) {
  return <aside className="simulation" aria-label="Estado fictício da simulação">
    <p className="eyebrow">DADOS LOCAIS</p>
    <p className="simulation-state"><span className="dot" />Simulação fictícia · pausada</p>
    <p>Fixture determinística de referência. Nenhuma operação financeira é executada.</p>
    <dl><div><dt>Passo</dt><dd>{snapshot.tick.toString().padStart(2, '0')}</dd></div>
      <div><dt>Instante simulado · UTC</dt><dd><time dateTime={snapshot.timestamp}>01 jan 2026 · 00:00</time></dd></div>
      <div><dt>Origem</dt><dd>Fixture local / v{snapshot.version}</dd></div></dl>
  </aside>;
}
