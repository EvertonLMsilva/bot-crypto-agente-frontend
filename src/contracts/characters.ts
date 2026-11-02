import { assertOfficeLayout, intersects, stationBounds, stationIds } from './office';
import type { OfficeLayout, Rect, StationId } from './office';

export type CharacterAccessory = 'headset' | 'cap' | 'bun' | 'glasses' | 'tie';
/** Dados de apresentação locais; não representam agentes executáveis do backend. */
export interface CharacterPresentation {
  readonly id: StationId;
  readonly role: string;
  readonly stationId: StationId;
  readonly fictional: true;
  readonly state: 'idle';
  readonly transform: {
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
    readonly rotationY: number;
    readonly scale: { readonly x: number; readonly y: number; readonly z: number };
  };
  readonly appearance: { readonly color: string; readonly skin: string; readonly hair: string; readonly accessory: CharacterAccessory };
}

/** Envelope máximo do modelo estático, centrado na âncora, em coordenadas locais. */
export const characterSize = { width: 0.68, depth: 0.6, height: 1.82 } as const;
export function characterBounds(character: CharacterPresentation): Rect {
  const { position, rotationY, scale } = character.transform;
  const cos = Math.abs(Math.cos(rotationY)); const sin = Math.abs(Math.sin(rotationY));
  const width = cos * characterSize.width * scale.x + sin * characterSize.depth * scale.z;
  const depth = sin * characterSize.width * scale.x + cos * characterSize.depth * scale.z;
  return { x: position.x - width / 2, z: position.z - depth / 2, width, depth };
}
export function assertCharacters(characters: readonly CharacterPresentation[], layout: OfficeLayout): void {
  assertOfficeLayout(layout);
  const fail = () => { throw new Error('Personagens fictícios inválidos ou fora dos respectivos postos.'); };
  if (characters.length !== 5 || stationIds.some(id => characters.filter(character => character.id === id).length !== 1)) fail();
  for (const character of characters) {
    const station = layout.stations.find(station => station.id === character.stationId);
    const { position, scale, rotationY } = character.transform;
    if (!station || character.id !== character.stationId || !character.role.trim() || character.fictional !== true || character.state !== 'idle' ||
      ![position.x, position.y, position.z, rotationY, scale.x, scale.y, scale.z].every(Number.isFinite) ||
      position.y !== 0 || scale.x !== layout.scale || scale.z !== layout.scale || scale.y !== 1 || rotationY !== station.orientation) fail();
    const allowed = stationBounds(station!); const bounds = characterBounds(character);
    const epsilon = 1e-8;
    if (bounds.x < allowed.x - epsilon || bounds.z < allowed.z - epsilon ||
      bounds.x + bounds.width > allowed.x + allowed.width + epsilon || bounds.z + bounds.depth > allowed.z + allowed.depth + epsilon ||
      layout.walls.some(wall => intersects(bounds, wall.bounds)) ||
      characters.some(other => other.id !== character.id && intersects(bounds, characterBounds(other)))) fail();
    if (![character.appearance.color, character.appearance.skin, character.appearance.hair].every(color => /^#[0-9a-f]{6}$/i.test(color)) ||
      !['headset', 'cap', 'bun', 'glasses', 'tie'].includes(character.appearance.accessory)) fail();
  }
}
