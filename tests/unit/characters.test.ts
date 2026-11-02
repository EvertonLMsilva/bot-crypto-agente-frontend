import { describe, expect, it } from 'vitest';
import { Box3, Mesh, Vector3 } from 'three';
import { assertCharacters, characterBounds } from '../../src/contracts/characters';
import { createCharacterFixture } from '../../src/fixtures/characters';
import { createOfficeLayout } from '../../src/fixtures/office';
import { createCharacters } from '../../src/scene/createCharacters';
import { createOffice, disposeOffice } from '../../src/scene/createOffice';
import { intersects, stationBounds } from '../../src/contracts/office';
import { vi } from 'vitest';

describe('cinco personagens fictícios estáticos', () => {
  const expected = ['central-analyst', 'btc-specialist', 'eth-specialist', 'opportunity-coordinator', 'budget-manager'];
  it('publica exatamente cinco IDs únicos e funções com correspondência exata ao posto', () => {
    const layout = createOfficeLayout(); const characters = createCharacterFixture(layout);
    expect(characters.map(character => character.id)).toEqual(expected);
    expect(new Set(characters.map(character => character.id)).size).toBe(5);
    for (const character of characters) {
      expect(character.stationId).toBe(character.id);
      expect(character.role.length).toBeGreaterThan(5);
      expect(character.fictional).toBe(true); expect(character.state).toBe('idle');
    }
  });
  it('usa dados locais determinísticos, sem rede, aleatoriedade ou relógio', () => {
    const layout = createOfficeLayout();
    const fetchSpy = vi.spyOn(globalThis, 'fetch'); const clock = vi.spyOn(Date, 'now'); const random = vi.spyOn(Math, 'random');
    try {
      expect(createCharacterFixture(layout)).toEqual(createCharacterFixture(layout));
      expect(fetchSpy).not.toHaveBeenCalled(); expect(clock).not.toHaveBeenCalled(); expect(random).not.toHaveBeenCalled();
    } finally { vi.restoreAllMocks(); }
  });
  it.each([0.75, 1, 1.25, 2])('conserva posição, orientação e limites na escala %s', scale => {
    const layout = createOfficeLayout({ scale }); const characters = createCharacterFixture(layout);
    expect(() => assertCharacters(characters, layout)).not.toThrow();
    for (const character of characters) {
      const station = layout.stations.find(station => station.id === character.stationId)!;
      const bounds = characterBounds(character); const reserved = stationBounds(station);
      expect(character.transform.rotationY).toBe(station.orientation);
      expect(character.transform.scale).toEqual({ x: scale, y: 1, z: scale });
      expect(bounds.x).toBeGreaterThanOrEqual(reserved.x);
      expect(bounds.z).toBeGreaterThanOrEqual(reserved.z);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(reserved.x + reserved.width);
      expect(bounds.z + bounds.depth).toBeLessThanOrEqual(reserved.z + reserved.depth);
      for (const wall of layout.walls) expect(intersects(bounds, wall.bounds)).toBe(false);
      for (const other of characters) if (other.id !== character.id) expect(intersects(bounds, characterBounds(other))).toBe(false);
    }
    // Âncoras da nova planta DEC-003: BTC periférico e gestor no núcleo.
    expect(characters[1].transform.position.x).toBeCloseTo(-4.07 * scale);
    expect(characters[1].transform.position.z).toBeCloseTo(6.72 * scale);
    expect(characters[4].transform.position.x).toBeCloseTo(4.08 * scale);
    expect(characters[4].transform.position.z).toBeCloseTo(1.02 * scale);
  });
  it('distingue os cinco personagens por cor e acessório', () => {
    const characters = createCharacterFixture(createOfficeLayout());
    expect(new Set(characters.map(character => character.appearance.color)).size).toBe(5);
    expect(new Set(characters.map(character => character.appearance.accessory)).size).toBe(5);
  });
  it('rejeita duplicação, posto trocado, posição obstruída e orientação divergente', () => {
    const layout = createOfficeLayout(); const characters = createCharacterFixture(layout); const first = characters[0];
    expect(() => assertCharacters([first, ...characters], layout)).toThrow();
    expect(() => assertCharacters([{ ...first, stationId: 'btc-specialist' }, ...characters.slice(1)], layout)).toThrow();
    expect(() => assertCharacters([{ ...first, transform: { ...first.transform, position: { x: 100, y: 0, z: 0 } } }, ...characters.slice(1)], layout)).toThrow();
    expect(() => assertCharacters([{ ...first, transform: { ...first.transform, rotationY: 1 } }, ...characters.slice(1)], layout)).toThrow();
  });
  it.each([0.75, 1, 1.25, 2])('renderiza cinco humanoides sem cruzar móveis na escala %s', scale => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: vi.fn(), fillText: vi.fn() } as unknown as CanvasRenderingContext2D);
    const layout = createOfficeLayout({ scale }); const fixture = createCharacterFixture(layout);
    const office = createOffice(layout); const group = createCharacters(fixture, layout);
    try {
      office.updateMatrixWorld(true); group.updateMatrixWorld(true); expect(group.children).toHaveLength(5);
      for (const character of fixture) {
        const model = group.getObjectByName(`character:${character.id}`)!;
        expect(model.position.toArray()).toEqual(Object.values(character.transform.position));
        expect(model.rotation.y).toBe(character.transform.rotationY);
        for (const part of ['head', 'torso', 'left-arm', 'right-arm', 'left-leg', 'right-leg', 'accessory']) expect(model.getObjectByName(part)).toBeDefined();
        const body = new Box3().setFromObject(model);
        const declared = characterBounds(character);
        expect(body.min.x).toBeGreaterThanOrEqual(declared.x - 0.001);
        expect(body.max.x).toBeLessThanOrEqual(declared.x + declared.width + 0.001);
        expect(body.min.z).toBeGreaterThanOrEqual(declared.z - 0.001);
        expect(body.max.z).toBeLessThanOrEqual(declared.z + declared.depth + 0.001);
        expect(body.getSize(new Vector3()).y).toBeGreaterThan(1.5);
        office.traverse(node => {
          if (node instanceof Mesh) expect(body.intersectsBox(new Box3().setFromObject(node)), `${character.id} / ${node.name}`).toBe(false);
        });
      }
    } finally { disposeOffice(group); disposeOffice(office); context.mockRestore(); }
  });
});
