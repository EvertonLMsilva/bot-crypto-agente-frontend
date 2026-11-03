import { afterEach, describe, expect, it, vi } from 'vitest';
import { Box3, Mesh, Texture, Vector3 } from 'three';
import { createOfficeLayout } from '../../src/fixtures/office';
import { createPanelFixture, withVisualActivities } from '../../src/fixtures/panels';
import { createCentralScreen } from '../../src/scene/createCentralScreen';

afterEach(() => vi.restoreAllMocks());
describe('telão 3D com textura local', () => {
  function context() {
    const ctx = { fillRect: vi.fn(), fillText: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    return ctx;
  }
  it('monta atrás dos postos e acima das rotas nas quatro escalas, com SIMULAÇÃO e BTC/ETH', () => {
    const ctx = context();
    for (const scale of [0.75, 1, 1.25, 2]) {
      const layout = createOfficeLayout({ scale }); const panel = createCentralScreen(layout, createPanelFixture());
      try {
        const box = new Box3().setFromObject(panel.object);
        expect(box.min.y).toBeGreaterThan(1.85); expect(box.max.z).toBeLessThan(-7 * scale);
        expect(box.containsPoint(new Vector3(0, 0, 0))).toBe(false);
        expect(panel.object.getObjectByName('central-screen-display')).toBeDefined();
      } finally { panel.dispose(); }
    }
    const text = ctx.fillText.mock.calls.map(call => call[0]).join(' ');
    expect(text).toContain('SIMULAÇÃO'); expect(text).toContain('BTC'); expect(text).toContain('ETH'); expect(text).toContain('120.000');
  });
  it('reutiliza textura e só redesenha quando o conteúdo muda; libera tudo uma vez', () => {
    const ctx = context(), data = createPanelFixture(); const panel = createCentralScreen(createOfficeLayout(), data);
    const display = panel.object.getObjectByName('central-screen-display') as Mesh;
    const resources = new Set<{ dispose: () => void }>();
    panel.object.traverse(node => { if (node instanceof Mesh) { resources.add(node.geometry); for (const material of [node.material].flat()) {
      resources.add(material); for (const value of Object.values(material)) if (value instanceof Texture) resources.add(value);
    } } });
    const spies = [...resources].map(resource => vi.spyOn(resource, 'dispose'));
    const material = display.material; const count = ctx.fillText.mock.calls.length;
    expect(panel.update(data)).toBe(false); expect(ctx.fillText).toHaveBeenCalledTimes(count);
    expect(panel.update(withVisualActivities(data, data.agents.map(agent => ({ agentId: agent.id, activity: 'WORKING' }))))).toBe(true);
    expect(display.material).toBe(material);
    panel.dispose(); panel.dispose(); for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
    expect(panel.update(data)).toBe(false);
  });
  it('falha ao desenhar depois de alocar recursos e os descarta sem deixar objetos', async () => {
    const ctx = context(); ctx.fillText.mockImplementation(() => { throw new Error('canvas'); });
    const { BufferGeometry, Material } = await import('three');
    const geometry = vi.spyOn(BufferGeometry.prototype, 'dispose'), material = vi.spyOn(Material.prototype, 'dispose'), texture = vi.spyOn(Texture.prototype, 'dispose');
    expect(() => createCentralScreen(createOfficeLayout(), createPanelFixture())).toThrow('canvas');
    expect(geometry).toHaveBeenCalledTimes(2); expect(material).toHaveBeenCalledTimes(2); expect(texture).toHaveBeenCalledOnce();
  });
});
