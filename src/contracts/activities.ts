import { intersects } from './office';
import type { OfficeLayout, Rect, StationId } from './office';

export const visualStates = ['IDLE', 'WORKING', 'WALKING', 'MEETING'] as const;
export type VisualActivity = typeof visualStates[number];
export interface VisualPoint { readonly x: number; readonly y: number; readonly z: number }
export interface ActivityPlan {
  readonly agentId: StationId;
  readonly stationId: StationId;
  readonly homeRotation: number;
  readonly route: readonly VisualPoint[];
  readonly speed: number;
  readonly meetingRotation: number;
  readonly fallback?: 'unsafe-route';
}
export interface ActivityFixture {
  readonly version: 1;
  readonly fictional: true;
  readonly radius: number;
  readonly idleMs: number;
  readonly workingMs: number;
  readonly turnMs: number;
  readonly meetingMs: number;
  readonly travelWindowMs: number;
  readonly cycleMs: number;
  readonly plans: readonly ActivityPlan[];
}
export interface ActivitySample {
  readonly agentId: StationId;
  readonly stationId: StationId;
  readonly activity: VisualActivity;
  readonly position: VisualPoint;
  readonly rotationY: number;
  readonly gait: number;
  readonly gesture: number;
}

/** Varredura conservadora de segmentos locais, sem navegação dinâmica ou física. */
export function isRouteSafe(route: readonly VisualPoint[], obstacles: readonly Rect[], layout: OfficeLayout, radius: number): boolean {
  if (route.length < 2 || !Number.isFinite(radius) || radius <= 0) return false;
  const f = layout.floor;
  const inside = (p: VisualPoint) => [p.x, p.y, p.z].every(Number.isFinite) && p.y === 0 &&
    p.x - radius >= f.x && p.x + radius <= f.x + f.width && p.z - radius >= f.z && p.z + radius <= f.z + f.depth;
  if (!route.every(inside)) return false;
  for (let index = 1; index < route.length; index++) {
    const a = route[index - 1], b = route[index];
    const sweep = { x: Math.min(a.x, b.x) - radius, z: Math.min(a.z, b.z) - radius,
      width: Math.abs(a.x - b.x) + radius * 2, depth: Math.abs(a.z - b.z) + radius * 2 };
    if (obstacles.some(obstacle => intersects(sweep, obstacle))) return false;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (0.1 * layout.scale)));
    for (let step = 0; step <= steps; step++) {
      const x = a.x + (b.x - a.x) * step / steps, z = a.z + (b.z - a.z) * step / steps;
      if (!layout.rooms.some(room => room.areas.some(area => x >= area.x - 1e-8 && x <= area.x + area.width + 1e-8 && z >= area.z - 1e-8 && z <= area.z + area.depth + 1e-8))) return false;
    }
  }
  return true;
}
export function routeDuration(route: readonly VisualPoint[], speed: number, turnMs: number): number {
  if (route.length < 2) return 0;
  return route.slice(1).reduce((sum, point, index) => sum + turnMs + Math.hypot(point.x - route[index].x, point.z - route[index].z) / speed * 1000, turnMs);
}
