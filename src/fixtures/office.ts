import { assertOfficeLayout } from '../contracts/office';
import type { OfficeLayout, OfficeRoom, OfficeStation, Rect } from '../contracts/office';

/** Escala horizontal uniforme. Aumenta salas, móveis, portas e âncoras em conjunto. */
export function createOfficeLayout({ scale = 1 }: { scale?: number } = {}): OfficeLayout {
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('A escala deve ser positiva e finita.');
  const rect = (x: number, z: number, width: number, depth: number): Rect =>
    ({ x: x * scale, z: z * scale, width: width * scale, depth: depth * scale });
  const rooms: OfficeRoom[] = [
    { id: 'analysis', label: 'Análise central', color: '#5be0bb', areas: [rect(-2.4, -6.4, 4.8, 5)], entrance: rect(-0.9, -1.7, 1.8, 0.6) },
    { id: 'btc', label: 'Estação BTC', color: '#efc67b', areas: [rect(-8.6, -6.4, 5.9, 5)], entrance: rect(-6.55, -1.7, 1.8, 0.6) },
    { id: 'eth', label: 'Estação ETH', color: '#77aaff', areas: [rect(2.7, -6.4, 5.9, 5)], entrance: rect(4.75, -1.7, 1.8, 0.6) },
    { id: 'coordination', label: 'Coordenação de oportunidades', color: '#b7a0ee', areas: [rect(-8.6, 1.4, 7, 5)], entrance: rect(-5.9, 1.1, 1.8, 0.6) },
    { id: 'budget', label: 'Gestão de orçamento', color: '#ee9d88', areas: [rect(1.6, 1.4, 7, 5)], entrance: rect(4.1, 1.1, 1.8, 0.6) },
    { id: 'circulation', label: 'Circulação compartilhada', color: '#506579', areas: [rect(-8.6, -1.4, 17.2, 2.8), rect(-1.2, 1.2, 2.4, 5.2)] },
  ];
  const station = (id: OfficeStation['id'], roomId: OfficeStation['roomId'], label: string,
    x: number, z: number, orientation = 0): OfficeStation => ({
    id, roomId, label, color: rooms.find(room => room.id === roomId)!.color,
    position: { x: x * scale, y: 0, z: z * scale }, orientation,
    footprint: { width: 2.7 * scale, depth: 2.8 * scale, offsetZ: -0.4 * scale },
  });
  const wall = (id: string, x: number, z: number, width: number, depth: number, height = 0.72) =>
    ({ id, bounds: rect(x - width / 2, z - depth / 2, width, depth), height });
  const walls = [
    wall('north', 0, -6.7, 17.8, 0.16, 1.15), wall('west', -8.8, 0, 0.16, 13.4, 1.15),
    wall('analysis-west', -2.55, -3.95, 0.14, 5.1), wall('analysis-east', 2.55, -3.95, 0.14, 5.1),
    wall('coordination-east', -1.4, 3.95, 0.14, 5.1), wall('budget-west', 1.4, 3.95, 0.14, 5.1),
  ];
  for (const [id, x, width] of [
    ['btc-left', -7.65, 1.9], ['btc-right', -3.7, 1.8], ['analysis-left', -1.7, 1.3],
    ['analysis-right', 1.7, 1.3], ['eth-left', 3.7, 1.8], ['eth-right', 7.65, 1.9],
  ] as const) walls.push(wall(id, x, -1.4, width, 0.14));
  for (const [id, x, width] of [
    ['coordination-left', -7.3, 2.6], ['coordination-right', -2.75, 2.5],
    ['budget-left', 2.75, 2.5], ['budget-right', 7.3, 2.6],
  ] as const) walls.push(wall(id, x, 1.4, width, 0.14));
  const layout: OfficeLayout = { scale, floor: rect(-9, -7, 18, 14), rooms, walls, stations: [
    station('central-analyst', 'analysis', 'ANÁLISE CENTRAL', 0, -3.4),
    station('btc-specialist', 'btc', 'BTC', -5.65, -3.4),
    station('eth-specialist', 'eth', 'ETH', 5.65, -3.4),
    station('opportunity-coordinator', 'coordination', 'COORDENAÇÃO', -5, 3.4, Math.PI),
    station('budget-manager', 'budget', 'ORÇAMENTO', 5, 3.4, Math.PI),
  ] };
  assertOfficeLayout(layout);
  return layout;
}
