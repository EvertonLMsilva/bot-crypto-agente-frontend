import { Box3, Mesh } from 'three';
import type { Group, Object3D } from 'three';
import type { ActivityFixture } from '../contracts/activities';
import type { Rect } from '../contracts/office';
import { sampleActivities } from './activityTimeline';

export function collectObstacles(office: Object3D): readonly Rect[] {
  office.updateMatrixWorld(true); const obstacles: Rect[] = [];
  office.traverse(node => {
    if (!(node instanceof Mesh)) return;
    const box = new Box3().setFromObject(node);
    // Exclui piso/tapetes e objetos acima do envelope dos personagens.
    if (box.max.y <= 0.08 || box.min.y >= 1.85) return;
    obstacles.push({ x: box.min.x, z: box.min.z, width: box.max.x - box.min.x, depth: box.max.z - box.min.z });
  });
  return obstacles;
}

export function createVisualClock() {
  let timeMs = 0, lastReal: number | undefined, running = true;
  return {
    get timeMs() { return timeMs; }, get running() { return running; },
    sample(realTimestamp: number) {
      if (!Number.isFinite(realTimestamp) || realTimestamp < 0) throw new Error('Timestamp de renderização inválido.');
      if (running) { if (lastReal !== undefined) timeMs += Math.max(0, realTimestamp - lastReal); lastReal = Math.max(lastReal ?? realTimestamp, realTimestamp); }
      return timeMs;
    },
    pause() { running = false; lastReal = undefined; },
    resume() { if (!running) { running = true; lastReal = undefined; } },
    resetAnchor() { lastReal = undefined; },
  };
}

export function animateCharacters(models: Group, fixture: ActivityFixture) {
  const actors = fixture.plans.map(plan => {
    const model = models.getObjectByName(`character:${plan.agentId}`)!;
    return { plan, model, upper: model.getObjectByName('upper-body')!,
      leftArm: model.getObjectByName('left-arm-pivot')!, rightArm: model.getObjectByName('right-arm-pivot')!,
      leftLeg: model.getObjectByName('left-leg-pivot')!, rightLeg: model.getObjectByName('right-leg-pivot')! };
  });
  function apply(logicalMs: number) {
    const samples = sampleActivities(fixture, logicalMs);
    samples.forEach((sample, index) => {
      const actor = actors[index], phase = logicalMs / 1000;
      actor.model.position.set(sample.position.x, sample.position.y, sample.position.z);
      actor.model.rotation.y = sample.rotationY; actor.model.userData.activity = sample.activity;
      actor.upper.rotation.z = Math.sin(phase * 1.5) * 0.006;
      actor.upper.position.y = 1 + Math.sin(phase * 1.5) * 0.003;
      const gait = Math.sin(phase * 7) * 0.22 * sample.gait;
      actor.leftLeg.rotation.x = gait; actor.rightLeg.rotation.x = -gait;
      // Folga de poucos milímetros para o balanço dos pés não penetrar os tapetes.
      actor.leftLeg.position.y = actor.rightLeg.position.y = 0.68 + sample.gait * 0.012;
      const work = sample.activity === 'WORKING' ? (-0.14 + Math.sin(phase * 3) * 0.05) * sample.gesture : 0;
      const meeting = sample.activity === 'MEETING' ? (-0.13 + Math.sin(phase * 2) * 0.07) * sample.gesture : 0;
      actor.leftArm.rotation.x = -gait * 0.75 + work;
      actor.rightArm.rotation.x = gait * 0.75 + work + meeting;
    });
  }
  return { apply, snapshot: () => actors.map(({ plan, model, upper, leftArm, rightArm, leftLeg, rightLeg }) => ({
    agentId: plan.agentId, stationId: plan.stationId, activity: model.userData.activity as string,
    position: { x: model.position.x, y: model.position.y, z: model.position.z }, rotationY: model.rotation.y,
    pose: { leftArm: leftArm.rotation.x, rightArm: rightArm.rotation.x, leftLeg: leftLeg.rotation.x, rightLeg: rightLeg.rotation.x,
      upperLean: upper.rotation.z, upperLift: upper.position.y, legLift: leftLeg.position.y },
  })) };
}
