import { BoxGeometry, CanvasTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import type { OfficeLayout } from '../contracts/office';
import { activityLabels, assertPanelPresentation, formatSimulatedMoney } from '../contracts/panels';
import type { PanelPresentation } from '../contracts/panels';
import { disposeOffice } from './createOffice';

export function createCentralScreen(layout: OfficeLayout, initial: PanelPresentation) {
  const object = new Group(); object.name = 'central-screen'; object.userData.fictional = true;
  let disposed = false, signature = '';
  try {
    assertPanelPresentation(initial);
    const canvas = document.createElement('canvas'); canvas.width = 1536; canvas.height = 512;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Não foi possível desenhar o telão fictício.');
    const frame = new Mesh(new BoxGeometry(7.6 * layout.scale, 2.4, 0.12 * layout.scale), new MeshBasicMaterial({ color: '#20303b' }));
    object.add(frame);
    const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
    const display = new Mesh(new PlaneGeometry(7.35 * layout.scale, 2.2), new MeshBasicMaterial({ map: texture, side: DoubleSide }));
    display.name = 'central-screen-display'; display.position.z = 0.065 * layout.scale; object.add(display);
    object.position.set(layout.floor.x + layout.floor.width / 2, 3.2, layout.floor.z + 0.32 * layout.scale);
    function update(data: PanelPresentation) {
      if (disposed) return false;
      assertPanelPresentation(data); const next = JSON.stringify(data); if (next === signature) return false;
      const p = data.portfolio;
      ctx!.fillStyle = '#091b2b'; ctx!.fillRect(0, 0, canvas.width, canvas.height);
      ctx!.textAlign = 'left'; ctx!.fillStyle = '#69dfbd'; ctx!.font = 'bold 48px sans-serif';
      ctx!.fillText('CARTEIRA · SIMULAÇÃO', 40, 64);
      ctx!.fillStyle = '#dce6ee'; ctx!.font = '30px sans-serif'; ctx!.fillText(data.officeState, 40, 112);
      ctx!.font = 'bold 40px sans-serif'; ctx!.fillText(`Patrimônio fictício: ${formatSimulatedMoney(p.equityCents)}`, 40, 172);
      ctx!.font = '30px sans-serif'; ctx!.fillText(`Disponível: ${formatSimulatedMoney(p.availableCents)}   Reservado: ${formatSimulatedMoney(p.reservedCents)}`, 40, 220);
      p.positions.forEach((position, index) => {
        ctx!.fillStyle = index ? '#78b7ff' : '#ffc36b'; ctx!.font = 'bold 32px sans-serif';
        ctx!.fillText(`${position.asset}: ${formatSimulatedMoney(position.exposureCents)} · ${position.quantityLabel}`, 40 + index * 750, 280);
      });
      ctx!.fillStyle = '#dce6ee'; ctx!.font = '25px sans-serif';
      data.agents.forEach((agent, index) => ctx!.fillText(`${agent.role}: ${activityLabels[agent.activity]}`, 40 + (index % 2) * 750, 336 + Math.floor(index / 2) * 42));
      ctx!.fillStyle = '#69dfbd'; ctx!.font = '24px sans-serif'; ctx!.fillText('DADOS FICTÍCIOS · Sem cotações ou operações reais', 40, 484);
      texture.needsUpdate = true; signature = next; object.userData.content = data; return true;
    }
    function dispose() { if (disposed) return; disposed = true; object.removeFromParent(); disposeOffice(object); object.clear(); }
    update(initial); return { object, update, dispose };
  } catch (error) { disposeOffice(object); object.clear(); throw error; }
}
