import {
  AmbientLight, Color, DirectionalLight, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import type { OfficeLayout } from '../contracts/office';
import { createOfficeLayout } from '../fixtures/office';
import { createOffice, disposeOffice } from './createOffice';
import { createCharacterFixture } from '../fixtures/characters';
import { createCharacters } from './createCharacters';

type Renderer = Pick<WebGLRenderer, 'domElement' | 'setSize' | 'setPixelRatio' | 'render' | 'dispose' | 'forceContextLoss'>;
export interface SceneOptions {
  officeLayout?: OfficeLayout;
  onReady: () => void;
  onError: () => void;
  /** Ponto de injeção para testar ciclo de vida sem confundir mocks com WebGL real. */
  createRenderer?: () => Renderer;
}
export interface SceneHandle { dispose: () => void }

export function mountScene(host: HTMLElement, options: SceneOptions): SceneHandle {
  const scene = new Scene();
  const camera = new PerspectiveCamera(42, 1, 0.1, 100);
  let renderer: Renderer | undefined;
  let observer: ResizeObserver | undefined;
  let frame: number | undefined;
  let disposed = false;
  let ready = false;
  let layout: OfficeLayout;

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (frame !== undefined) cancelAnimationFrame(frame);
    observer?.disconnect();
    window.removeEventListener('resize', schedule);
    renderer?.domElement.removeEventListener('webglcontextlost', contextLost);
    disposeOffice(scene);
    scene.clear();
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer?.domElement.remove();
  }

  function fail() { dispose(); options.onError(); }
  function contextLost(event: Event) { event.preventDefault(); if (!disposed) fail(); }
  function draw() {
    frame = undefined;
    if (disposed || !renderer) return;
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (width < 1 || height < 1) return;
    try {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      // Ajuste automático simples, sem controles: encaixa piso e placas com margem.
      const radius = Math.hypot(layout.floor.width, layout.floor.depth) / 2 + 3;
      const vertical = camera.fov * Math.PI / 360;
      const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
      const target = new Vector3(layout.floor.x + layout.floor.width / 2, 0.6, layout.floor.z + layout.floor.depth / 2);
      const direction = new Vector3(0.5, 1, 0.85).normalize();
      const right = new Vector3(direction.z, 0, -direction.x).normalize();
      const up = new Vector3().crossVectors(direction, right);
      let distance = 1;
      for (const x of [layout.floor.x, layout.floor.x + layout.floor.width])
        for (const z of [layout.floor.z, layout.floor.z + layout.floor.depth])
          for (const y of [0, 2.6]) {
            const delta = new Vector3(x, y, z).sub(target);
            distance = Math.max(distance, delta.dot(direction) + Math.abs(delta.dot(right)) / (Math.tan(horizontal) * 0.9),
              delta.dot(direction) + Math.abs(delta.dot(up)) / (Math.tan(vertical) * 0.7));
          }
      camera.position.copy(target).add(direction.multiplyScalar(distance));
      camera.far = distance + radius * 3;
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      if (!ready) { ready = true; options.onReady(); }
    } catch { fail(); }
  }
  function schedule() {
    if (!disposed && frame === undefined) frame = requestAnimationFrame(draw);
  }

  try {
    renderer = options.createRenderer?.() ?? new WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', 'Escritório 3D de um pavimento: análise central, BTC, ETH, coordenação e orçamento, com cinco personagens fictícios em espera');
    layout = options.officeLayout ?? createOfficeLayout();
    scene.background = new Color('#101b27');
    scene.add(new AmbientLight('#d8e8ff', 1.7));
    const light = new DirectionalLight('#ffffff', 3);
    light.position.set(4, 8, 5); scene.add(light);

    const office = createOffice(layout);
    // Placas acima do lado de acesso das mesas para não encobrirem os ocupantes.
    for (const station of layout.stations) office.getObjectByName(station.id)!
      .getObjectByName('station-label')!.position.set(0, 3.2, 1);
    scene.add(office);
    scene.add(createCharacters(createCharacterFixture(layout), layout));

    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    host.append(renderer.domElement);
    observer = new ResizeObserver(schedule);
    observer.observe(host);
    window.addEventListener('resize', schedule);
    // Cena estática: renderiza só na montagem e no resize, sem loop ocioso.
    schedule();
  } catch { fail(); }
  return { dispose };
}
