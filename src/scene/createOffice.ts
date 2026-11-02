import {
  BoxGeometry, CanvasTexture, Color, CylinderGeometry, Group, Material, Mesh,
  MeshStandardMaterial, Object3D, Sprite, SpriteMaterial, SRGBColorSpace, Texture,
} from 'three';
import type { BufferGeometry } from 'three';
import { assertOfficeLayout } from '../contracts/office';
import type { OfficeLayout } from '../contracts/office';

/** Inclui texturas das placas e materiais compartilhados, descartados uma só vez. */
export function disposeOffice(root: Object3D): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>(); const textures = new Set<Texture>();
  root.traverse(node => {
    if (node instanceof Mesh) geometries.add(node.geometry);
    if (node instanceof Mesh || node instanceof Sprite) for (const material of [node.material].flat()) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    }
  });
  textures.forEach(texture => texture.dispose());
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}

/** Só mobiliário e referências estáticas; não cria personagens ou comportamento. */
export function createOffice(layout: OfficeLayout): Group {
  assertOfficeLayout(layout);
  const office = new Group(); office.name = 'office';
  const materials = new Map<string, MeshStandardMaterial>();
  function material(color: string) {
    if (!materials.has(color)) materials.set(color, new MeshStandardMaterial({ color, roughness: 0.8 }));
    return materials.get(color)!;
  }
  function box(parent: Group, name: string, size: [number, number, number], at: [number, number, number], color: string) {
    const mesh = new Mesh(new BoxGeometry(...size), material(color));
    mesh.name = name; mesh.position.set(...at); parent.add(mesh); return mesh;
  }
  function label(parent: Group, title: string, subtitle: string, color: string) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Não foi possível criar as identificações do escritório.');
    ctx.fillStyle = '#142536'; ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = color; ctx.fillRect(0, 0, 8, 128);
    ctx.textAlign = 'center'; ctx.fillStyle = '#f1f5f9'; ctx.font = 'bold 44px sans-serif';
    ctx.fillText(title, 260, 60);
    ctx.fillStyle = color; ctx.font = '20px sans-serif'; ctx.fillText(subtitle, 260, 94);
    const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
    const sprite = new Sprite(new SpriteMaterial({ map: texture, depthTest: false, depthWrite: false }));
    sprite.name = 'station-label'; sprite.scale.set(3.7, 0.925, 1);
    sprite.position.set(0, 2.05, -0.8); sprite.renderOrder = 1; parent.add(sprite);
  }
  try {
    const floor = layout.floor;
    box(office, 'floor', [floor.width, 0.18, floor.depth], [floor.x + floor.width / 2, -0.1, floor.z + floor.depth / 2], '#273e50');
    for (const room of layout.rooms) {
      const group = new Group(); group.name = `room:${room.id}`; group.userData.roomId = room.id; office.add(group);
      for (const area of room.areas) box(group, 'room-floor', [area.width, 0.025, area.depth],
        [area.x + area.width / 2, 0.008, area.z + area.depth / 2], new Color(room.color).multiplyScalar(0.28).getStyle());
    }
    for (const wall of layout.walls) box(office, `wall:${wall.id}`, [wall.bounds.width, wall.height, wall.bounds.depth],
      [wall.bounds.x + wall.bounds.width / 2, wall.height / 2, wall.bounds.z + wall.bounds.depth / 2], '#718898');
    for (const station of layout.stations) {
      const group = new Group(); group.name = station.id; group.userData.stationId = station.id;
      group.position.set(station.position.x, station.position.y, station.position.z);
      group.rotation.y = station.orientation; group.scale.set(layout.scale, 1, layout.scale); office.add(group);
      box(group, 'desk', [2.4, 0.14, 1.1], [0, 0.86, -0.8], '#c6d3d8');
      box(group, 'desk-accent', [2.4, 0.025, 0.1], [0, 0.945, -0.3], station.color);
      for (const x of [-1.05, 1.05]) for (const z of [-1.2, -0.4])
        box(group, 'desk-leg', [0.1, 0.74, 0.1], [x, 0.42, z], '#516774');
      box(group, 'monitor', [0.9, 0.52, 0.08], [0, 1.3, -1.04], '#152a3a');
      box(group, 'monitor-stand', [0.12, 0.25, 0.12], [0, 1, -1.04], '#516774');
      box(group, 'chair', [0.68, 0.12, 0.68], [0, 0.48, 0.25], station.color);
      box(group, 'chair-back', [0.68, 0.64, 0.1], [0, 0.82, 0.57], station.color);
      const base = new Mesh(new CylinderGeometry(0.35, 0.35, 0.08, 16), material('#516774'));
      base.position.set(0, 0.12, 0.25); base.name = 'chair-base'; group.add(base);
      box(group, 'chair-support', [0.1, 0.35, 0.1], [0, 0.3, 0.25], '#516774');
      label(group, station.label, station.roomId === 'btc' || station.roomId === 'eth' ? 'ESTAÇÃO ESPECIALIZADA' : 'POSTO RESERVADO', station.color);
    }
    return office;
  } catch (error) {
    disposeOffice(office); office.clear(); throw error;
  }
}
