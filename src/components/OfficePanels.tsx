import { activityLabels, formatSimulatedMoney } from '../contracts/panels';
import type { PanelPresentation } from '../contracts/panels';

const card = { border: '1px solid #2c3c4b', borderRadius: 8, padding: 16, background: '#121e2a', minWidth: 0 };
export function OfficePanels({ data }: { data: PanelPresentation }) {
  const p = data.portfolio;
  return <div style={{ padding: 14, display: 'grid', gap: 14, color: '#dce6ee', fontSize: 14, lineHeight: 1.6 }}>
    <section aria-label="Carteira fictícia BTC/ETH" style={card}>
      <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Carteira · {data.label}</h2>
      <p>{data.officeState}</p>
      <p>Nenhuma cotação, sinal ou operação real. Valores fixos de demonstração; não são preços de mercado.</p>
      <dl style={{ margin: 0, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        {[['Patrimônio fictício', p.equityCents], ['Saldo disponível fictício', p.availableCents], ['Capital reservado fictício', p.reservedCents]].map(([label, value]) =>
          <div key={label} style={{ padding: 8 }}><dt>{label}</dt><dd style={{ margin: 0 }}>{formatSimulatedMoney(value as number)}</dd></div>)}
        {p.positions.map(position => <div key={position.asset} style={{ padding: 8 }}>
          <dt>Exposição simulada {position.asset}</dt><dd style={{ margin: 0 }}>{formatSimulatedMoney(position.exposureCents)}<br />Posição fictícia: {position.quantityLabel}</dd>
        </div>)}
      </dl>
      <p style={{ marginBottom: 0 }}>Resumo visual: {data.agents.map(agent => `${agent.role}: ${activityLabels[agent.activity]}`).join(' · ')}</p>
    </section>
    <section aria-label="Painéis dos cinco agentes fictícios" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))' }}>
      {data.agents.map(agent => <article key={agent.id} data-agent-id={agent.id} aria-label={agent.role} style={{ ...card, overflowWrap: 'anywhere' }}>
        <span style={{ color: '#69dfbd', fontSize: 11 }}>SIMULAÇÃO · AGENTE FICTÍCIO</span>
        <h3 style={{ margin: '6px 0', fontSize: 16 }}>{agent.role}</h3>
        <p>ID: {agent.id}<br />Posto: {agent.stationId}</p>
        <p>Estado visual fictício: <strong>{activityLabels[agent.activity]}</strong><br />Atividade simulada: {agent.activity}</p>
        <p style={{ marginBottom: 0 }}>{agent.information}</p>
      </article>)}
    </section>
  </div>;
}
