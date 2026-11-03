import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { WebGLRenderer } from 'three';
import { Box3, BoxGeometry, DirectionalLight, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Sprite, Texture, Vector3, WebGLRenderTarget } from 'three';
import { stationIds } from '../../src/contracts/office';
import { createOfficeLayout } from '../../src/fixtures/office';
import { mountScene } from '../../src/scene/mountScene';

describe('ciclo de vida 3D (renderer simulado, sem comprovação WebGL)', () => {
  let host: HTMLDivElement;
  let frames: Map<number, FrameRequestCallback>;
  let resize: ResizeObserverCallback;
  let disconnect: ReturnType<typeof vi.fn>;
  let renderer: { domElement: HTMLCanvasElement; setSize: Mock<WebGLRenderer['setSize']>;
    setPixelRatio: Mock<WebGLRenderer['setPixelRatio']>; render: Mock<WebGLRenderer['render']>;
    dispose: Mock<() => void>; forceContextLoss: Mock<() => void> };
  let width: number;
  let height: number;
  const flush = (timestamp = 0) => { const queued = [...frames.values()]; frames.clear(); queued.forEach(fn => fn(timestamp)); };
  beforeEach(() => {
    width = 800; height = 400; frames = new Map(); let sequence = 0;
    host = document.createElement('div'); document.body.append(host);
    Object.defineProperties(host, { clientWidth: { get: () => width }, clientHeight: { get: () => height } });
    vi.stubGlobal('requestAnimationFrame', vi.fn((fn: FrameRequestCallback) => { frames.set(++sequence, fn); return sequence; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => frames.delete(id)));
    disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class { constructor(cb: ResizeObserverCallback) { resize = cb; } observe() {} disconnect = disconnect; });
    renderer = { domElement: document.createElement('canvas'), setSize: vi.fn(), setPixelRatio: vi.fn(),
      render: vi.fn(), dispose: vi.fn(), forceContextLoss: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: vi.fn(), fillText: vi.fn(), measureText: () => ({ width: 100 }),
    } as unknown as CanvasRenderingContext2D);
  });
  afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it('usa luz quente e sombras moderadas para aproximar a referência', () => {
    const handle = mountScene(host, { onReady: vi.fn(), onError: vi.fn(), createRenderer: () => renderer });
    try {
      flush(); const scene = renderer.render.mock.lastCall![0] as Scene;
      const light = scene.children.find(node => node instanceof DirectionalLight) as DirectionalLight;
      expect(light.color.r).toBeGreaterThan(light.color.b);
      expect(light.castShadow).toBe(true); expect(light.shadow.mapSize.width).toBe(1024);
    } finally { handle.dispose(); }
  });
  it('monta escritório, cinco postos, câmera e luz; sinaliza pronto após renderizar', () => {
    const ready = vi.fn(); const handle = mountScene(host, { onReady: ready, onError: vi.fn(), createRenderer: () => renderer });
    expect(host.querySelector('canvas')).not.toBeNull(); expect(ready).not.toHaveBeenCalled();
    flush(); expect(ready).toHaveBeenCalledOnce();
    const [scene, camera] = renderer.render.mock.calls[0] as [Scene, PerspectiveCamera];
    for (const id of stationIds) expect(scene.getObjectByName(id)).toBeDefined();
    expect(scene.getObjectByName('characters')!.children).toHaveLength(5);
    for (const id of stationIds) expect(scene.getObjectByName(`character:${id}`)).toBeDefined();
    expect(scene.getObjectByName('floor')).toBeDefined();
    expect(camera.aspect).toBe(2); expect(scene.children.some(node => node.type.includes('Light'))).toBe(true);
    handle.dispose();
  });
  it('redimensiona viewport, câmera e densidade; ignora dimensões zero', () => {
    const handle = mountScene(host, { onReady: vi.fn(), onError: vi.fn(), createRenderer: () => renderer });
    flush(); width = 300; height = 600; resize([], {} as ResizeObserver); flush();
    expect(renderer.setSize).toHaveBeenLastCalledWith(300, 600, false);
    const camera = renderer.render.mock.lastCall![1] as PerspectiveCamera; expect(camera.aspect).toBe(0.5);
    width = 0; resize([], {} as ResizeObserver); flush();
    expect(camera.aspect).toBe(0.5); handle.dispose();
  });
  it('enquadra o pavimento inteiro e aproveita a viewport desktop e móvel', () => {
    const layout = createOfficeLayout();
    const handle = mountScene(host, { onReady: vi.fn(), onError: vi.fn(), createRenderer: () => renderer });
    try { for (const size of [[800, 400], [345, 350]]) {
      [width, height] = size; resize([], {} as ResizeObserver); flush();
      const camera = renderer.render.mock.lastCall![1] as PerspectiveCamera;
      camera.updateMatrixWorld();
      const points = [];
      for (const x of [layout.floor.x, layout.floor.x + layout.floor.width])
        for (const z of [layout.floor.z, layout.floor.z + layout.floor.depth])
          for (const y of [0, 2.6]) points.push(new Vector3(x, y, z).project(camera));
      // Enquadramento mais cheio, com margem superior para a identificação da cena.
      for (const point of points) { expect(Math.abs(point.x)).toBeLessThan(0.97); expect(point.y).toBeLessThan(0.73); expect(point.y).toBeGreaterThan(-0.95); }
      const horizontal = Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x));
      const vertical = Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y));
      expect(Math.max(horizontal, vertical)).toBeGreaterThan(1.2);
    } } finally { handle.dispose(); }
  });
  it('libera cada geometria, material, contexto, listener, observer e frame uma vez', () => {
    const handle = mountScene(host, { onReady: vi.fn(), onError: vi.fn(), createRenderer: () => renderer }); flush();
    const scene = renderer.render.mock.calls[0][0] as Scene;
    const light = scene.children.find(node => node instanceof DirectionalLight) as DirectionalLight;
    light.shadow.map = new WebGLRenderTarget(16, 16);
    const shadowDispose = vi.spyOn(light.shadow.map, 'dispose');
    const spies: ReturnType<typeof vi.spyOn>[] = [];
    const resources = new Set<{ dispose: () => void }>();
    scene.traverse(node => {
      if (node instanceof Mesh) resources.add(node.geometry);
      if (node instanceof Mesh || node instanceof Sprite) for (const material of [node.material].flat()) {
        resources.add(material);
        for (const value of Object.values(material)) if (value instanceof Texture) resources.add(value);
      }
    });
    expect([...resources].some(resource => resource instanceof Texture)).toBe(true);
    for (const resource of resources) spies.push(vi.spyOn(resource, 'dispose'));
    resize([], {} as ResizeObserver); handle.dispose(); handle.dispose(); flush();
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce(); expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(renderer.forceContextLoss).toHaveBeenCalledOnce(); expect(host.children).toHaveLength(0);
    expect(shadowDispose).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0); window.dispatchEvent(new Event('resize')); expect(frames.size).toBe(0);
  });
  it('reporta falha ao criar renderer', () => {
    const onError = vi.fn();
    const handle = mountScene(host, { onReady: vi.fn(), onError, createRenderer: () => { throw new Error('WebGL'); } });
    expect(onError).toHaveBeenCalledOnce(); expect(host.children).toHaveLength(0); handle.dispose();
  });
  it('libera móveis parcialmente criados e renderer se as placas não inicializarem', () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    const geometry = vi.spyOn(BoxGeometry.prototype, 'dispose');
    const material = vi.spyOn(MeshStandardMaterial.prototype, 'dispose');
    const onError = vi.fn(); const onReady = vi.fn();
    mountScene(host, { onReady, onError, createRenderer: () => renderer });
    expect(onError).toHaveBeenCalledOnce(); expect(onReady).not.toHaveBeenCalled();
    expect(geometry).toHaveBeenCalled(); expect(material).toHaveBeenCalled();
    expect(renderer.dispose).toHaveBeenCalledOnce(); expect(host.children).toHaveLength(0);
    expect(frames.size).toBe(0);
  });
  it('aceita um layout configurado mantendo as referências e o resize', () => {
    const officeLayout = createOfficeLayout({ scale: 1.25 });
    const handle = mountScene(host, { officeLayout, onReady: vi.fn(), onError: vi.fn(), createRenderer: () => renderer });
    flush();
    const scene = renderer.render.mock.calls[0][0] as Scene;
    expect(scene.getObjectByName('btc-specialist')!.position.x).toBe(officeLayout.stations[1].position.x);
    handle.dispose();
  });
  it('mantém as placas visíveis sem encobrir os cinco personagens no desktop/mobile', () => {
    const handle = mountScene(host, { onReady: vi.fn(), onError: vi.fn(), createRenderer: () => renderer });
    try {
      for (const size of [[800, 400], [345, 350]]) {
        [width, height] = size; resize([], {} as ResizeObserver); flush();
        const [scene, camera] = renderer.render.mock.lastCall! as [Scene, PerspectiveCamera];
        scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
        for (const id of stationIds) {
          const body = new Box3().setFromObject(scene.getObjectByName(`character:${id}`)!);
          const points = [];
          for (const x of [body.min.x, body.max.x]) for (const y of [body.min.y, body.max.y])
            for (const z of [body.min.z, body.max.z]) points.push(new Vector3(x, y, z).project(camera));
          for (const stationId of stationIds) {
          const label = scene.getObjectByName(stationId)!.getObjectByName('station-label')!;
          // As placas agora são meshes presos ao mobiliário, sem billboard.
          const plate = new Box3().setFromObject(label); const platePoints = [];
          for (const x of [plate.min.x, plate.max.x]) for (const y of [plate.min.y, plate.max.y])
            for (const z of [plate.min.z, plate.max.z]) platePoints.push(new Vector3(x, y, z).project(camera));
          for (const point of platePoints) { expect(Math.abs(point.y)).toBeLessThan(0.95); expect(Math.abs(point.x)).toBeLessThan(0.98); }
          const clear = Math.max(...points.map(p => p.y)) < Math.min(...platePoints.map(p => p.y)) ||
            Math.max(...points.map(p => p.x)) < Math.min(...platePoints.map(p => p.x)) ||
            Math.min(...points.map(p => p.x)) > Math.max(...platePoints.map(p => p.x));
          expect(clear, `${id} / ${stationId}`).toBe(true);
          }
        }
      }
    } finally { handle.dispose(); }
  });
  it('trata erro ao renderizar e libera os recursos', () => {
    renderer.render.mockImplementation(() => { throw new Error('GPU'); }); const onError = vi.fn(); const ready = vi.fn();
    mountScene(host, { onReady: ready, onError, createRenderer: () => renderer }); flush();
    expect(onError).toHaveBeenCalledOnce(); expect(ready).not.toHaveBeenCalled();
    expect(renderer.dispose).toHaveBeenCalledOnce(); expect(host.children).toHaveLength(0);
  });
  it('suspende contexto perdido e restaura câmera, seleção e tempo sem salto', () => {
    const onError = vi.fn(); const restored = vi.fn();
    const handle = mountScene(host, { onReady: restored, onError, createRenderer: () => renderer }); flush(); flush(6500);
    const before = handle.getAnimationSnapshot(); const cameraBefore = handle.getCameraSnapshot();
    renderer.domElement.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(onError).toHaveBeenCalledOnce(); expect(renderer.dispose).not.toHaveBeenCalled(); expect(frames.size).toBe(0);
    window.dispatchEvent(new Event('resize')); flush(20000); expect(renderer.render).toHaveBeenCalledTimes(2);
    renderer.domElement.dispatchEvent(new Event('webglcontextrestored')); flush(30000);
    expect(handle.getAnimationSnapshot().timeMs).toBe(before.timeMs);
    expect(handle.getCameraSnapshot()).toEqual(cameraBefore); expect(restored).toHaveBeenCalledTimes(2);
    flush(31000); expect(handle.getAnimationSnapshot().timeMs).toBe(7500); handle.dispose();
  });
  it('mantém um único loop e pausa/retoma sem contar tempo pausado ou resetar no resize', () => {
    const ready = vi.fn(); const handle = mountScene(host, { onReady: ready, onError: vi.fn(), createRenderer: () => renderer });
    try {
      flush(0); expect(frames.size).toBe(1); flush(6500);
      const before = handle.getAnimationSnapshot(); expect(before.timeMs).toBe(6500);
      expect(before.characters).toHaveLength(5); expect(before.characters.some(character => character.activity === 'WALKING')).toBe(true);
      handle.pause(); expect(frames.size).toBe(0);
      width = 350; resize([], {} as ResizeObserver); flush(20000);
      expect(handle.getAnimationSnapshot().characters).toEqual(before.characters);
      expect(handle.getAnimationSnapshot().timeMs).toBe(6500); expect(frames.size).toBe(0);
      handle.resume(); handle.resume(); expect(frames.size).toBe(1);
      flush(30000); expect(handle.getAnimationSnapshot().timeMs).toBe(6500);
      flush(31000); expect(handle.getAnimationSnapshot().timeMs).toBe(7500);
      expect(ready).toHaveBeenCalledOnce(); expect(frames.size).toBe(1);
    } finally { handle.dispose(); }
    expect(frames.size).toBe(0);
  });
  it('suspende a animação com a página oculta e preserva uma pausa manual', () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const handle = mountScene(host, { onReady: vi.fn(), onError: vi.fn(), createRenderer: () => renderer });
    try {
      flush(); hidden.mockReturnValue(true); document.dispatchEvent(new Event('visibilitychange')); expect(frames.size).toBe(0);
      handle.pause(); hidden.mockReturnValue(false); document.dispatchEvent(new Event('visibilitychange')); expect(frames.size).toBe(0);
      handle.resume(); expect(frames.size).toBe(1); flush(10000); expect(handle.getAnimationSnapshot().timeMs).toBe(0);
    } finally { handle.dispose(); }
    document.dispatchEvent(new Event('visibilitychange')); expect(frames.size).toBe(0);
  });
  it('encerra o loop e libera recursos após erro em um frame posterior', () => {
    const onError = vi.fn(); const handle = mountScene(host, { onReady: vi.fn(), onError, createRenderer: () => renderer });
    flush(); renderer.render.mockImplementation(() => { throw new Error('GPU'); }); flush(5000);
    expect(onError).toHaveBeenCalledOnce(); expect(renderer.dispose).toHaveBeenCalledOnce(); expect(frames.size).toBe(0);
    handle.resume(); expect(frames.size).toBe(0); handle.dispose();
  });
});
