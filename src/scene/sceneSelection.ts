import { Box3, Box3Helper, Camera, Object3D, Plane, Raycaster, Scene, Vector2, Vector3 } from 'three';
import type { OfficeLayout } from '../contracts/office';
import type { SceneSelection } from '../contracts/selection';

/** Destaque próprio: nunca modifica materiais compartilhados de móveis/personagens. */
export function createSceneSelection(scene: Scene, office: Object3D, people: Object3D, layout: OfficeLayout,
  onChange: (value: SceneSelection | null) => void) {
  const ray = new Raycaster(), floor = new Plane(new Vector3(0, 1, 0), 0), point = new Vector3();
  let selected: SceneSelection | null = null, helper: Box3Helper | undefined, disposed = false;
  const additionalRegions: Box3Helper[] = [];
  const find = (value: SceneSelection) => value.type === 'character' ? people.children.find(node => node.userData.agentId === value.id) :
    value.type === 'station' ? office.children.find(node => node.userData.stationId === value.id) : undefined;
  function release() {
    for (const region of [helper, ...additionalRegions]) { region?.removeFromParent(); region?.dispose(); }
    helper = undefined; additionalRegions.length = 0;
  }
  function makeHelper(bounds: Box3, name: string) {
    const region = new Box3Helper(bounds, 0xffe36b); region.name = name;
    for (const material of [region.material].flat()) { material.depthTest = false; material.transparent = true; }
    region.renderOrder = 100; scene.add(region); return region;
  }
  function update() {
    if (!helper || !selected || disposed) return;
    if (selected.type !== 'room') {
      const object = find(selected); if (object) { object.updateWorldMatrix(true, true); helper.box.setFromObject(object); }
    }
    helper.updateMatrixWorld(true);
  }
  function select(value: SceneSelection | null) {
    if (disposed || (value && !(value.type === 'room' ? layout.rooms.some(room => room.id === value.id) : find(value)))) return;
    if (selected?.id === value?.id && selected?.type === value?.type) return;
    release(); selected = value ? { ...value } : null;
    if (selected) {
      if (selected.type === 'room') {
        const areas = layout.rooms.find(room => room.id === selected!.id)!.areas;
        areas.forEach((area, index) => {
          const region = makeHelper(new Box3(new Vector3(area.x, 0.06, area.z),
            new Vector3(area.x + area.width, 0.1, area.z + area.depth)), index ? 'selection-region' : 'selection-highlight');
          if (index) additionalRegions.push(region); else helper = region;
        });
      } else helper = makeHelper(new Box3(), 'selection-highlight');
      update();
    }
    onChange(selected ? { ...selected } : null);
  }
  function pick(ndc: Vector2 | Vector3, camera: Camera) {
    if (disposed) return null;
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    ray.setFromCamera(new Vector2(ndc.x, ndc.y), camera);
    // Móveis opacos impedem selecionar objetos ocultos; vidro permite atravessar o raio.
    for (const hit of ray.intersectObjects([office, people], true)) {
      let node: Object3D | null = hit.object;
      while (node) {
        if (node.userData.agentId) { select({ type: 'character', id: node.userData.agentId }); return current(); }
        if (node.userData.stationId) { select({ type: 'station', id: node.userData.stationId }); return current(); }
        node = node.parent;
      }
      if (hit.object.name.startsWith('glass:')) continue;
      // O piso é a referência comum inclusive para ambientes sem tapete/malha própria.
      if (hit.point.y < 0.12) break;
      select(null); return null;
    }
    const floorHit = ray.ray.intersectPlane(floor, point);
    const room = floorHit && layout.rooms.find(room => room.areas.some(area => point.x >= area.x && point.x <= area.x + area.width &&
      point.z >= area.z && point.z <= area.z + area.depth));
    select(room ? { type: 'room', id: room.id } : null); return current();
  }
  function current() { return selected ? { ...selected } : null; }
  return { pick, select, current, update, clear: () => select(null),
    dispose() { if (disposed) return; disposed = true; release(); selected = null; } };
}

/** Um toque/clique seleciona; arrasto, pinça e cancelamento nunca selecionam. */
export function bindSelectionInput(canvas: HTMLCanvasElement, pick: (ndc: Vector2) => void, clear: () => void) {
  const pointers = new Map<number, { x: number; y: number; moved: boolean }>();
  let enabled = true, disposed = false;
  function down(event: PointerEvent) {
    if (!enabled || event.button !== 0) return;
    if (pointers.size) for (const value of pointers.values()) value.moved = true;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, moved: pointers.size > 0 });
  }
  function move(event: PointerEvent) {
    const start = pointers.get(event.pointerId);
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) start.moved = true;
  }
  function up(event: PointerEvent) {
    move(event); const start = pointers.get(event.pointerId); pointers.delete(event.pointerId);
    if (!enabled || !start || start.moved) return;
    const box = canvas.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0 || event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) return;
    pick(new Vector2((event.clientX - box.left) / box.width * 2 - 1, -(event.clientY - box.top) / box.height * 2 + 1));
  }
  function cancel(event: PointerEvent) { pointers.delete(event.pointerId); }
  function key(event: KeyboardEvent) { if (enabled && event.key === 'Escape') clear(); }
  canvas.addEventListener('pointerdown', down);
  const document = canvas.ownerDocument;
  document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', cancel); canvas.addEventListener('lostpointercapture', cancel);
  canvas.addEventListener('keydown', key);
  return {
    setEnabled(value: boolean) { enabled = value; pointers.clear(); },
    dispose() {
      if (disposed) return; disposed = true; enabled = false; pointers.clear();
      canvas.removeEventListener('pointerdown', down); document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', cancel);
      canvas.removeEventListener('lostpointercapture', cancel); canvas.removeEventListener('keydown', key);
    },
  };
}
