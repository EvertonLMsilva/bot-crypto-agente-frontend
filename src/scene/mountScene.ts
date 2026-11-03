import {
  AmbientLight, Color, DirectionalLight, PCFShadowMap, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import type { OfficeLayout } from '../contracts/office';
import { createOfficeLayout } from '../fixtures/office';
import { createOffice, disposeOffice } from './createOffice';
import { createCharacterFixture } from '../fixtures/characters';
import { createCharacters } from './createCharacters';
import { createActivityFixture } from '../fixtures/activities';
import { animateCharacters, collectObstacles, createVisualClock } from './animateCharacters';

type Renderer = Pick<WebGLRenderer, 'domElement' | 'setSize' | 'setPixelRatio' | 'render' | 'dispose' | 'forceContextLoss'> &
  Partial<Pick<WebGLRenderer, 'shadowMap'>>;
export interface SceneOptions {
  officeLayout?: OfficeLayout;
  onReady: () => void;
  onError: () => void;
  /** Ponto de injeção para testar ciclo de vida sem confundir mocks com WebGL real. */
  createRenderer?: () => Renderer;
}
export interface SceneHandle { dispose: () => void }
export interface AnimatedSceneHandle extends SceneHandle {
  pause: () => void;
  resume: () => void;
  getAnimationSnapshot: () => { timeMs: number; paused: boolean; characters: ReturnType<ReturnType<typeof animateCharacters>['snapshot']> };
}

export function mountScene(host: HTMLElement, options: SceneOptions): AnimatedSceneHandle {
  const scene = new Scene();
  const camera = new PerspectiveCamera(42, 1, 0.1, 100);
  let renderer: Renderer | undefined;
  let observer: ResizeObserver | undefined;
  let frame: number | undefined;
  let disposed = false;
  let ready = false;
  let layout: OfficeLayout;
  const clock = createVisualClock();
  let animation: ReturnType<typeof animateCharacters> | undefined;
  let manualPaused = false, visibilityPaused = false;
  let viewport = '';

  function syncPause() {
    if (disposed) return;
    if (manualPaused || visibilityPaused) {
      clock.pause();
      if (frame !== undefined) { cancelAnimationFrame(frame); frame = undefined; }
    } else { clock.resume(); schedule(); }
  }
  function visibilityChanged() { visibilityPaused = document.hidden; syncPause(); }
  function pause() { manualPaused = true; syncPause(); }
  function resume() { manualPaused = false; syncPause(); }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clock.pause();
    if (frame !== undefined) cancelAnimationFrame(frame);
    observer?.disconnect();
    window.removeEventListener('resize', schedule);
    document.removeEventListener('visibilitychange', visibilityChanged);
    renderer?.domElement.removeEventListener('webglcontextlost', contextLost);
    disposeOffice(scene);
    scene.traverse(node => { if (node instanceof DirectionalLight) node.dispose(); });
    scene.clear();
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer?.domElement.remove();
  }

  function fail() { dispose(); options.onError(); }
  function contextLost(event: Event) { event.preventDefault(); if (!disposed) fail(); }
  function draw(realTimestamp: number) {
    frame = undefined;
    if (disposed || !renderer) return;
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (width < 1 || height < 1) { clock.resetAnchor(); return; }
    try {
      const density = Math.min(window.devicePixelRatio || 1, 2);
      const nextViewport = `${width}:${height}:${density}`;
      if (nextViewport !== viewport) {
      renderer.setPixelRatio(density);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      // Ajuste automático simples, sem controles: encaixa piso e placas com margem.
      const radius = Math.hypot(layout.floor.width, layout.floor.depth) / 2 + 3;
      const vertical = camera.fov * Math.PI / 360;
      const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
      const target = new Vector3(layout.floor.x + layout.floor.width / 2, 0.6, layout.floor.z + layout.floor.depth / 2);
      const direction = new Vector3(0, 1, 1.2).normalize();
      const right = new Vector3(direction.z, 0, -direction.x).normalize();
      const up = new Vector3().crossVectors(direction, right);
      let distance = 1;
      for (const x of [layout.floor.x, layout.floor.x + layout.floor.width])
        for (const z of [layout.floor.z, layout.floor.z + layout.floor.depth])
          for (const y of [0, 3]) {
            const delta = new Vector3(x, y, z).sub(target);
            distance = Math.max(distance, delta.dot(direction) + Math.abs(delta.dot(right)) / (Math.tan(horizontal) * 0.94),
              delta.dot(direction) + Math.abs(delta.dot(up)) / (Math.tan(vertical) * (delta.dot(up) > 0 ? 0.7 : 0.92)));
          }
      camera.position.copy(target).add(direction.multiplyScalar(distance));
      camera.far = distance + radius * 3;
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      viewport = nextViewport;
      }
      animation?.apply(clock.sample(realTimestamp));
      renderer.render(scene, camera);
      if (!ready) { ready = true; options.onReady(); }
      if (clock.running) schedule();
    } catch { fail(); }
  }
  function schedule() {
    if (!disposed && frame === undefined) frame = requestAnimationFrame(draw);
  }

  try {
    renderer = options.createRenderer?.() ?? new WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', 'Escritório 3D de um pavimento: análise central, BTC, ETH, coordenação e orçamento, com cinco personagens fictícios e atividades locais');
    layout = options.officeLayout ?? createOfficeLayout();
    scene.background = new Color('#101b27');
    if (renderer.shadowMap) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFShadowMap; }
    scene.add(new AmbientLight('#fff0d8', 1.25));
    const light = new DirectionalLight('#ffe1b0', 3);
    light.position.set(-6, 12, 5); light.castShadow = true; light.shadow.mapSize.set(1024, 1024);
    const extent = Math.max(layout.floor.width, layout.floor.depth) * 0.7;
    Object.assign(light.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 0.5, far: 90 });
    light.shadow.bias = -0.001; light.shadow.normalBias = 0.025; scene.add(light);

    const office = createOffice(layout);
    scene.add(office);
    const people = createCharacterFixture(layout);
    const models = createCharacters(people, layout); scene.add(models);
    animation = animateCharacters(models, createActivityFixture(layout, people, collectObstacles(office)));
    animation.apply(0);

    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    host.append(renderer.domElement);
    observer = new ResizeObserver(schedule);
    observer.observe(host);
    window.addEventListener('resize', schedule);
    document.addEventListener('visibilitychange', visibilityChanged);
    visibilityPaused = document.hidden;
    if (visibilityPaused) clock.pause();
    // Um único loop; pausas internas não controlam a simulação financeira.
    schedule();
  } catch { fail(); }
  return { dispose, pause, resume, getAnimationSnapshot: () => ({ timeMs: clock.timeMs, paused: !clock.running, characters: animation?.snapshot() ?? [] }) };
}
