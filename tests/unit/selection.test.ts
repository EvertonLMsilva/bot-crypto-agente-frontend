import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Vector3 } from 'three';
import { createOfficeLayout } from '../../src/fixtures/office';
import { bindSelectionInput, createSceneSelection } from '../../src/scene/sceneSelection';

describe('raycasting e destaque reversível', () => {
  function setup() {
    const layout = createOfficeLayout(); const scene = new Scene();
    const office = new Group(), people = new Group(); scene.add(office, people);
    const material = new MeshStandardMaterial({ color: '#ff0000' });
    const station = new Group(); station.name = 'btc-specialist'; station.userData.stationId = station.name;
    const desk = new Mesh(new BoxGeometry(2, 1, 1), material); desk.position.set(-5, 0.5, 6.2); station.add(desk); office.add(station);
    const person = new Group(); person.name = 'character:btc-specialist'; person.userData.agentId = 'btc-specialist';
    const body = new Mesh(new BoxGeometry(0.5, 1.8, 0.5), material); body.position.y = 0.9; person.add(body); people.add(person);
    const camera = new PerspectiveCamera(42, 1, 0.1, 100); camera.position.set(0, 20, 20); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const onChange = vi.fn(); const selection = createSceneSelection(scene, office, people, layout, onChange);
    const pick = (point: Vector3) => selection.pick(point.project(camera), camera);
    return { scene, material, person, selection, pick, onChange };
  }
  it('retorna IDs/tipos estáveis para personagem, posto e ambiente por raios reais', () => {
    const { selection, pick } = setup();
    try {
      expect(pick(new Vector3(0, 1, 0))).toEqual({ type: 'character', id: 'btc-specialist' });
      expect(pick(new Vector3(-5, 0.8, 6.2))).toEqual({ type: 'station', id: 'btc-specialist' });
      expect(pick(new Vector3(4, 0, -6))).toEqual({ type: 'room', id: 'circulation' });
    } finally { selection.dispose(); }
  });
  it('troca e limpa seleção sem alterar materiais compartilhados ou duplicar destaques', () => {
    const { scene, material, selection, onChange } = setup(); const original = material.color.getHex();
    selection.select({ type: 'character', id: 'btc-specialist' });
    selection.select({ type: 'station', id: 'btc-specialist' });
    expect(scene.children.filter(child => child.name === 'selection-highlight')).toHaveLength(1);
    selection.select({ type: 'room', id: 'btc' });
    selection.select({ type: 'room', id: 'invalid' } as never); expect(selection.current()).toEqual({ type: 'room', id: 'btc' });
    selection.clear(); selection.clear(); expect(onChange).toHaveBeenLastCalledWith(null);
    expect(material.color.getHex()).toBe(original);
    expect(scene.getObjectByName('selection-highlight')).toBeUndefined(); selection.dispose();
  });
  it('destaque acompanha personagem animado e libera seus próprios recursos uma vez', () => {
    const { scene, person, selection, material } = setup();
    selection.select({ type: 'character', id: 'btc-specialist' });
    const helper = scene.getObjectByName('selection-highlight') as Mesh;
    const geometry = vi.spyOn(helper.geometry, 'dispose');
    const helperMaterial = vi.spyOn(helper.material as MeshStandardMaterial, 'dispose');
    const originalMaterial = vi.spyOn(material, 'dispose');
    person.position.x = 3; selection.update();
    expect(helper.position.x).toBe(3);
    selection.dispose(); selection.dispose();
    expect(geometry).toHaveBeenCalledOnce(); expect(helperMaterial).toHaveBeenCalledOnce();
    expect(originalMaterial).not.toHaveBeenCalled();
  });
  it('seleciona os seis ambientes em quatro escalas sem alterar seus contratos', () => {
    for (const scale of [0.75, 1, 1.25, 2]) {
      const layout = createOfficeLayout({ scale }), scene = new Scene(); const before = JSON.stringify(layout);
      const selection = createSceneSelection(scene, new Group(), new Group(), layout, vi.fn());
      for (const room of layout.rooms) {
        selection.select({ type: 'room', id: room.id }); expect(selection.current()?.id).toBe(room.id);
        expect(scene.children).toHaveLength(room.areas.length);
      }
      selection.dispose(); expect(scene.children).toHaveLength(0); expect(JSON.stringify(layout)).toBe(before);
    }
  });
  it('mouse/toque: ignora arrastos, pinças e cancelamentos e remove listeners', () => {
    const canvas = document.createElement('canvas'); document.body.append(canvas);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: 200, bottom: 100, width: 200, height: 100, toJSON() {} });
    const pick = vi.fn(), clear = vi.fn(); const input = bindSelectionInput(canvas, pick, clear);
    function pointer(type: string, x: number, id = 1, pointerType = 'mouse') {
      const event = new Event(type, { bubbles: true });
      Object.assign(event, { pointerId: id, clientX: x, clientY: 50, button: 0, pointerType }); canvas.dispatchEvent(event);
    }
    try {
      pointer('pointerdown', 100); pointer('pointerup', 100); expect(pick).toHaveBeenCalledTimes(1);
      pointer('pointerdown', 100, 1, 'touch'); pointer('pointerup', 100, 1, 'touch'); expect(pick).toHaveBeenCalledTimes(2);
      pointer('pointerdown', 100); pointer('pointermove', 110); pointer('pointerup', 100); expect(pick).toHaveBeenCalledTimes(2);
      pointer('pointerdown', 50, 1, 'touch'); pointer('pointerdown', 150, 2, 'touch');
      pointer('pointerup', 50, 1, 'touch'); pointer('pointerup', 150, 2, 'touch'); expect(pick).toHaveBeenCalledTimes(2);
      pointer('pointerdown', 100); pointer('pointercancel', 100); pointer('pointerup', 100); expect(pick).toHaveBeenCalledTimes(2);
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); expect(clear).toHaveBeenCalledOnce();
      input.setEnabled(false); pointer('pointerdown', 100); pointer('pointerup', 100); expect(pick).toHaveBeenCalledTimes(2);
      input.setEnabled(true); pointer('pointerdown', 100); input.dispose(); pointer('pointerup', 100);
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); expect(clear).toHaveBeenCalledOnce();
      expect(pick).toHaveBeenCalledTimes(2);
    } finally { input.dispose(); canvas.remove(); }
  });
});
