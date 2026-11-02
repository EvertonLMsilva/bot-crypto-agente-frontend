import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Box3, Mesh, Sprite, Vector3 } from 'three';
import { createOfficeLayout } from '../../src/fixtures/office';
import { assertOfficeLayout, intersects, stationBounds, stationIds } from '../../src/contracts/office';
import { createOffice } from '../../src/scene/createOffice';

describe('layout espacial do escritório 2.2', () => {
  beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect: vi.fn(), fillText: vi.fn(), measureText: () => ({ width: 100 }),
  } as unknown as CanvasRenderingContext2D));
  afterEach(() => vi.restoreAllMocks());
  it.each([0.75, 1, 1.25, 2])('alinha núcleo central e periferia à DEC-003 na escala %s', scale => {
    const layout = createOfficeLayout({ scale });
    const byId = (id: string) => layout.stations.find(station => station.id === id)!;
    expect(byId('central-analyst').position.x).toBeLessThan(0);
    expect(byId('budget-manager').position.x).toBeGreaterThan(0);
    expect(Math.abs(byId('budget-manager').position.x)).toBeLessThan(4 * scale);
    expect(byId('opportunity-coordinator').position.x).toBe(byId('central-analyst').position.x);
    for (const id of ['btc-specialist', 'eth-specialist']) {
      expect(Math.abs(byId(id).position.x)).toBeGreaterThan(4 * scale);
      expect(byId(id).position.z).toBeGreaterThan(4 * scale);
    }
    expect(() => assertOfficeLayout(layout)).not.toThrow();
  });
  it('possui piso neutro, madeira, vidro, decoração e placas integradas', () => {
    const office = createOffice(createOfficeLayout());
    expect(office.getObjectByName('wood-desks')).toBeUndefined();
    expect(office.getObjectByName('floor')!.userData.surface).toBe('neutral-tile');
    expect(office.getObjectByName('glass:analysis-east')).toBeDefined();
    expect(office.getObjectByName('plants')!.children.length).toBeGreaterThanOrEqual(6);
    for (const id of stationIds) {
      const station = office.getObjectByName(id)!;
      expect(station.getObjectByName('desk')!.userData.surface).toBe('wood');
      expect(station.getObjectByName('keyboard')).toBeDefined();
      expect(station.getObjectByName('drawer')).toBeDefined();
      expect(station.getObjectByName('station-label')!.type).toBe('Mesh');
    }
  });
  it('inclui análise central, BTC, ETH, coordenação, orçamento e circulação', () => {
    expect(createOfficeLayout().rooms.map(room => room.id).sort()).toEqual(
      ['analysis', 'btc', 'eth', 'coordination', 'budget', 'circulation'].sort());
  });
  it('publica exatamente os cinco postos únicos, com posição e orientação finitas', () => {
    const layout = createOfficeLayout();
    expect(layout.stations.map(station => station.id).sort()).toEqual([...stationIds].sort());
    expect(new Set(layout.stations.map(station => station.id)).size).toBe(5);
    for (const station of layout.stations) {
      expect([station.position.x, station.position.y, station.position.z, station.orientation].every(Number.isFinite)).toBe(true);
      expect(station.position.y).toBe(0);
    }
  });
  it('é determinístico e configurável sem rede, backend ou relógio', () => {
    expect(createOfficeLayout()).toEqual(createOfficeLayout());
    const normal = createOfficeLayout(); const larger = createOfficeLayout({ scale: 1.25 });
    expect(larger.floor.width).toBe(normal.floor.width * 1.25);
    expect(larger.stations[1].position.x).toBe(normal.stations[1].position.x * 1.25);
    expect(() => assertOfficeLayout(larger)).not.toThrow();
  });
  it.each([0, -1, NaN, Infinity])('rejeita escala inválida %s', scale => {
    expect(() => createOfficeLayout({ scale })).toThrow();
  });
  it('mantém footprints dentro das salas e separados dos demais postos e divisórias', () => {
    const layout = createOfficeLayout();
    expect(() => assertOfficeLayout(layout)).not.toThrow();
    for (const station of layout.stations) {
      const bounds = stationBounds(station);
      for (const wall of layout.walls) expect(intersects(bounds, wall.bounds)).toBe(false);
      for (const other of layout.stations) if (other.id !== station.id)
        expect(intersects(bounds, stationBounds(other))).toBe(false);
    }
  });
  it('conserva portas abertas e circulação conectada para as cinco salas', () => {
    const layout = createOfficeLayout();
    const circulation = layout.rooms.find(room => room.id === 'circulation')!;
    // A planta aprovada exige uma circulação ao redor do núcleo, em vez da cruz anterior.
    const reached = new Set([0]);
    for (let pass = 0; pass < circulation.areas.length; pass++)
      circulation.areas.forEach((area, index) => { if ([...reached].some(other => intersects(area, circulation.areas[other]))) reached.add(index); });
    expect(reached.size).toBe(circulation.areas.length);
    for (const room of layout.rooms.filter(room => room.id !== 'circulation')) {
      expect(room.entrance).toBeDefined();
      expect(Math.max(room.entrance!.width, room.entrance!.depth)).toBeGreaterThanOrEqual(1.6);
      for (const wall of layout.walls) expect(intersects(room.entrance!, wall.bounds)).toBe(false);
      for (const station of layout.stations) expect(intersects(room.entrance!, stationBounds(station))).toBe(false);
      expect(circulation.areas.some(area => intersects(area, room.entrance!))).toBe(true);
      expect(room.areas.some(area => intersects(area, room.entrance!))).toBe(true);
    }
  });
  it('rejeita postos duplicados e interseção com divisórias', () => {
    const layout = createOfficeLayout();
    expect(() => assertOfficeLayout({ ...layout, stations: [layout.stations[0], ...layout.stations] })).toThrow();
    const bad = { ...layout.stations[0], position: { x: -2.55, y: 0 as const, z: -4 } };
    expect(() => assertOfficeLayout({ ...layout, stations: [bad, ...layout.stations.slice(1)] })).toThrow();
  });
  it('constrói um pavimento e cinco grupos nomeados, sem personagens', () => {
    const layout = createOfficeLayout(); const office = createOffice(layout);
    for (const station of layout.stations) {
      const group = office.getObjectByName(station.id)!;
      expect(group).toBeDefined();
      expect(group.position.toArray()).toEqual([station.position.x, 0, station.position.z]);
      expect(group.rotation.y).toBe(station.orientation);
      expect(group.getObjectByName('desk')).toBeDefined();
      expect(group.getObjectByName('chair')).toBeDefined();
    }
    expect(office.getObjectByName('floor')).toBeDefined();
    expect(office.getObjectByName('characters')).toBeUndefined();
  });
  it.each([1, 1.25])('a geometria física dos móveis permanece no footprint com escala %s', scale => {
    const layout = createOfficeLayout({ scale }); const office = createOffice(layout); office.updateMatrixWorld(true);
    for (const station of layout.stations) {
      const bounds = stationBounds(station); const group = office.getObjectByName(station.id)!;
      group.traverse(node => {
        if (!(node instanceof Mesh) || node instanceof Sprite) return;
        const box = new Box3().setFromObject(node);
        expect(box.min.x).toBeGreaterThanOrEqual(bounds.x - 0.001);
        expect(box.max.x).toBeLessThanOrEqual(bounds.x + bounds.width + 0.001);
        expect(box.min.z).toBeGreaterThanOrEqual(bounds.z - 0.001);
        expect(box.max.z).toBeLessThanOrEqual(bounds.z + bounds.depth + 0.001);
      });
      expect(new Box3().setFromObject(group.getObjectByName('desk')!).getSize(new Vector3()).x).toBeGreaterThan(1);
    }
  });
});
