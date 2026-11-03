import { assertPanelPresentation } from '../contracts/panels';
import type { PanelPresentation } from '../contracts/panels';
import { visualStates } from '../contracts/activities';
import type { VisualActivity } from '../contracts/activities';
import type { StationId } from '../contracts/office';
import { createOfficeLayout } from './office';
import { createCharacterFixture } from './characters';

export function createPanelFixture(): PanelPresentation {
  const information: Record<StationId, string> = {
    'central-analyst': 'Organiza a leitura visual dos cinco postos.',
    'btc-specialist': 'Apresenta a exposição BTC inteiramente fictícia.',
    'eth-specialist': 'Apresenta a exposição ETH inteiramente fictícia.',
    'opportunity-coordinator': 'Contextualiza atividades locais, sem sinais ou decisões de investimento.',
    'budget-manager': 'Exibe os saldos fictícios disponível e reservado.',
  };
  const data: PanelPresentation = {
    version: 1, fictional: true, label: 'SIMULAÇÃO · DADOS FICTÍCIOS', officeState: 'Escritório local · atividades visuais',
    portfolio: { currency: 'BRL', equityCents: 12_000_000, availableCents: 4_000_000, reservedCents: 1_000_000,
      positions: [{ asset: 'BTC', quantityLabel: '0,5000 BTC', exposureCents: 4_000_000 },
        { asset: 'ETH', quantityLabel: '4,0000 ETH', exposureCents: 3_000_000 }] },
    agents: createCharacterFixture(createOfficeLayout()).map(agent => ({ id: agent.id, stationId: agent.stationId, role: agent.role,
      activity: 'IDLE', information: information[agent.id] })),
  };
  assertPanelPresentation(data); return data;
}

/** Projeta somente os estados já calculados pelo relógio visual; não avança tempo. */
export function withVisualActivities(data: PanelPresentation, samples: readonly { agentId: StationId; activity: string }[]): PanelPresentation {
  if (samples.length !== 5 || data.agents.some(agent => samples.filter(sample => sample.agentId === agent.id).length !== 1) ||
    samples.some(sample => !visualStates.includes(sample.activity as VisualActivity))) throw new Error('Atividades visuais inválidas.');
  const next: PanelPresentation = { ...data, agents: data.agents.map(agent => ({ ...agent,
    activity: samples.find(sample => sample.agentId === agent.id)!.activity as VisualActivity })) };
  assertPanelPresentation(next); return next;
}
