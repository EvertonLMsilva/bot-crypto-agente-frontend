import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Box3, Mesh } from 'three';
import { createOfficeLayout } from '../../src/fixtures/office';
import { createCharacterFixture } from '../../src/fixtures/characters';
import { createActivityFixture } from '../../src/fixtures/activities';
import { createCharacters } from '../../src/scene/createCharacters';
import { createOffice, disposeOffice } from '../../src/scene/createOffice';
import { animateCharacters, collectObstacles, createVisualClock } from '../../src/scene/animateCharacters';

beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: vi.fn(), fillText: vi.fn() } as unknown as CanvasRenderingContext2D));
afterEach(() => vi.restoreAllMocks());
describe('relógio e poses procedurais', () => {
  it('separa tempo visual de tempo de renderização e ignora o intervalo pausado', () => {
    const clock = createVisualClock();
    expect(clock.sample(100)).toBe(0); expect(clock.sample(1100)).toBe(1000);
    clock.pause(); expect(clock.sample(10000)).toBe(1000); clock.resume();
    expect(clock.sample(20000)).toBe(1000); expect(clock.sample(20500)).toBe(1500);
    expect(() => clock.sample(NaN)).toThrow();
  });
  it.each([0.75, 1, 1.25, 2])('anima modelos reais sem penetrar móveis/divisórias na escala %s', scale => {
    const layout = createOfficeLayout({ scale }); const people = createCharacterFixture(layout); const office = createOffice(layout);
    const models = createCharacters(people, layout); const fixture = createActivityFixture(layout, people, collectObstacles(office));
    const animation = animateCharacters(models, fixture);
    try {
      office.updateMatrixWorld(true);
      for (let ms = 0; ms <= fixture.cycleMs; ms += 350) {
        animation.apply(ms); models.updateMatrixWorld(true);
        for (const model of models.children) {
          const body = new Box3().setFromObject(model);
          expect(Math.max(model.position.x - body.min.x, body.max.x - model.position.x,
            model.position.z - body.min.z, body.max.z - model.position.z)).toBeLessThanOrEqual(fixture.radius + 1e-6);
          office.traverse(node => { if (node instanceof Mesh) expect(body.intersectsBox(new Box3().setFromObject(node)), `${model.name} / ${node.name} / ${ms}`).toBe(false); });
        }
      }
      animation.apply(6500); const first = animation.snapshot(); animation.apply(8500); const second = animation.snapshot();
      expect(first).not.toEqual(second); expect(first).toHaveLength(5); expect(models.children).toHaveLength(5);
      animation.apply(6500); expect(animation.snapshot()).toEqual(first);
    } finally { disposeOffice(models); disposeOffice(office); }
  });
});
