import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import type { AnimatedSceneHandle } from '../../src/scene/mountScene';
import type { PanelPresentation } from '../../src/contracts/panels';

declare global { interface Window { panelsProbe: AnimatedSceneHandle; panelsTime: number; panelsData: PanelPresentation; panelsUpdates: number } }
function monitor(page: Page) {
  const errors: string[] = [], external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('websocket', socket => external.push(socket.url()));
  return { errors, external };
}
async function localOnly(page: Page, external: string[]) {
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== 'http://127.0.0.1:4173') { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
}
const settle = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
async function gpu(page: Page) {
  const result = await page.locator('canvas').evaluate(element => {
    const gl = (element as HTMLCanvasElement).getContext('webgl2'); if (!gl || gl.isContextLost()) throw new Error('Sem WebGL2');
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { version: gl.getParameter(gl.VERSION), renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
  });
  expect(result.version).toContain('WebGL 2'); expect(result.renderer).not.toMatch(/SwiftShader|llvmpipe|software/i); return result;
}

test('2.6: telão, carteira e cinco painéis legíveis no aplicativo desktop/mobile', async ({ page }, info) => {
  const evidence = monitor(page); await localOnly(page, evidence.external);
  await page.addInitScript(() => { window.panelsTime = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = callback => raf(() => callback(window.panelsTime)); });
  await page.goto('/'); await expect(page.getByRole('status')).toHaveText('Cena 3D pronta');
  const portfolio = page.getByRole('region', { name: 'Carteira fictícia BTC/ETH' });
  await expect(portfolio).toContainText('SIMULAÇÃO · DADOS FICTÍCIOS');
  await expect(portfolio).toContainText('R$ 120.000,00'); await expect(portfolio).toContainText('R$ 10.000,00');
  await expect(portfolio).toContainText('0,5000 BTC'); await expect(portfolio).toContainText('4,0000 ETH');
  const agents = page.getByRole('region', { name: 'Painéis dos cinco agentes fictícios' }).getByRole('article');
  await expect(agents).toHaveCount(5);
  for (const role of ['Analista Central', 'Especialista BTC', 'Especialista ETH', 'Coordenador de Oportunidades', 'Gestor de Orçamento']) {
    await expect(page.getByRole('article', { name: role })).toContainText('SIMULAÇÃO · AGENTE FICTÍCIO');
    await expect(page.getByRole('article', { name: role })).toContainText('Atividade simulada: IDLE');
  }
  const gl = await gpu(page);
  await page.screenshot({ path: info.outputPath('panels-desktop.png'), fullPage: true });
  await page.evaluate(() => { window.panelsTime = 6500; });
  await expect(page.getByRole('article', { name: 'Especialista BTC' })).toContainText('Atividade simulada: WALKING');
  await expect(page.getByRole('article', { name: 'Analista Central' })).toContainText('Atividade simulada: WORKING');
  await expect(portfolio).toContainText('R$ 120.000,00');
  await page.setViewportSize({ width: 390, height: 844 }); await settle(page);
  await portfolio.scrollIntoViewIfNeeded(); await expect(portfolio).toBeVisible();
  const legibility = await portfolio.evaluate(element => ({ width: element.clientWidth, scroll: element.scrollWidth,
    font: Number.parseFloat(getComputedStyle(element.querySelector('p')!).fontSize) }));
  expect(legibility.scroll).toBeLessThanOrEqual(legibility.width); expect(legibility.font).toBeGreaterThanOrEqual(12);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(agents).toHaveCount(5); await page.getByRole('button', { name: 'Reenquadrar' }).click();
  await page.screenshot({ path: info.outputPath('panels-mobile.png'), fullPage: true });
  expect(evidence.errors).toEqual([]); expect(evidence.external).toEqual([]);
  await info.attach('Painéis locais em WebGL2', { body: JSON.stringify({ ...evidence, gl, legibility }), contentType: 'application/json' });
});

test('2.6: pixels reais do telão e atividades atualizadas sem interferir em câmera ou relógio', async ({ page }, info) => {
  const evidence = monitor(page); await localOnly(page, evidence.external); let moduleUrl = '';
  page.on('request', request => { if (/mountScene[^/]*\.js/.test(request.url())) moduleUrl = request.url(); });
  await page.goto('/'); await expect(page.getByRole('status')).toHaveText('Cena 3D pronta'); expect(moduleUrl).not.toBe('');
  await page.addInitScript(() => {
    window.panelsTime = 0; window.panelsUpdates = 0;
    const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = callback => raf(() => callback(window.panelsTime));
  });
  await page.route('**/__panels_probe__', route => route.fulfill({ contentType: 'text/html', body:
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}#scene{width:100vw;height:100vh}canvas{width:100%;height:100%;display:block}</style><div id="scene"></div><p id="state" hidden></p>' }));
  await page.goto('/__panels_probe__');
  await page.evaluate(async url => {
    const module = await import(/* @vite-ignore */ url);
    window.panelsProbe = module.mountScene(document.getElementById('scene')!, {
      onReady: () => { document.getElementById('state')!.textContent = 'ready'; },
      onError: () => { document.getElementById('state')!.textContent = 'lost'; },
      onPanels: (data: PanelPresentation) => { window.panelsData = data; window.panelsUpdates++; },
    });
  }, moduleUrl);
  await expect(page.locator('#state')).toHaveText('ready'); await settle(page); const gl = await gpu(page);
  const camera = (await page.evaluate(() => window.panelsProbe.getCameraSnapshot()))!;
  const projection = new PerspectiveCamera(camera.fov, camera.aspect, 0.1, 1000);
  projection.position.set(camera.position.x, camera.position.y, camera.position.z);
  projection.lookAt(camera.target.x, camera.target.y, camera.target.z); projection.updateMatrixWorld();
  const corners = [-3.675, 3.675].flatMap(x => [2.1, 4.3].map(y => new Vector3(x, y, -7.615).project(projection)));
  const size = page.viewportSize()!;
  for (const point of corners) { expect(Math.abs(point.x)).toBeLessThan(1); expect(Math.abs(point.y)).toBeLessThan(1); }
  const x = Math.floor((Math.min(...corners.map(p => p.x)) + 1) * size.width / 2);
  const y = Math.floor((1 - Math.max(...corners.map(p => p.y))) * size.height / 2);
  const width = Math.ceil((Math.max(...corners.map(p => p.x)) + 1) * size.width / 2) - x;
  const height = Math.ceil((1 - Math.min(...corners.map(p => p.y))) * size.height / 2) - y;
  const image = await page.screenshot({ path: info.outputPath('central-screen-pixels.png'), clip: { x, y, width, height } });
  const pixels = await page.evaluate(async bytes => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); bitmap.close(); const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let bright = 0, green = 0; for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 100 && data[i + 1] > 100 && data[i + 2] > 100) bright++;
      if (data[i + 1] > data[i] * 1.2 && data[i + 1] > 90) green++;
    } return { bright, green, width: canvas.width, height: canvas.height };
  }, [...image]);
  expect(pixels.bright).toBeGreaterThan(100); expect(pixels.green).toBeGreaterThan(30);
  const initial = await page.evaluate(() => window.panelsData);
  await page.evaluate(() => { window.panelsTime = 6500; });
  await expect.poll(() => page.evaluate(() => window.panelsProbe.getAnimationSnapshot().timeMs)).toBe(6500);
  const moving = await page.evaluate(() => ({ panels: window.panelsData, scene: window.panelsProbe.getAnimationSnapshot(), updates: window.panelsUpdates }));
  for (const agent of moving.panels.agents) expect(agent.activity).toBe(moving.scene.characters.find(person => person.agentId === agent.id)!.activity);
  expect(moving.panels.agents.some(agent => agent.activity === 'WALKING')).toBe(true); expect(moving.panels.portfolio).toEqual(initial.portfolio);
  expect(await page.evaluate(() => window.panelsProbe.getCameraSnapshot())).toEqual(camera);
  const updatedImage = await page.screenshot({ path: info.outputPath('central-screen-updated.png'), clip: { x, y, width, height } });
  expect(updatedImage.equals(image)).toBe(false);
  await page.evaluate(() => window.panelsProbe.pause()); await page.setViewportSize({ width: 390, height: 844 }); await settle(page);
  expect(await page.evaluate(() => window.panelsProbe.getAnimationSnapshot().timeMs)).toBe(6500);
  expect(await page.evaluate(() => window.panelsUpdates)).toBe(moving.updates);
  await page.screenshot({ path: info.outputPath('central-screen-mobile.png') });
  await page.locator('canvas').evaluate(element => {
    const canvas = element as HTMLCanvasElement & { restoreContext: () => void };
    const extension = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    canvas.restoreContext = () => extension.restoreContext(); extension.loseContext();
  });
  await expect(page.locator('#state')).toHaveText('lost');
  await page.evaluate(() => { window.panelsTime = 20000; });
  await page.locator('canvas').evaluate(element => (element as HTMLCanvasElement & { restoreContext: () => void }).restoreContext());
  await expect(page.locator('#state')).toHaveText('ready'); await settle(page); await gpu(page);
  expect(await page.evaluate(() => window.panelsProbe.getAnimationSnapshot().timeMs)).toBe(6500);
  expect(await page.evaluate(() => window.panelsProbe.getPanelSnapshot())).toEqual(moving.panels);
  await page.evaluate(() => window.panelsProbe.dispose()); await expect(page.locator('canvas')).toHaveCount(0);
  expect(evidence.errors).toEqual([]); expect(evidence.external).toEqual([]);
  await info.attach('Telão renderizado e timeline', { body: JSON.stringify({ ...evidence, gl, pixels, initial, moving }), contentType: 'application/json' });
});
