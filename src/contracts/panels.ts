import { stationIds } from './office';
import type { StationId } from './office';
import { visualStates } from './activities';
import type { VisualActivity } from './activities';

/** Apenas valores de apresentação, em centavos fictícios. Não é um ledger. */
export interface PortfolioPresentation {
  readonly currency: 'BRL';
  readonly equityCents: number;
  readonly availableCents: number;
  readonly reservedCents: number;
  readonly positions: readonly { readonly asset: 'BTC' | 'ETH'; readonly quantityLabel: string; readonly exposureCents: number }[];
}
export interface AgentPanel {
  readonly id: StationId;
  readonly stationId: StationId;
  readonly role: string;
  readonly activity: VisualActivity;
  readonly information: string;
}
export interface PanelPresentation {
  readonly version: 1;
  readonly fictional: true;
  readonly label: 'SIMULAÇÃO · DADOS FICTÍCIOS';
  readonly officeState: string;
  readonly portfolio: PortfolioPresentation;
  readonly agents: readonly AgentPanel[];
}
export const activityLabels: Record<VisualActivity, string> = {
  IDLE: 'Em espera', WORKING: 'Trabalho visual', WALKING: 'Em deslocamento', MEETING: 'Reunião visual',
};
export function assertPanelPresentation(data: PanelPresentation): void {
  const fail = () => { throw new Error('Apresentação fictícia inválida ou inconsistente.'); };
  const p = data.portfolio;
  if (data.version !== 1 || data.fictional !== true || data.label !== 'SIMULAÇÃO · DADOS FICTÍCIOS' || !data.officeState || p.currency !== 'BRL') fail();
  if (p.positions.length !== 2 || ['BTC', 'ETH'].some(asset => p.positions.filter(position => position.asset === asset).length !== 1)) fail();
  if (![p.equityCents, p.availableCents, p.reservedCents, ...p.positions.map(position => position.exposureCents)]
    .every(value => Number.isSafeInteger(value) && value >= 0) || p.positions.some(position => !position.quantityLabel)) fail();
  if (p.equityCents !== p.availableCents + p.reservedCents + p.positions.reduce((sum, position) => sum + position.exposureCents, 0)) fail();
  if (data.agents.length !== 5 || stationIds.some(id => data.agents.filter(agent => agent.id === id && agent.stationId === id).length !== 1) ||
    data.agents.some(agent => !agent.role || !agent.information || !visualStates.includes(agent.activity))) fail();
}
export function formatSimulatedMoney(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('Valor fictício inválido.');
  return `R$ ${Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${(cents % 100).toString().padStart(2, '0')}`;
}
