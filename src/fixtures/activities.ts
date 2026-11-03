import { assertCharacters } from '../contracts/characters';
import type { CharacterPresentation } from '../contracts/characters';
import { isRouteSafe, routeDuration } from '../contracts/activities';
import type { ActivityFixture, ActivityPlan, VisualPoint } from '../contracts/activities';
import type { OfficeLayout, Rect } from '../contracts/office';

/** Roteiro exclusivamente visual. Não consome nem avança o relógio financeiro. */
export function createActivityFixture(layout: OfficeLayout, people: readonly CharacterPresentation[], obstacles: readonly Rect[]): ActivityFixture {
  assertCharacters(people, layout);
  const point = (x: number, z: number): VisualPoint => ({ x: x * layout.scale, y: 0, z: z * layout.scale });
  const radius = 0.47 * layout.scale, turnMs = 450;
  const plans: ActivityPlan[] = people.map(person => {
    const home = { ...person.transform.position };
    const isBtc = person.id === 'btc-specialist', isEth = person.id === 'eth-specialist', isBudget = person.id === 'budget-manager';
    const goal = point(isBudget ? 0 : isBtc || person.id === 'central-analyst' || person.id === 'opportunity-coordinator' ? -1.8 : 1.8, 3.6);
    const candidate = isBtc || isEth ? [home, point(isBtc ? -3 : 7, home.z / layout.scale), point(isBtc ? -3 : 7, 3.6), goal] :
      isBudget ? [home, point(6.2, home.z / layout.scale), point(6.2, -4.6), point(0, -4.6), goal] : [home, goal];
    const safe = isRouteSafe(candidate, obstacles, layout, radius);
    return { agentId: person.id, stationId: person.stationId, homeRotation: person.transform.rotationY,
      route: safe ? candidate : [home], speed: 0.8 * layout.scale,
      meetingRotation: isBtc ? -Math.PI / 2 : Math.PI / 2, ...(safe ? {} : { fallback: 'unsafe-route' as const }) };
  });
  const travelWindowMs = Math.max(1000, Math.ceil(Math.max(...plans.map(plan => routeDuration(plan.route, plan.speed, turnMs)))));
  const idleMs = 1500, workingMs = 2500, meetingMs = 3500;
  return { version: 1, fictional: true, radius, plans, idleMs, workingMs, turnMs, meetingMs, travelWindowMs,
    cycleMs: idleMs + workingMs + travelWindowMs * 2 + meetingMs };
}
