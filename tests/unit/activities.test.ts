import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOfficeLayout } from '../../src/fixtures/office';
import { createCharacterFixture } from '../../src/fixtures/characters';
import { createActivityFixture } from '../../src/fixtures/activities';
import { isRouteSafe, visualStates } from '../../src/contracts/activities';
import { sampleActivities } from '../../src/scene/activityTimeline';
import { collectObstacles } from '../../src/scene/animateCharacters';
import { createOffice, disposeOffice } from '../../src/scene/createOffice';

beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: vi.fn(), fillText: vi.fn() } as unknown as CanvasRenderingContext2D));
afterEach(() => vi.restoreAllMocks());
function fixture(scale = 1) {
  const layout = createOfficeLayout({ scale }); const people = createCharacterFixture(layout); const office = createOffice(layout);
  const obstacles = collectObstacles(office); disposeOffice(office);
  return { layout, people, obstacles, activities: createActivityFixture(layout, people, obstacles) };
}
describe('atividades visuais determinísticas 2.4', () => {
  it('preserva cinco identidades e define somente os quatro estados fictícios', () => {
    const { activities, people } = fixture();
    expect(visualStates).toEqual(['IDLE', 'WORKING', 'WALKING', 'MEETING']);
    expect(activities.fictional).toBe(true);
    expect(activities.plans.map(plan => plan.agentId)).toEqual(people.map(person => person.id));
    expect(new Set(activities.plans.map(plan => plan.agentId)).size).toBe(5);
    for (const plan of activities.plans) expect(plan.stationId).toBe(plan.agentId);
  });
  it('é reproduzível sem rede, aleatoriedade ou relógio do sistema', () => {
    const { layout, people, obstacles, activities } = fixture();
    const random = vi.spyOn(Math, 'random'); const clock = vi.spyOn(Date, 'now'); const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(createActivityFixture(layout, people, obstacles)).toEqual(activities);
    expect(sampleActivities(activities, 6500)).toEqual(sampleActivities(activities, 6500));
    expect(random).not.toHaveBeenCalled(); expect(clock).not.toHaveBeenCalled(); expect(fetchSpy).not.toHaveBeenCalled();
  });
  it.each([0.75, 1, 1.25, 2])('valida os trajetos completos contra obstáculos reais na escala %s', scale => {
    const { activities, obstacles, layout } = fixture(scale);
    const moving = activities.plans.filter(plan => plan.route.length > 1);
    expect(moving.map(plan => plan.agentId)).toEqual(['btc-specialist', 'eth-specialist', 'budget-manager']);
    for (const plan of moving) expect(isRouteSafe(plan.route, obstacles, layout, activities.radius)).toBe(true);
    for (const plan of activities.plans.filter(plan => plan.route.length === 1)) expect(plan.fallback).toBe('unsafe-route');
    // Verifica também possíveis colisões entre personagens em todos os segmentos do ciclo.
    for (let ms = 0; ms <= activities.cycleMs; ms += 100) {
      const states = sampleActivities(activities, ms);
      for (let a = 0; a < states.length; a++) for (let b = a + 1; b < states.length; b++)
        expect(Math.hypot(states[a].position.x - states[b].position.x, states[a].position.z - states[b].position.z)).toBeGreaterThan(activities.radius * 2);
    }
  });
  it('rejeita um caminho que atravessa uma mesa e mantém fallback sem mover a planta', () => {
    const { layout, people, obstacles } = fixture(); const before = JSON.stringify(layout);
    const start = people[1].transform.position;
    expect(isRouteSafe([start, { ...start, z: start.z - 3 }], obstacles, layout, 0.47)).toBe(false);
    const blocked = createActivityFixture(layout, people, [{ x: -9, z: -8, width: 18, depth: 16 }]);
    expect(blocked.plans.every(plan => plan.route.length === 1)).toBe(true);
    expect(JSON.stringify(layout)).toBe(before);
  });
  it('faz transições IDLE → WORKING → WALKING → MEETING e retorna à origem', () => {
    const { activities } = fixture(); const btc = (ms: number) => sampleActivities(activities, ms).find(state => state.agentId === 'btc-specialist')!;
    expect(btc(0).activity).toBe('IDLE'); expect(btc(2000).activity).toBe('WORKING'); expect(btc(6500).activity).toBe('WALKING');
    expect(btc(activities.idleMs + activities.workingMs + activities.travelWindowMs + 1000).activity).toBe('MEETING');
    expect(btc(activities.cycleMs).position).toEqual(btc(0).position);
  });
  it('mantém velocidade limitada e posição/rotação contínuas, inclusive nas bordas do ciclo', () => {
    const { activities } = fixture();
    for (let ms = 0; ms <= activities.cycleMs * 2; ms += 20) {
      const before = sampleActivities(activities, ms); const after = sampleActivities(activities, ms + 20);
      for (let index = 0; index < before.length; index++) {
        const a = before[index], b = after[index];
        expect(Math.hypot(b.position.x - a.position.x, b.position.z - a.position.z)).toBeLessThanOrEqual(activities.plans[index].speed * 0.020001);
        const angle = Math.atan2(Math.sin(b.rotationY - a.rotationY), Math.cos(b.rotationY - a.rotationY));
        expect(Math.abs(angle)).toBeLessThan(0.15);
      }
    }
    for (const time of [-1, NaN, Infinity]) expect(() => sampleActivities(activities, time)).toThrow();
  });
});
