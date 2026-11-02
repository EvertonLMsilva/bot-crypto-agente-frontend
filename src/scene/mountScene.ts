import {
  AmbientLight, BoxGeometry, Color, CylinderGeometry, DirectionalLight, Mesh,
  MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, SphereGeometry, WebGLRenderer,
} from 'three';

type Renderer = Pick<WebGLRenderer, 'domElement' | 'setSize' | 'setPixelRatio' | 'render' | 'dispose' | 'forceContextLoss'>;
export interface SceneOptions {
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

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (frame !== undefined) cancelAnimationFrame(frame);
    observer?.disconnect();
    window.removeEventListener('resize', schedule);
    renderer?.domElement.removeEventListener('webglcontextlost', contextLost);
    scene.traverse(node => {
      if (node instanceof Mesh) {
        node.geometry.dispose();
        for (const material of [node.material].flat()) material.dispose();
      }
    });
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
    renderer.domElement.setAttribute('aria-label', 'Cena 3D com piso, cubo, esfera e cilindro de referência');
    scene.background = new Color('#101b27');
    camera.position.set(9, 10, 13);
    camera.lookAt(0, 0, 0);
    scene.add(new AmbientLight('#d8e8ff', 1.7));
    const light = new DirectionalLight('#ffffff', 3);
    light.position.set(4, 8, 5); scene.add(light);

    const floor = new Mesh(new PlaneGeometry(12, 10), new MeshStandardMaterial({ color: '#283e50', roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    const cube = new Mesh(new BoxGeometry(1.7, 1.7, 1.7), new MeshStandardMaterial({ color: '#5be0bb', roughness: 0.45 }));
    cube.position.set(-2.6, 0.85, 0); scene.add(cube);
    const sphere = new Mesh(new SphereGeometry(0.95, 32, 20), new MeshStandardMaterial({ color: '#77aaff', roughness: 0.4 }));
    sphere.position.set(0, 0.95, 0); scene.add(sphere);
    const cylinder = new Mesh(new CylinderGeometry(0.8, 0.8, 2, 32), new MeshStandardMaterial({ color: '#efc67b', roughness: 0.5 }));
    cylinder.position.set(2.6, 1, 0); scene.add(cylinder);

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
