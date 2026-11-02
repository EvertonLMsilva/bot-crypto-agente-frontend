import { assertCharacters } from '../contracts/characters';
import type { CharacterPresentation } from '../contracts/characters';
import type { OfficeLayout, StationId } from '../contracts/office';

const identities: Record<StationId, { role: string; skin: string; hair: string; accessory: CharacterPresentation['appearance']['accessory'] }> = {
  'central-analyst': { role: 'Analista Central', skin: '#e3ad83', hair: '#39323c', accessory: 'headset' },
  'btc-specialist': { role: 'Especialista BTC', skin: '#8a5b43', hair: '#28252c', accessory: 'cap' },
  'eth-specialist': { role: 'Especialista ETH', skin: '#f1c6aa', hair: '#6b3f2d', accessory: 'bun' },
  'opportunity-coordinator': { role: 'Coordenador de Oportunidades', skin: '#c68b69', hair: '#342d33', accessory: 'glasses' },
  'budget-manager': { role: 'Gestor de Orçamento', skin: '#b47a58', hair: '#554a49', accessory: 'tie' },
};

export function createCharacterFixture(layout: OfficeLayout): readonly CharacterPresentation[] {
  const characters: CharacterPresentation[] = layout.stations.map(station => {
    const identity = identities[station.id];
    const cos = Math.cos(station.orientation); const sin = Math.sin(station.orientation);
    // Ao lado da cadeira, fora do volume da mesa. Nunca avança o estado da simulação.
    const x = 0.93 * layout.scale; const z = 0.52 * layout.scale;
    return {
      id: station.id, stationId: station.id, role: identity.role, fictional: true, state: 'idle',
      transform: { position: { x: station.position.x + cos * x + sin * z, y: 0,
        z: station.position.z - sin * x + cos * z }, rotationY: station.orientation,
      scale: { x: layout.scale, y: 1, z: layout.scale } },
      appearance: { color: ({ 'central-analyst': '#37526b', 'btc-specialist': '#3b4654', 'eth-specialist': '#ddd9ce',
        'opportunity-coordinator': '#506e67', 'budget-manager': '#595d68' })[station.id],
        skin: identity.skin, hair: identity.hair, accessory: identity.accessory },
    };
  });
  assertCharacters(characters, layout);
  return characters;
}
