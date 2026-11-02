import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { WebGLRenderer } from 'three';
import { Box3, BoxGeometry, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Sprite, Texture, Vector3 } from 'three';
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
  const flush = () => { const queued = [...frames.values()]; frames.clear(); queued.forEach(fn => fn(0)); };
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
      for (const point of points) { expect(Math.abs(point.x)).toBeLessThan(0.93); expect(Math.abs(point.y)).toBeLessThan(0.73); }
      const horizontal = Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x));
      const vertical = Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y));
      expect(Math.max(horizontal, vertical)).toBeGreaterThan(1.2);
    } } finally { handle.dispose(); }
  });
  it('libera cada geometria, material, contexto, listener, observer e frame uma vez', () => {
    const handle = mountScene(host, { onReady: vi.fn(), onError: vi.fn(), createRenderer: () => renderer }); flush();
    const scene = renderer.render.mock.calls[0][0] as Scene;
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
          const label = scene.getObjectByName(id)!.getObjectByName('station-label')!;
          const center = label.getWorldPosition(new Vector3());
          const depth = -center.clone().applyMatrix4(camera.matrixWorldInverse).z;
          const scale = label.getWorldScale(new Vector3());
          center.project(camera);
          const halfHeight = scale.y / (2 * depth * Math.tan(camera.fov * Math.PI / 360));
          const halfWidth = scale.x / (2 * depth * Math.tan(camera.fov * Math.PI / 360) * camera.aspect);
          expect(Math.abs(center.y) + halfHeight).toBeLessThan(0.95);
          const clear = Math.max(...points.map(p => p.y)) < center.y - halfHeight ||
            Math.max(...points.map(p => p.x)) < center.x - halfWidth ||
            Math.min(...points.map(p => p.x)) > center.x + halfWidth;
          expect(clear, id).toBe(true);
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
  it('trata perda de contexto como falha e encerra a cena', () => {
    const onError = vi.fn(); mountScene(host, { onReady: vi.fn(), onError, createRenderer: () => renderer }); flush();
    renderer.domElement.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(onError).toHaveBeenCalledOnce(); expect(renderer.dispose).toHaveBeenCalledOnce();
  });
});
