/** Referências espaciais visuais, em metros. Sem estados ou decisões financeiras. */
export const stationIds = ['central-analyst', 'btc-specialist', 'eth-specialist',
  'opportunity-coordinator', 'budget-manager'] as const;
export type StationId = typeof stationIds[number];
export type RoomId = 'analysis' | 'btc' | 'eth' | 'coordination' | 'budget' | 'circulation';
export interface Rect { readonly x: number; readonly z: number; readonly width: number; readonly depth: number }
export interface OfficeRoom {
  readonly id: RoomId;
  readonly label: string;
  readonly color: string;
  readonly areas: readonly Rect[];
  readonly entrance?: Rect;
}
export interface OfficeStation {
  readonly id: StationId;
  readonly roomId: RoomId;
  readonly label: string;
  readonly color: string;
  /** Âncora do futuro ocupante no piso; orientação em radianos, frente local -Z. */
  readonly position: { readonly x: number; readonly y: 0; readonly z: number };
  readonly orientation: number;
  /** Reserva de espaço local para móveis e cadeira, relativa à âncora. */
  readonly footprint: { readonly width: number; readonly depth: number; readonly offsetZ: number };
}
export interface OfficeLayout {
  readonly scale: number;
  readonly floor: Rect;
  readonly rooms: readonly OfficeRoom[];
  readonly stations: readonly OfficeStation[];
  readonly walls: readonly { readonly id: string; readonly bounds: Rect; readonly height: number }[];
}

export function intersects(a: Rect, b: Rect): boolean {
  const epsilon = 1e-8;
  return a.x < b.x + b.width - epsilon && a.x + a.width > b.x + epsilon &&
    a.z < b.z + b.depth - epsilon && a.z + a.depth > b.z + epsilon;
}
function contains(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x - 1e-8 && inner.z >= outer.z - 1e-8 &&
    inner.x + inner.width <= outer.x + outer.width + 1e-8 &&
    inner.z + inner.depth <= outer.z + outer.depth + 1e-8;
}
export function stationBounds(station: OfficeStation): Rect {
  const { width, depth, offsetZ } = station.footprint;
  const sin = Math.sin(station.orientation); const cos = Math.cos(station.orientation);
  const w = Math.abs(cos) * width + Math.abs(sin) * depth;
  const d = Math.abs(sin) * width + Math.abs(cos) * depth;
  return { x: station.position.x + sin * offsetZ - w / 2,
    z: station.position.z + cos * offsetZ - d / 2, width: w, depth: d };
}
export function assertOfficeLayout(layout: OfficeLayout): void {
  const fail = () => { throw new Error('Layout do escritório inválido ou com espaços obstruídos.'); };
  const validRect = (rect: Rect) => [rect.x, rect.z, rect.width, rect.depth].every(Number.isFinite) && rect.width > 0 && rect.depth > 0;
  if (!Number.isFinite(layout.scale) || layout.scale <= 0 || !validRect(layout.floor)) fail();
  const expectedRooms: RoomId[] = ['analysis', 'btc', 'eth', 'coordination', 'budget', 'circulation'];
  if (layout.rooms.length !== expectedRooms.length || new Set(layout.rooms.map(room => room.id)).size !== expectedRooms.length ||
    expectedRooms.some(id => !layout.rooms.some(room => room.id === id))) fail();
  if (layout.stations.length !== 5 || stationIds.some(id => layout.stations.filter(station => station.id === id).length !== 1)) fail();
  for (const wall of layout.walls) if (!validRect(wall.bounds) || !contains(layout.floor, wall.bounds) || !Number.isFinite(wall.height) || wall.height <= 0) fail();
  for (const room of layout.rooms) {
    if (!room.areas.length || room.areas.some(area => !validRect(area) || !contains(layout.floor, area))) fail();
    if (room.id !== 'circulation') {
      if (!room.entrance || !validRect(room.entrance) || !contains(layout.floor, room.entrance)) fail();
      else if (layout.walls.some(wall => intersects(room.entrance!, wall.bounds))) fail();
    }
  }
  for (const station of layout.stations) {
    if (![station.position.x, station.position.y, station.position.z, station.orientation, station.footprint.offsetZ].every(Number.isFinite) ||
      station.position.y !== 0 || !Number.isFinite(station.footprint.width) || !Number.isFinite(station.footprint.depth) ||
      station.footprint.width <= 0 || station.footprint.depth <= 0) fail();
    const bounds = stationBounds(station);
    const room = layout.rooms.find(room => room.id === station.roomId && room.id !== 'circulation');
    if (!room || !room.areas.some(area => contains(area, bounds))) fail();
    if (layout.walls.some(wall => intersects(bounds, wall.bounds)) ||
      layout.stations.some(other => other.id !== station.id && intersects(bounds, stationBounds(other))) ||
      layout.rooms.some(room => room.entrance && intersects(bounds, room.entrance))) fail();
  }
}
