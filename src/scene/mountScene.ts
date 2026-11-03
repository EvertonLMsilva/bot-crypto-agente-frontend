import {
  AmbientLight, Color, DirectionalLight, PCFShadowMap, PerspectiveCamera, Scene, WebGLRenderer,
} from 'three';
import type { OfficeLayout } from '../contracts/office';
import { createOfficeLayout } from '../fixtures/office';
import { createOffice, disposeOffice } from './createOffice';
import { createCharacterFixture } from '../fixtures/characters';
import { createCharacters } from './createCharacters';
import { createActivityFixture } from '../fixtures/activities';
import { animateCharacters, collectObstacles, createVisualClock } from './animateCharacters';
import { createCameraControls } from './cameraControls';
import { bindSelectionInput, createSceneSelection } from './sceneSelection';
import type { SceneSelection } from '../contracts/selection';

type Renderer = Pick<WebGLRenderer, 'domElement' | 'setSize' | 'setPixelRatio' | 'render' | 'dispose' | 'forceContextLoss'> &
  Partial<Pick<WebGLRenderer, 'shadowMap'>>;
export interface SceneOptions {
  officeLayout?: OfficeLayout;
  onReady: () => void;
  onError: () => void;
  onSelection?: (value: SceneSelection | null) => void;
  /** Ponto de injeção para testar ciclo de vida sem confundir mocks com WebGL real. */
  createRenderer?: () => Renderer;
}
export interface SceneHandle { dispose: () => void; resetCamera?: () => void; clearSelection?: () => void }
export interface AnimatedSceneHandle extends SceneHandle {
  pause: () => void;
  resume: () => void;
  getAnimationSnapshot: () => { timeMs: number; paused: boolean; characters: ReturnType<ReturnType<typeof animateCharacters>['snapshot']> };
  resetCamera: () => void;
  clearSelection: () => void;
  getSelection: () => SceneSelection | null;
  getCameraSnapshot: () => ReturnType<ReturnType<typeof createCameraControls>['snapshot']> | undefined;
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
  let navigation: ReturnType<typeof createCameraControls> | undefined;
  let selection: ReturnType<typeof createSceneSelection> | undefined;
  let input: ReturnType<typeof bindSelectionInput> | undefined;
  let contextUnavailable = false;
  let drawing = false;
  let manualPaused = false, visibilityPaused = false;
  let viewport = '';

  function syncPause() {
    if (disposed) return;
    if (manualPaused || visibilityPaused || contextUnavailable) {
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
    renderer?.domElement.removeEventListener('webglcontextrestored', contextRestored);
    input?.dispose(); navigation?.dispose(); selection?.dispose();
    disposeOffice(scene);
    scene.traverse(node => { if (node instanceof DirectionalLight) node.dispose(); });
    scene.clear();
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer?.domElement.remove();
  }

  function fail() { dispose(); options.onError(); }
  function contextLost(event: Event) {
    event.preventDefault(); if (disposed || contextUnavailable) return;
    contextUnavailable = true; ready = false;
    navigation?.setEnabled(false); input?.setEnabled(false); syncPause(); options.onError();
  }
  function contextRestored() {
    if (disposed || !contextUnavailable) return;
    contextUnavailable = false; viewport = '';
    navigation?.setEnabled(true); input?.setEnabled(true); syncPause(); schedule();
  }
  function draw(realTimestamp: number) {
    frame = undefined;
    if (disposed || contextUnavailable || !renderer) return;
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (width < 1 || height < 1) { clock.resetAnchor(); return; }
    drawing = true;
    try {
      const density = Math.min(window.devicePixelRatio || 1, 2);
      const nextViewport = `${width}:${height}:${density}`;
      if (nextViewport !== viewport) {
      renderer.setPixelRatio(density);
      renderer.setSize(width, height, false);
      navigation?.resize(width, height);
      viewport = nextViewport;
      }
      animation?.apply(clock.sample(realTimestamp));
      navigation?.update(); selection?.update();
      renderer.render(scene, camera);
      if (!ready) { ready = true; options.onReady(); }
    } catch { fail(); }
    finally { drawing = false; if (clock.running) schedule(); }
  }
  function schedule() {
    if (!disposed && !drawing && !contextUnavailable && frame === undefined) frame = requestAnimationFrame(draw);
  }

  try {
    renderer = options.createRenderer?.() ?? new WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', 'Escritório 3D de um pavimento: análise central, BTC, ETH, coordenação e orçamento, com cinco personagens fictícios e atividades locais');
    renderer.domElement.tabIndex = 0;
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
    navigation = createCameraControls(camera, renderer.domElement, layout, schedule);
    selection = createSceneSelection(scene, office, models, layout, value => { options.onSelection?.(value); schedule(); });
    input = bindSelectionInput(renderer.domElement, ndc => {
      renderer!.domElement.focus({ preventScroll: true }); selection?.pick(ndc, camera);
    }, () => selection?.clear());

    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    renderer.domElement.addEventListener('webglcontextrestored', contextRestored);
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
  return { dispose, pause, resume, resetCamera: () => { if (!contextUnavailable) navigation?.reset(); },
    clearSelection: () => selection?.clear(), getSelection: () => selection?.current() ?? null,
    getCameraSnapshot: () => navigation?.snapshot(),
    getAnimationSnapshot: () => ({ timeMs: clock.timeMs, paused: !clock.running, characters: animation?.snapshot() ?? [] }) };
}
