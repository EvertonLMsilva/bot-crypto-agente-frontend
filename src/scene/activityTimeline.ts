import type { ActivityFixture, ActivitySample, VisualPoint } from '../contracts/activities';

const mix = (a: number, b: number, ratio: number) => a + (b - a) * Math.max(0, Math.min(1, ratio));
const angleMix = (a: number, b: number, ratio: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * Math.max(0, Math.min(1, ratio));
const blend = (elapsed: number, duration: number) => Math.max(0, Math.min(1, elapsed / 250, (duration - elapsed) / 250));

function travel(route: readonly VisualPoint[], speed: number, turnMs: number, elapsed: number, fromAngle: number, finalAngle: number) {
  let cursor = 0, previousAngle = fromAngle;
  for (let index = 1; index < route.length; index++) {
    const a = route[index - 1], b = route[index]; const rotation = Math.atan2(-(b.x - a.x), -(b.z - a.z));
    if (elapsed < cursor + turnMs) return { position: { ...a }, rotationY: angleMix(previousAngle, rotation, (elapsed - cursor) / turnMs), gait: 0, arrived: false };
    cursor += turnMs;
    const duration = Math.hypot(b.x - a.x, b.z - a.z) / speed * 1000;
    if (elapsed < cursor + duration) {
      const progress = (elapsed - cursor) / duration;
      return { position: { x: mix(a.x, b.x, progress), y: 0, z: mix(a.z, b.z, progress) }, rotationY: rotation,
        gait: blend(elapsed - cursor, duration), arrived: false };
    }
    cursor += duration; previousAngle = rotation;
  }
  return { position: { ...route[route.length - 1] }, rotationY: angleMix(previousAngle, finalAngle, (elapsed - cursor) / turnMs), gait: 0, arrived: true };
}

/** Amostragem analítica: o resultado depende somente da fixture e do instante lógico. */
export function sampleActivities(fixture: ActivityFixture, logicalMs: number): readonly ActivitySample[] {
  if (!Number.isFinite(logicalMs) || logicalMs < 0) throw new Error('Instante visual inválido.');
  const time = logicalMs % fixture.cycleMs;
  const departure = fixture.idleMs + fixture.workingMs;
  const meeting = departure + fixture.travelWindowMs;
  const returning = meeting + fixture.meetingMs;
  return fixture.plans.map(plan => {
    const base: ActivitySample = { agentId: plan.agentId, stationId: plan.stationId, position: { ...plan.route[0] }, rotationY: plan.homeRotation,
      activity: 'IDLE', gait: 0, gesture: 0 };
    if (time < fixture.idleMs) return base;
    if (time < departure || plan.route.length === 1) {
      const duration = plan.route.length === 1 ? fixture.cycleMs - fixture.idleMs : fixture.workingMs;
      return { ...base, activity: 'WORKING', gesture: blend(time - fixture.idleMs, duration) };
    }
    if (time < meeting) {
      const motion = travel(plan.route, plan.speed, fixture.turnMs, time - departure, plan.homeRotation, plan.meetingRotation);
      return { ...base, position: motion.position, rotationY: motion.rotationY, gait: motion.gait, activity: motion.arrived ? 'MEETING' : 'WALKING' };
    }
    if (time < returning) return { ...base, position: { ...plan.route[plan.route.length - 1] }, rotationY: plan.meetingRotation,
      activity: 'MEETING', gesture: blend(time - meeting, fixture.meetingMs) };
    const motion = travel([...plan.route].reverse(), plan.speed, fixture.turnMs, time - returning, plan.meetingRotation, plan.homeRotation);
    return { ...base, position: motion.position, rotationY: motion.rotationY, gait: motion.gait, activity: motion.arrived ? 'IDLE' : 'WALKING' };
  });
}
