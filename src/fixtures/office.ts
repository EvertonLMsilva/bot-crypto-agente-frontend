import { assertOfficeLayout } from '../contracts/office';
import type { OfficeLayout, OfficeRoom, OfficeStation, Rect } from '../contracts/office';

/** Planta de um pavimento: núcleo de análise/orçamento e estações periféricas. */
export function createOfficeLayout({ scale = 1 }: { scale?: number } = {}): OfficeLayout {
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('A escala deve ser positiva e finita.');
  const rect = (x: number, z: number, width: number, depth: number): Rect =>
    ({ x: x * scale, z: z * scale, width: width * scale, depth: depth * scale });
  const rooms: OfficeRoom[] = [
    { id: 'analysis', label: 'Análise central', color: '#58bba8', areas: [rect(-5.4, -3.6, 4.5, 3)], entrance: rect(-5.7, -3.2, 0.6, 1.8) },
    { id: 'btc', label: 'Estação BTC', color: '#f49b32', areas: [rect(-8.6, 4.4, 8, 3.2)], entrance: rect(-8.3, 4.1, 1.8, 0.6) },
    { id: 'eth', label: 'Estação ETH', color: '#4f96e5', areas: [rect(0.6, 4.4, 8, 3.2)], entrance: rect(6.5, 4.1, 1.8, 0.6) },
    { id: 'coordination', label: 'Coordenação de oportunidades', color: '#8bafaa', areas: [rect(-5.4, -0.6, 4.5, 3.2)], entrance: rect(-5.7, 0.1, 0.6, 1.8) },
    { id: 'budget', label: 'Gestão de orçamento', color: '#c7ab79', areas: [rect(0.9, -3.6, 4.5, 6.2)], entrance: rect(5.1, 0, 0.6, 1.8) },
    { id: 'circulation', label: 'Circulação compartilhada', color: '#797873', areas: [
      rect(-8.6, -7.6, 17.2, 4), rect(-8.6, -3.8, 3.2, 8.2), rect(5.4, -3.8, 3.2, 8.2),
      rect(-8.6, 2.6, 17.2, 1.8), rect(-0.9, -3.8, 1.8, 8.2),
    ] },
  ];
  const station = (id: OfficeStation['id'], roomId: OfficeStation['roomId'], label: string, x: number, z: number, orientation = 0): OfficeStation => ({
    id, roomId, label, color: rooms.find(room => room.id === roomId)!.color,
    position: { x: x * scale, y: 0, z: z * scale }, orientation,
    footprint: { width: 2.7 * scale, depth: 2.8 * scale, offsetZ: -0.4 * scale },
  });
  const wall = (id: string, x: number, z: number, width: number, depth: number, height = 2.1) =>
    ({ id, bounds: rect(x - width / 2, z - depth / 2, width, depth), height });
  const walls = [
    wall('north', 0, -7.8, 17.8, 0.14, 2.65), wall('west', -8.8, 0, 0.14, 15.6, 1.1),
    wall('analysis-north', -3.15, -3.6, 4.5, 0.08), wall('analysis-east', -0.9, -0.5, 0.08, 6.2),
    wall('analysis-front', -3.15, 2.6, 4.5, 0.08),
    wall('analysis-west-back', -5.4, -3.4, 0.08, 0.4), wall('analysis-west-middle', -5.4, -0.65, 0.08, 1.5),
    wall('analysis-west-front', -5.4, 2.25, 0.08, 0.7),
    wall('budget-north', 3.15, -3.6, 4.5, 0.08), wall('budget-west', 0.9, -0.5, 0.08, 6.2),
    wall('budget-front', 3.15, 2.6, 4.5, 0.08), wall('budget-east-back', 5.4, -1.8, 0.08, 3.6),
    wall('budget-east-front', 5.4, 2.2, 0.08, 0.8),
  ];
  const layout: OfficeLayout = { scale, floor: rect(-9, -8, 18, 16), rooms, walls, stations: [
    station('central-analyst', 'analysis', 'ANÁLISE', -3.15, -1.6),
    station('btc-specialist', 'btc', 'BTC', -5, 6.2),
    station('eth-specialist', 'eth', 'ETH', 5, 6.2),
    station('opportunity-coordinator', 'coordination', 'COORDENAÇÃO', -3.15, 1.2),
    station('budget-manager', 'budget', 'ORÇAMENTO', 3.15, 0.5),
  ] };
  assertOfficeLayout(layout); return layout;
}
