import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { WebGLRenderer } from 'three';
import { Mesh, PerspectiveCamera, Scene } from 'three';
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
  });
  afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it('monta câmera, luz, piso e três referências e sinaliza pronto após renderizar', () => {
    const ready = vi.fn(); const handle = mountScene(host, { onReady: ready, onError: vi.fn(), createRenderer: () => renderer });
    expect(host.querySelector('canvas')).not.toBeNull(); expect(ready).not.toHaveBeenCalled();
    flush(); expect(ready).toHaveBeenCalledOnce();
    const [scene, camera] = renderer.render.mock.calls[0] as [Scene, PerspectiveCamera];
    expect(scene.children.filter(node => node instanceof Mesh)).toHaveLength(4);
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
  it('libera cada geometria, material, contexto, listener, observer e frame uma vez', () => {
    const handle = mountScene(host, { onReady: vi.fn(), onError: vi.fn(), createRenderer: () => renderer }); flush();
    const scene = renderer.render.mock.calls[0][0] as Scene;
    const spies: ReturnType<typeof vi.spyOn>[] = [];
    scene.traverse(node => { if (node instanceof Mesh) { spies.push(vi.spyOn(node.geometry, 'dispose'));
      for (const material of [node.material].flat()) spies.push(vi.spyOn(material, 'dispose')); } });
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
