import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import type { AnimatedSceneHandle } from '../../src/scene/mountScene';
import type { SceneSelection } from '../../src/contracts/selection';

declare global {
  interface Window { interactionProbe: AnimatedSceneHandle; interactionTime: number }
}

async function probe(page: Page) {
  const errors: string[] = [], external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('websocket', socket => external.push(socket.url()));
  let moduleUrl = '';
  page.on('request', request => { if (/mountScene[^/]*\.(js|ts)(\?|$)/.test(request.url())) moduleUrl = request.url(); });
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== 'http://127.0.0.1:4173') { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  await page.goto('/'); await expect(page.getByRole('status')).toHaveText('Cena 3D pronta');
  await expect(page.getByRole('button', { name: 'Reenquadrar' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Limpar seleção' })).toBeDisabled();
  expect(moduleUrl).not.toBe('');
  await page.route('**/__interaction_probe__', route => route.fulfill({ contentType: 'text/html', body:
    '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Navegação local fictícia</title><style>body{margin:0;background:#101b27}#scene{width:100vw;height:100vh}canvas{display:block;width:100%;height:100%}</style><div id="scene"></div><p id="state" hidden></p></html>' }));
  await page.addInitScript(() => {
    window.interactionTime = 0; const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => raf(() => callback(window.interactionTime));
  });
  await page.goto('/__interaction_probe__');
  await page.evaluate(async url => {
    const module = await import(/* @vite-ignore */ url);
    const mount = (module.mountScene ?? Object.values(module).find(value => typeof value === 'function')) as typeof import('../../src/scene/mountScene')['mountScene'];
    window.interactionProbe = mount(document.getElementById('scene')!, {
      onReady: () => { document.getElementById('state')!.textContent = 'ready'; },
      onError: () => { document.getElementById('state')!.textContent = 'lost'; },
    });
  }, moduleUrl);
  await expect(page.locator('#state')).toHaveText('ready');
  await settle(page);
  const gl = await page.locator('canvas').evaluate(element => {
    const context = (element as HTMLCanvasElement).getContext('webgl2')!;
    if (!context || context.isContextLost()) throw new Error('WebGL2 indisponível');
    const debug = context.getExtension('WEBGL_debug_renderer_info');
    return { version: context.getParameter(context.VERSION), renderer: debug ? context.getParameter(debug.UNMASKED_RENDERER_WEBGL) : context.getParameter(context.RENDERER) };
  });
  expect(gl.version).toContain('WebGL 2'); expect(gl.renderer).not.toMatch(/SwiftShader|llvmpipe|software/i);
  return { errors, external, gl };
}
const settle = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
const cameraState = (page: Page) => page.evaluate(() => window.interactionProbe.getCameraSnapshot());
const selected = (page: Page) => page.evaluate(() => window.interactionProbe.getSelection());
async function pixel(page: Page, point: { x: number; y: number; z: number }) {
  const state = (await cameraState(page))!;
  const camera = new PerspectiveCamera(state.fov, state.aspect, 0.1, 1000);
  camera.position.set(state.position.x, state.position.y, state.position.z);
  camera.lookAt(state.target.x, state.target.y, state.target.z); camera.updateMatrixWorld();
  const p = new Vector3(point.x, point.y, point.z).project(camera), box = (await page.locator('canvas').boundingBox())!;
  return { x: box.x + (p.x + 1) / 2 * box.width, y: box.y + (1 - p.y) / 2 * box.height };
}
async function clickWorld(page: Page, point: { x: number; y: number; z: number }, value: SceneSelection, touch = false) {
  const p = await pixel(page, point);
  if (touch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
  await expect.poll(() => selected(page)).toEqual(value);
}

test('2.5 desktop: orbit, zoom, pan, seleção animada, destaque e restauração WebGL2', async ({ page }, info) => {
  const evidence = await probe(page); const initial = (await cameraState(page))!;
  await page.mouse.move(600, 400); await page.mouse.down(); await page.mouse.move(740, 460, { steps: 12 }); await page.mouse.up();
  const rotated = (await cameraState(page))!; expect(rotated.azimuth).not.toBeCloseTo(initial.azimuth);
  expect(rotated.polar).not.toBeCloseTo(initial.polar); expect(await selected(page)).toBeNull();
  await page.mouse.wheel(0, -800); await settle(page);
  const zoomed = (await cameraState(page))!; expect(zoomed.distance).toBeLessThan(rotated.distance);
  await page.mouse.move(600, 400); await page.mouse.down({ button: 'right' }); await page.mouse.move(720, 430, { steps: 8 }); await page.mouse.up({ button: 'right' });
  const panned = (await cameraState(page))!; expect(panned.target).not.toEqual(zoomed.target);
  expect(Math.abs(panned.target.x)).toBeLessThanOrEqual(4.5); expect(Math.abs(panned.target.z)).toBeLessThanOrEqual(4);
  await page.evaluate(() => window.interactionProbe.resetCamera()); await settle(page);
  expect((await cameraState(page))!.distance).toBeCloseTo(initial.distance);
  await clickWorld(page, { x: -5, y: 2.05, z: 4.74 }, { type: 'station', id: 'btc-specialist' });
  await clickWorld(page, { x: 4, y: 0, z: -6 }, { type: 'room', id: 'circulation' });
  await clickWorld(page, { x: 7.9, y: 0, z: 5.1 }, { type: 'room', id: 'eth' });
  const people = await page.evaluate(() => window.interactionProbe.getAnimationSnapshot().characters);
  expect(people).toHaveLength(5);
  for (const person of people) await clickWorld(page, { ...person.position, y: 1.55 }, { type: 'character', id: person.agentId });
  for (const [id, x, y, z] of [
    ['central-analyst', -3.15, 2.05, -3.06], ['btc-specialist', -5, 2.05, 4.74],
    ['eth-specialist', 5.5, 2.05, 4.74], ['opportunity-coordinator', -3.75, 1.12, 0.98], ['budget-manager', 3.15, 2.05, -0.96],
  ] as const) await clickWorld(page, { x, y, z }, { type: 'station', id });
  for (const [id, x, z] of [['analysis', -1.5, -2.2], ['btc', -7.3, 5], ['eth', 7.9, 5.1],
    ['coordination', -1.5, 1.5], ['budget', 1.5, 1.2], ['circulation', 4, -6]] as const)
    await clickWorld(page, { x, y: 0, z }, { type: 'room', id });
  const btc = people.find(person => person.agentId === 'btc-specialist')!;
  await clickWorld(page, { ...btc.position, y: 1.55 }, { type: 'character', id: 'btc-specialist' });
  const highlighted = await page.locator('canvas').screenshot();
  await page.evaluate(() => window.interactionProbe.clearSelection()); await settle(page);
  const clear = await page.locator('canvas').screenshot(); expect(highlighted.equals(clear)).toBe(false);
  await clickWorld(page, { ...btc.position, y: 1.55 }, { type: 'character', id: 'btc-specialist' });
  await page.evaluate(() => { window.interactionTime = 6500; });
  await expect.poll(() => page.evaluate(() => window.interactionProbe.getAnimationSnapshot().timeMs)).toBe(6500);
  const moving = await page.evaluate(() => window.interactionProbe.getAnimationSnapshot());
  expect(moving.characters.find(person => person.agentId === 'btc-specialist')!.position).not.toEqual(btc.position);
  expect(await selected(page)).toEqual({ type: 'character', id: 'btc-specialist' });
  await page.screenshot({ path: info.outputPath('desktop-selected.png') });
  await page.keyboard.press('Escape'); expect(await selected(page)).toBeNull();
  await page.mouse.click(10, 10); expect(await selected(page)).toBeNull();
  await clickWorld(page, { x: -5, y: 2.05, z: 4.74 }, { type: 'station', id: 'btc-specialist' });
  const beforeLoss = await cameraState(page);
  await page.locator('canvas').evaluate(element => {
    const canvas = element as HTMLCanvasElement & { restoreContext: () => void };
    const extension = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    canvas.restoreContext = () => extension.restoreContext(); extension.loseContext();
  });
  await expect(page.locator('#state')).toHaveText('lost');
  await page.evaluate(() => { window.interactionTime = 25000; });
  expect(await page.evaluate(() => window.interactionProbe.getAnimationSnapshot().timeMs)).toBe(6500);
  await page.locator('canvas').evaluate(element => (element as HTMLCanvasElement & { restoreContext: () => void }).restoreContext());
  await expect(page.locator('#state')).toHaveText('ready'); await settle(page);
  expect(await cameraState(page)).toEqual(beforeLoss);
  expect(await selected(page)).toEqual({ type: 'station', id: 'btc-specialist' });
  expect(await page.evaluate(() => window.interactionProbe.getAnimationSnapshot().timeMs)).toBe(6500);
  await page.evaluate(() => { window.interactionTime = 26000; });
  await expect.poll(() => page.evaluate(() => window.interactionProbe.getAnimationSnapshot().timeMs)).toBe(7500);
  await page.evaluate(() => window.interactionProbe.dispose()); await expect(page.locator('canvas')).toHaveCount(0);
  expect(evidence.errors).toEqual([]); expect(evidence.external).toEqual([]);
  await info.attach('WebGL2 e interações reais', { body: JSON.stringify({ ...evidence, initial, rotated, zoomed, panned, moving }), contentType: 'application/json' });
});

test.describe('2.5 toque real', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('tap, órbita de um dedo e zoom/pan de dois dedos no Chrome', async ({ page, context }, info) => {
    const evidence = await probe(page); const initial = (await cameraState(page))!;
    expect(await page.locator('canvas').evaluate(element => element.clientWidth)).toBe(390);
    await clickWorld(page, { x: -5, y: 2.05, z: 4.74 }, { type: 'station', id: 'btc-specialist' }, true);
    const cdp = await context.newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number; id: number }[]) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    await touch('touchStart', [{ x: 180, y: 400, id: 1 }]);
    await touch('touchMove', [{ x: 260, y: 440, id: 1 }]); await touch('touchEnd', []);
    const rotated = (await cameraState(page))!; expect(rotated.azimuth).not.toBeCloseTo(initial.azimuth);
    expect(await selected(page)).toEqual({ type: 'station', id: 'btc-specialist' });
    await touch('touchStart', [{ x: 130, y: 400, id: 1 }, { x: 230, y: 400, id: 2 }]);
    await touch('touchMove', [{ x: 100, y: 430, id: 1 }, { x: 280, y: 430, id: 2 }]); await touch('touchEnd', []);
    const pinched = (await cameraState(page))!; expect(pinched.distance).toBeLessThan(rotated.distance);
    expect(pinched.target).not.toEqual(rotated.target); expect(await selected(page)).toEqual({ type: 'station', id: 'btc-specialist' });
    await page.screenshot({ path: info.outputPath('mobile-touch.png') });
    await page.evaluate(() => window.interactionProbe.resetCamera()); await settle(page);
    await clickWorld(page, { x: 4, y: 0, z: -6 }, { type: 'room', id: 'circulation' }, true);
    const state = await cameraState(page); await page.setViewportSize({ width: 844, height: 390 }); await settle(page);
    expect((await cameraState(page))!.target).toEqual(state!.target);
    expect((await cameraState(page))!.azimuth).toBeCloseTo(state!.azimuth);
    expect(await selected(page)).toEqual({ type: 'room', id: 'circulation' });
    await page.evaluate(() => window.interactionProbe.dispose()); await cdp.detach();
    expect(evidence.errors).toEqual([]); expect(evidence.external).toEqual([]);
    await info.attach('WebGL2 e toque nativo', { body: JSON.stringify({ ...evidence, initial, rotated, pinched }), contentType: 'application/json' });
  });
});

test('2.5 interface: reenquadra, apresenta e limpa seleção no aplicativo desktop/mobile', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => raf(() => callback(0));
  });
  await page.goto('/'); await expect(page.getByRole('status')).toHaveText('Cena 3D pronta');
  const canvas = page.locator('canvas'); const box = (await canvas.boundingBox())!;
  const before = await canvas.screenshot({ path: info.outputPath('initial.png') });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2, { steps: 8 }); await page.mouse.up();
  const rotated = await canvas.screenshot(); expect(rotated.equals(before)).toBe(false);
  await page.getByRole('button', { name: 'Reenquadrar' }).click(); await settle(page);
  await page.mouse.move(0, 0);
  await page.getByRole('button', { name: 'Reenquadrar' }).evaluate(element => (element as HTMLButtonElement).blur());
  const reset = await canvas.screenshot({ path: info.outputPath('reset.png') });
  const difference = await page.evaluate(async ([a, b]) => {
    async function pixels(bytes: number[]) {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0); bitmap.close();
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    }
    const [left, right] = await Promise.all([pixels(a), pixels(b)]); let error = 0, changed = 0;
    for (let i = 0; i < left.length; i += 4) {
      const delta = Math.abs(left[i] - right[i]) + Math.abs(left[i + 1] - right[i + 1]) + Math.abs(left[i + 2] - right[i + 2]);
      error += delta; if (delta > 0) changed++;
    }
    return { mean: error / (left.length / 4 * 3), ratio: changed / (left.length / 4) };
  }, [[...before], [...reset]]);
  await info.attach('Precisão visual do reenquadramento', { body: JSON.stringify(difference), contentType: 'application/json' });
  // A pose é testada numericamente; a GPU pode variar a cobertura de pixels nas bordas.
  expect(difference.mean).toBeLessThan(0.1); expect(difference.ratio).toBeLessThan(0.005);
  await canvas.click(); await expect(page.getByRole('button', { name: 'Limpar seleção' })).toBeEnabled();
  await expect(page.locator('[aria-live="polite"]')).toContainText('fictício');
  await page.getByRole('button', { name: 'Limpar seleção' }).click();
  await expect(page.getByRole('button', { name: 'Limpar seleção' })).toBeDisabled();
  await page.screenshot({ path: info.outputPath('application-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await settle(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Reenquadrar' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('application-mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
});
