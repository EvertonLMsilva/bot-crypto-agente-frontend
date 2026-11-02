import { BoxGeometry, CanvasTexture, CylinderGeometry, DoubleSide, Group, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, RepeatWrapping, SphereGeometry, SRGBColorSpace, Texture } from 'three';
import type { BufferGeometry } from 'three';
import { assertOfficeLayout } from '../contracts/office';
import type { OfficeLayout } from '../contracts/office';

export function disposeOffice(root: Object3D): void {
  const geometries = new Set<BufferGeometry>(); const materials = new Set<Material>(); const textures = new Set<Texture>();
  root.traverse(node => {
    if (node instanceof Mesh) geometries.add(node.geometry);
    if ('material' in node) for (const material of [node.material as Material | Material[]].flat()) {
      materials.add(material); for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    }
  });
  textures.forEach(texture => texture.dispose()); geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
}

/** Mobilier procedural inspirado na DEC-003. Telões e conteúdo financeiro ficam fora desta cena. */
export function createOffice(layout: OfficeLayout): Group {
  assertOfficeLayout(layout); const office = new Group(); office.name = 'office';
  const materials = new Map<string, MeshStandardMaterial>();
  function pattern(kind: 'wood' | 'tile') {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128; const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.fillStyle = kind === 'wood' ? '#c39767' : '#8f8b83'; ctx.fillRect(0, 0, 128, 128);
    if (kind === 'wood') {
      for (let i = 0; i < 32; i++) { ctx.fillStyle = i % 3 === 0 ? '#b78b5d' : '#cca675'; ctx.fillRect(0, i * 4, 128, i % 3 === 0 ? 1 : 0.5); }
    } else {
      ctx.fillStyle = '#79766f'; ctx.fillRect(0, 0, 128, 2); ctx.fillRect(0, 0, 2, 128);
      ctx.fillStyle = '#939087'; ctx.fillRect(4, 4, 120, 1);
    }
    const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
    if (kind === 'tile') { texture.wrapS = texture.wrapT = RepeatWrapping; texture.repeat.set(layout.floor.width / 1.4, layout.floor.depth / 1.4); }
    return texture;
  }
  function material(color: string) {
    if (!materials.has(color)) materials.set(color, new MeshStandardMaterial({ color: color === 'wood' || color === 'tile' ? '#ffffff' : color,
      roughness: color === 'tile' ? 0.42 : 0.72, map: color === 'wood' || color === 'tile' ? pattern(color) ?? null : null }));
    return materials.get(color)!;
  }
  function box(parent: Group, name: string, size: [number, number, number], at: [number, number, number], color: string) {
    const mesh = new Mesh(new BoxGeometry(...size), material(color)); mesh.name = name; mesh.position.set(...at);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function label(parent: Group, title: string, color: string, compact = false) {
    // A placa ETH fica deslocada para a borda externa, liberando a vista do gestor.
    const outward = parent.name === 'eth-specialist';
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 112; const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Não foi possível criar as identificações do escritório.');
    ctx.fillStyle = '#20303b'; ctx.fillRect(0, 0, 512, 112); ctx.fillStyle = color; ctx.fillRect(0, 100, 512, 12);
    ctx.fillStyle = '#fff4df'; ctx.textAlign = 'center'; ctx.font = 'bold 43px sans-serif'; ctx.fillText(title, 256, 70);
    const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
    const plate = new Mesh(new PlaneGeometry(compact ? 1.1 : outward ? 1.5 : 2.5, compact ? 0.24 : 0.55), new MeshBasicMaterial({ map: texture, side: DoubleSide }));
    plate.name = 'station-label'; plate.position.set(compact ? -0.6 : outward ? 0.5 : 0, compact ? 1.12 : 2.05, compact ? -0.22 : -1.46); parent.add(plate);
    if (compact) {
      box(parent, 'sign-frame', [1.18, 0.29, 0.04], [-0.6, 1.12, -0.25], '#303638');
      for (const x of [-1.1, -0.1]) box(parent, 'sign-support', [0.03, 0.2, 0.03], [x, 1, -0.25], '#485153');
    } else {
      box(parent, 'sign-frame', [outward ? 1.6 : 2.6, 0.64, 0.055], [outward ? 0.5 : 0, 2.05, -1.5], '#303638');
      for (const x of outward ? [-0.22, 1.22] : [-1.23, 1.23]) box(parent, 'sign-support', [0.045, 1, 0.045], [x, 1.3, -1.5], '#485153');
    }
  }
  try {
    const f = layout.floor;
    const floor = box(office, 'floor', [f.width, 0.18, f.depth], [f.x + f.width / 2, -0.1, f.z + f.depth / 2], 'tile'); floor.userData.surface = 'neutral-tile';
    for (const room of layout.rooms) {
      const group = new Group(); group.name = `room:${room.id}`; group.userData.roomId = room.id; office.add(group);
      if (['analysis', 'coordination', 'budget'].includes(room.id)) for (const a of room.areas)
        box(group, 'rug', [a.width - 0.16 * layout.scale, 0.018, a.depth - 0.08 * layout.scale], [a.x + a.width / 2, 0, a.z + a.depth / 2], '#ada79b');
    }
    const glass = new MeshStandardMaterial({ color: '#b9e2e3', transparent: true, opacity: 0.17, roughness: 0.13, metalness: 0.1, depthWrite: false, side: DoubleSide });
    for (const wall of layout.walls) {
      const a = wall.bounds; const x = a.x + a.width / 2; const z = a.z + a.depth / 2;
      if (wall.id === 'north' || wall.id === 'west') {
        box(office, `wall:${wall.id}`, [a.width, wall.height, a.depth], [x, wall.height / 2, z], '#c6b8a0');
        box(office, 'wall-coping', [a.width, 0.08, a.depth], [x, wall.height, z], '#465057');
      } else {
        const pane = new Mesh(new BoxGeometry(a.width, wall.height, a.depth), glass); pane.name = `glass:${wall.id}`; pane.position.set(x, wall.height / 2, z); office.add(pane);
        for (const y of [0.08, wall.height]) box(office, 'glass-rail', [a.width, 0.065, a.depth], [x, y, z], '#38434a');
        const horizontal = a.width > a.depth;
        for (const end of [-0.5, 0.5]) box(office, 'glass-post', [0.055 * layout.scale, wall.height, 0.055 * layout.scale],
          [x + (horizontal ? end * a.width : 0), wall.height / 2, z + (horizontal ? 0 : end * a.depth)], '#38434a');
      }
    }
    for (const station of layout.stations) {
      const group = new Group(); group.name = station.id; group.userData.stationId = station.id;
      group.position.set(station.position.x, 0, station.position.z); group.rotation.y = station.orientation; group.scale.set(layout.scale, 1, layout.scale); office.add(group);
      const desk = box(group, 'desk', [2.52, 0.12, 1.12], [0, 0.86, -0.8], 'wood'); desk.userData.surface = 'wood';
      box(group, 'drawer', [0.5, 0.72, 0.92], [-0.97, 0.44, -0.8], '#c5b9a5');
      for (const y of [0.25, 0.47, 0.67]) box(group, 'drawer-handle', [0.18, 0.025, 0.04], [-0.97, y, -0.32], '#3d4549');
      for (const z of [-1.2, -0.4]) box(group, 'desk-leg', [0.08, 0.74, 0.08], [1.1, 0.42, z], '#39434a');
      for (const x of [-0.48, 0.48]) {
        box(group, 'monitor-frame', [0.85, 0.53, 0.07], [x, 1.26, -1.08], '#202a33');
        box(group, 'monitor', [0.76, 0.43, 0.012], [x, 1.26, -1.037], '#243d50');
        box(group, 'monitor-stand', [0.08, 0.25, 0.1], [x, 1, -1.08], '#434f58');
        box(group, 'monitor-foot', [0.3, 0.025, 0.21], [x, 0.935, -1], '#434f58');
      }
      box(group, 'keyboard', [0.66, 0.035, 0.22], [0, 0.94, -0.48], '#424c52');
      for (let row = 0; row < 3; row++) box(group, 'key-row', [0.58, 0.008, 0.012], [0, 0.96, -0.54 + row * 0.055], '#8b9496');
      box(group, 'mouse', [0.09, 0.035, 0.13], [0.55, 0.95, -0.48], '#424c52');
      box(group, 'chair', [0.72, 0.12, 0.7], [0, 0.48, 0.25], '#34424c');
      const back = box(group, 'chair-back', [0.72, 0.7, 0.09], [0, 0.87, 0.58], '#34424c'); back.rotation.x = -0.08;
      for (const x of [-0.41, 0.41]) box(group, 'chair-arm', [0.065, 0.06, 0.44], [x, 0.73, 0.22], '#29353e');
      box(group, 'chair-support', [0.09, 0.35, 0.09], [0, 0.28, 0.25], '#434b50');
      for (let i = 0; i < 5; i++) {
        const angle = i * Math.PI * 2 / 5; const leg = box(group, 'chair-spoke', [0.05, 0.045, 0.7], [0, 0.1, 0.25], '#3a4247'); leg.rotation.y = angle;
        const wheel = new Mesh(new CylinderGeometry(0.055, 0.055, 0.06, 10), material('#232c32')); wheel.rotation.z = Math.PI / 2;
        wheel.position.set(Math.sin(angle) * 0.33, 0.065, 0.25 + Math.cos(angle) * 0.33); wheel.castShadow = true; group.add(wheel);
      }
      label(group, station.label, station.color, station.id === 'opportunity-coordinator');
    }
    const plants = new Group(); plants.name = 'plants'; office.add(plants);
    for (const [x, z] of [[-8, -6.9], [8, -6.9], [-4.9, -3.05], [4.9, -3.05], [-4.9, 2.1], [4.9, 2.1], [-8.1, 7.1], [8.1, 7.1]]) {
      const plant = new Group(); plant.position.set(x * layout.scale, 0, z * layout.scale); plant.scale.set(layout.scale, 1, layout.scale); plants.add(plant);
      const pot = new Mesh(new CylinderGeometry(0.24, 0.18, 0.5, 16), material('#d9cfbb')); pot.position.y = 0.25; pot.castShadow = true; plant.add(pot);
      for (let i = 0; i < 7; i++) {
        const angle = i * Math.PI * 2 / 7; const leaf = new Mesh(new SphereGeometry(0.22, 10, 8), material(i % 2 ? '#4b6b39' : '#607e43'));
        leaf.scale.set(0.6, 1.8, 0.28); leaf.position.set(Math.sin(angle) * 0.18, 0.85 + (i % 3) * 0.1, Math.cos(angle) * 0.18);
        leaf.rotation.set(0.35 * Math.cos(angle), angle, 0.35 * Math.sin(angle)); leaf.castShadow = true; plant.add(leaf);
      }
    }
    for (const x of [-6.9, 6.9]) {
      const shelf = new Group(); shelf.position.set(x * layout.scale, 0, -7.2 * layout.scale); shelf.scale.set(layout.scale, 1, layout.scale); office.add(shelf);
      box(shelf, 'bookcase', [1.4, 1.55, 0.45], [0, 0.78, 0], 'wood');
      for (const y of [0.55, 1.15]) for (let i = 0; i < 6; i++) box(shelf, 'book', [0.12, 0.32 + (i % 2) * 0.06, 0.15], [-0.5 + i * 0.18, y, 0.29], ['#586b6d', '#b49d75', '#717c66'][i % 3]);
    }
    return office;
  } catch (error) { disposeOffice(office); office.clear(); throw error; }
}
