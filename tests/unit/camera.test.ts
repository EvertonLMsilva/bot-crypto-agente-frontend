import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { createOfficeLayout } from '../../src/fixtures/office';
import { createCameraControls } from '../../src/scene/cameraControls';

describe('câmera orbital local', () => {
  function setup() {
    const canvas = document.createElement('canvas'); document.body.append(canvas);
    const camera = new PerspectiveCamera(42, 2, 0.1, 100);
    const controls = createCameraControls(camera, canvas, createOfficeLayout(), vi.fn());
    controls.resize(800, 400);
    return { canvas, camera, controls, close: () => { controls.dispose(); canvas.remove(); } };
  }
  it('limita zoom, rotação e foco e mantém câmera acima do piso', () => {
    const { camera, controls, close } = setup();
    try {
      for (const distance of [0.001, 10000]) {
        controls.orbit.target.set(1000, -1000, 1000);
        camera.position.copy(controls.orbit.target).add(new Vector3(0, -distance, distance));
        controls.update();
        const state = controls.snapshot();
        expect(state.distance).toBeGreaterThanOrEqual(controls.orbit.minDistance - 1e-6);
        expect(state.distance).toBeLessThanOrEqual(controls.orbit.maxDistance + 1e-6);
        expect(state.target.y).toBe(0.6); expect(Math.abs(state.target.x)).toBeLessThanOrEqual(4.5);
        expect(Math.abs(state.target.z)).toBeLessThanOrEqual(4);
        expect(state.polar).toBeLessThanOrEqual(controls.orbit.maxPolarAngle + 1e-6);
        expect(state.polar).toBeGreaterThanOrEqual(controls.orbit.minPolarAngle - 1e-6);
        expect(camera.position.y).toBeGreaterThan(0.6);
      }
    } finally { close(); }
  });
  it('reenquadra e preserva a direção, foco e zoom relativo no resize', () => {
    const { camera, controls, close } = setup();
    try {
      const initial = controls.snapshot();
      controls.orbit.target.x = 2; camera.position.x += 2; controls.update();
      const before = controls.snapshot(); controls.resize(390, 844);
      expect(controls.snapshot().target).toEqual(before.target);
      expect(controls.snapshot().azimuth).toBeCloseTo(before.azimuth);
      controls.reset(); const reset = controls.snapshot();
      expect(reset.target).toEqual(initial.target);
      expect(reset.polar).toBeCloseTo(initial.polar);
      expect(camera.aspect).toBeCloseTo(390 / 844);
      expect(reset.distance).toBeGreaterThan(initial.distance);
    } finally { close(); }
  });
  it('remove listeners e restaura touch-action ao desmontar repetidamente', () => {
    const { canvas, controls, close } = setup();
    expect(canvas.style.touchAction).toBe('none');
    const changed = vi.fn(); controls.orbit.addEventListener('change', changed);
    close(); controls.dispose();
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));
    expect(changed).not.toHaveBeenCalled(); expect(canvas.style.touchAction).toBe('');
  });
});
