import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { OfficeLayout } from '../contracts/office';

export function createCameraControls(camera: PerspectiveCamera, canvas: HTMLCanvasElement, layout: OfficeLayout, changed: () => void) {
  const orbit = new OrbitControls(camera, canvas);
  const { floor } = layout;
  const center = new Vector3(floor.x + floor.width / 2, 0.6, floor.z + floor.depth / 2);
  const radius = Math.hypot(floor.width, floor.depth) / 2 + 3;
  let fit = 0, disposed = false, connected = true;
  orbit.enableDamping = false; orbit.screenSpacePanning = false;
  orbit.minPolarAngle = 0.15; orbit.maxPolarAngle = Math.PI / 2 - 0.22;
  orbit.minAzimuthAngle = -Math.PI; orbit.maxAzimuthAngle = Math.PI;
  orbit.zoomSpeed = 0.8; orbit.panSpeed = 0.7;
  const targetDelta = new Vector3();

  function constrain() {
    targetDelta.copy(orbit.target);
    orbit.target.set(MathUtils.clamp(orbit.target.x, center.x - floor.width / 4, center.x + floor.width / 4),
      center.y, MathUtils.clamp(orbit.target.z, center.z - floor.depth / 4, center.z + floor.depth / 4));
    targetDelta.sub(orbit.target); camera.position.sub(targetDelta);
    camera.lookAt(orbit.target); camera.updateMatrixWorld();
  }
  function onChange() { constrain(); changed(); }
  orbit.addEventListener('change', onChange);
  function update() { if (!disposed) { constrain(); orbit.update(); constrain(); } }
  function reset() {
    if (disposed || !fit) return;
    orbit.target.copy(center);
    camera.position.copy(center).add(new Vector3(0, 1, 1.2).normalize().multiplyScalar(fit));
    update(); changed();
  }
  function resize(width: number, height: number) {
    if (disposed || width < 1 || height < 1) return;
    const previous = fit;
    camera.aspect = width / height;
    const vertical = camera.fov * Math.PI / 360;
    const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
    const direction = new Vector3(0, 1, 1.2).normalize();
    const right = new Vector3(direction.z, 0, -direction.x).normalize();
    const up = new Vector3().crossVectors(direction, right);
    fit = 1;
    for (const x of [floor.x, floor.x + floor.width]) for (const z of [floor.z, floor.z + floor.depth]) for (const y of [0, 3]) {
      const delta = new Vector3(x, y, z).sub(center);
      fit = Math.max(fit, delta.dot(direction) + Math.abs(delta.dot(right)) / (Math.tan(horizontal) * 0.94),
        delta.dot(direction) + Math.abs(delta.dot(up)) / (Math.tan(vertical) * (delta.dot(up) > 0 ? 0.7 : 0.92)));
    }
    orbit.minDistance = radius * 0.65; orbit.maxDistance = Math.max(radius * 4, fit * 1.6);
    camera.far = orbit.maxDistance + radius * 3;
    camera.updateProjectionMatrix();
    if (!previous) reset();
    else { camera.position.sub(orbit.target).multiplyScalar(fit / previous).add(orbit.target); update(); }
  }
  return {
    orbit, update, reset, resize,
    snapshot: () => ({ position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      target: { x: orbit.target.x, y: orbit.target.y, z: orbit.target.z }, distance: camera.position.distanceTo(orbit.target),
      polar: orbit.getPolarAngle(), azimuth: orbit.getAzimuthalAngle(), aspect: camera.aspect, fov: camera.fov }),
    setEnabled(enabled: boolean) {
      if (disposed || enabled === connected) return;
      orbit.enabled = enabled; connected = enabled;
      if (enabled) orbit.connect(canvas); else orbit.disconnect();
    },
    dispose() { if (disposed) return; disposed = true; orbit.removeEventListener('change', onChange); orbit.dispose(); },
  };
}
