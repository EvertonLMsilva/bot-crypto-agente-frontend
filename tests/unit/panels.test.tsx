import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { createOfficeLayout } from '../../src/fixtures/office';
import { createCharacterFixture } from '../../src/fixtures/characters';
import { createPanelFixture, withVisualActivities } from '../../src/fixtures/panels';
import { assertPanelPresentation } from '../../src/contracts/panels';
import { OfficePanels } from '../../src/components/OfficePanels';

afterEach(cleanup);
describe('painéis exclusivamente fictícios', () => {
  it('fixture determinística sem relógio, aleatoriedade ou rede', () => {
    const random = vi.spyOn(Math, 'random'), now = vi.spyOn(Date, 'now'), fetch = vi.spyOn(globalThis, 'fetch');
    try {
      expect(createPanelFixture()).toEqual(createPanelFixture());
      expect(random).not.toHaveBeenCalled(); expect(now).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    } finally { vi.restoreAllMocks(); }
  });
  it('totais em centavos conciliam disponível, reserva e exposições BTC/ETH', () => {
    const data = createPanelFixture(), p = data.portfolio;
    expect(p.equityCents).toBe(p.availableCents + p.reservedCents + p.positions.reduce((total, position) => total + position.exposureCents, 0));
    expect(p.positions.map(position => position.asset)).toEqual(['BTC', 'ETH']);
    expect(() => assertPanelPresentation(data)).not.toThrow();
    expect(() => assertPanelPresentation({ ...data, portfolio: { ...p, equityCents: p.equityCents + 1 } })).toThrow();
    expect(() => assertPanelPresentation({ ...data, portfolio: { ...p, availableCents: 0.5 } })).toThrow();
  });
  it('preserva os cinco IDs e papéis existentes e não modifica os dados ao atualizar atividades', () => {
    const data = createPanelFixture(), before = JSON.stringify(data);
    const identities = createCharacterFixture(createOfficeLayout());
    expect(data.agents.map(agent => [agent.id, agent.stationId, agent.role])).toEqual(identities.map(agent => [agent.id, agent.stationId, agent.role]));
    const next = withVisualActivities(data, identities.map(agent => ({ agentId: agent.id, activity: 'WALKING' })));
    expect(next.agents).toHaveLength(5); expect(next.agents.every(agent => agent.activity === 'WALKING')).toBe(true);
    expect(next.portfolio).toEqual(data.portfolio); expect(JSON.stringify(data)).toBe(before);
    expect(() => assertPanelPresentation({ ...data, agents: data.agents.slice(1) })).toThrow();
    expect(() => withVisualActivities(data, [{ agentId: 'btc-specialist', activity: 'REAL_TRADE' }])).toThrow();
  });
  it('mostra SIMULAÇÃO, carteira consistente e exatamente cinco painéis legíveis', () => {
    render(<OfficePanels data={createPanelFixture()} />);
    const portfolio = screen.getByRole('region', { name: 'Carteira fictícia BTC/ETH' });
    expect(within(portfolio).getByText('R$ 120.000,00')).toBeTruthy();
    expect(within(portfolio).getByText('R$ 10.000,00')).toBeTruthy();
    const panels = screen.getAllByRole('article'); expect(panels).toHaveLength(5);
    for (const panel of panels) { expect(panel.textContent).toContain('SIMULAÇÃO'); expect(panel.textContent).toContain('Posto:'); expect(panel.textContent).toContain('Em espera'); }
    expect(screen.getByText(/Nenhuma cotação, sinal ou operação real/)).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
