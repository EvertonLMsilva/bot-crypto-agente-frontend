import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry } from 'three';
import type { BufferGeometry } from 'three';
import { assertCharacters } from '../contracts/characters';
import type { CharacterPresentation } from '../contracts/characters';
import type { OfficeLayout } from '../contracts/office';
import { disposeOffice } from './createOffice';

/** Geometria dos cinco modelos; articulações simples, sem relógio ou decisões. */
export function createCharacters(characters: readonly CharacterPresentation[], layout: OfficeLayout): Group {
  assertCharacters(characters, layout);
  const root = new Group(); root.name = 'characters';
  const materials = new Map<string, MeshStandardMaterial>();
  function material(color: string) {
    if (!materials.has(color)) materials.set(color, new MeshStandardMaterial({ color, roughness: 0.85 }));
    return materials.get(color)!;
  }
  function part(parent: Group, name: string, geometry: BufferGeometry, color: string, x: number, y: number, z: number) {
    const mesh = new Mesh(geometry, material(color)); mesh.name = name; mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function box(parent: Group, name: string, color: string, size: [number, number, number], at: [number, number, number]) {
    return part(parent, name, new BoxGeometry(...size), color, ...at);
  }
  function sphere(parent: Group, name: string, color: string, radius: number, x: number, y: number, z: number) {
    return part(parent, name, new SphereGeometry(radius, 16, 12), color, x, y, z);
  }
  try {
    for (const character of characters) {
      const group = new Group(); group.name = `character:${character.id}`;
      group.userData = { agentId: character.id, stationId: character.stationId, role: character.role, fictional: true, state: character.state };
      const { position, scale, rotationY } = character.transform;
      group.position.set(position.x, position.y, position.z); group.rotation.y = rotationY;
      group.scale.set(scale.x, scale.y, scale.z); root.add(group);
      const { color, skin, hair, accessory } = character.appearance;
      const torso = part(group, 'torso', new CylinderGeometry(0.205, 0.165, 0.52, 16), color, 0, 1.01, 0);
      torso.scale.z = 0.64;
      box(group, 'belt', '#27313a', [0.34, 0.045, 0.25], [0, 0.735, 0]);
      for (const x of [-0.105, 0.105]) box(group, 'collar', '#ded9cb', [0.08, 0.045, 0.075], [x, 1.255, -0.075]);
      box(group, 'shirt-placket', '#b9b9b1', [0.018, 0.32, 0.012], [0, 1.06, -0.132]);
      box(group, 'hips', '#263b50', [0.34, 0.18, 0.24], [0, 0.69, 0]);
      for (const [side, x] of [['left', -0.105], ['right', 0.105]] as const) {
        box(group, `${side}-leg`, '#263b50', [0.13, 0.55, 0.16], [x, 0.405, 0]);
        box(group, `${side}-shoe`, '#192733', [0.16, 0.1, 0.27], [x, 0.08, -0.05]);
      }
      for (const [side, x] of [['left', -0.25], ['right', 0.25]] as const) {
        const arm = part(group, `${side}-arm`, new CylinderGeometry(0.065, 0.055, 0.5, 12), color, x, 1.01, 0);
        arm.rotation.z = x > 0 ? -0.04 : 0.04;
        sphere(group, `${side}-hand`, skin, 0.065, x, 0.73, -0.01);
      }
      part(group, 'neck', new CylinderGeometry(0.07, 0.07, 0.15, 12), skin, 0, 1.3, 0);
      sphere(group, 'head', skin, 0.17, 0, 1.54, 0);
      part(group, 'hair', new SphereGeometry(0.186, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), hair, 0, 1.55, 0);
      for (const x of [-0.065, 0.065]) sphere(group, 'eye', '#15232e', 0.018, x, 1.54, -0.162);
      sphere(group, 'nose', skin, 0.035, 0, 1.49, -0.18);
      const detail = new Group(); detail.name = 'accessory'; group.add(detail);
      if (accessory === 'headset') {
        for (const x of [-0.195, 0.195]) box(detail, 'earpiece', '#172733', [0.06, 0.15, 0.12], [x, 1.53, 0]);
        box(detail, 'microphone', '#172733', [0.025, 0.025, 0.17], [0.19, 1.44, -0.1]);
      } else if (accessory === 'cap') {
        part(detail, 'cap', new CylinderGeometry(0.19, 0.2, 0.1, 16), '#d5983f', 0, 1.69, 0);
        box(detail, 'cap-brim', '#d5983f', [0.4, 0.035, 0.24], [0, 1.65, -0.13]);
      } else if (accessory === 'bun') {
        sphere(detail, 'hair-bun', hair, 0.09, 0, 1.7, 0.1);
      } else if (accessory === 'glasses') {
        for (const x of [-0.075, 0.075]) box(detail, 'glasses', '#263546', [0.12, 0.055, 0.025], [x, 1.55, -0.17]);
        box(detail, 'bridge', '#263546', [0.045, 0.018, 0.025], [0, 1.55, -0.175]);
      } else {
        const tie = box(detail, 'tie', '#173446', [0.07, 0.31, 0.015], [0, 1.06, -0.13]); tie.rotation.z = 0.08;
      }
      // Reparenting com compensação preserva a geometria e a pose-base publicada.
      function joint(name: string, at: [number, number, number], parts: string[]) {
        const pivot = new Group(); pivot.name = name; pivot.position.set(...at);
        for (const child of [...group.children]) if (parts.includes(child.name)) {
          child.position.sub(pivot.position); pivot.add(child);
        }
        group.add(pivot);
      }
      for (const [side, x] of [['left', -0.105], ['right', 0.105]] as const)
        joint(`${side}-leg-pivot`, [x, 0.68, 0], [`${side}-leg`, `${side}-shoe`]);
      for (const [side, x] of [['left', -0.25], ['right', 0.25]] as const)
        joint(`${side}-arm-pivot`, [x, 1.25, 0], [`${side}-arm`, `${side}-hand`]);
      joint('upper-body', [0, 1, 0], ['torso', 'collar', 'shirt-placket', 'neck', 'head', 'hair', 'eye', 'nose', 'accessory', 'left-arm-pivot', 'right-arm-pivot']);
    }
    return root;
  } catch (error) {
    disposeOffice(root); root.clear(); throw error;
  }
}
