import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import type { AnimatedSceneHandle } from '../../src/scene/mountScene';

declare global {
  interface Window { animationProbe: AnimatedSceneHandle; frameTime: number }
}

test('2.4: WebGL2 real evolui posição/pose e preserva pausa, resize e limpeza', async ({ page, context }, testInfo) => {
  const errors: string[] = [], external: string[] = [];
  context.on('page', tab => {
    tab.on('pageerror', error => errors.push(error.message));
    tab.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    tab.on('websocket', socket => external.push(socket.url()));
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  let moduleUrl = '';
  page.on('request', request => { if (/mountScene[^/]*\.(js|ts)(\?|$)/.test(request.url())) moduleUrl = request.url(); });
  await context.route('**/*', route => {
    const origin = new URL(testInfo.project.use.baseURL as string).origin;
    if (new URL(route.request().url()).origin !== origin) { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  await page.goto('/'); await expect(page.getByRole('status')).toHaveText('Cena 3D pronta');
  await expect(page.getByText('Simulação fictícia · pausada')).toBeVisible();
  expect(moduleUrl).not.toBe(''); await page.close();
  const probe = await context.newPage();
  await probe.addInitScript(() => {
    window.frameTime = 0; const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => raf(() => callback(window.frameTime));
  });
  await probe.route('**/__animation_probe__', route => route.fulfill({ contentType: 'text/html', body:
    '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Atividades fictícias locais</title><style>body{margin:0;background:#101b27}#scene{width:100vw;height:100vh}canvas{display:block;width:100%;height:100%}</style><div id="scene"></div></html>' }));
  await probe.goto('/__animation_probe__');
  await probe.evaluate(async url => {
    const module = await import(/* @vite-ignore */ url);
    const mount = (module.mountScene ?? Object.values(module).find(value => typeof value === 'function')) as typeof import('../../src/scene/mountScene')['mountScene'];
    window.animationProbe = mount(document.getElementById('scene')!, { onReady: () => {}, onError: () => { throw new Error('Falha da cena de animação'); } });
  }, moduleUrl);
  await probe.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const snapshot = () => probe.evaluate(() => window.animationProbe.getAnimationSnapshot());
  const advance = async (time: number, expected: number) => {
    await probe.evaluate(value => { window.frameTime = value; }, time);
    await expect.poll(async () => (await snapshot()).timeMs).toBe(expected);
    return snapshot();
  };
  await expect.poll(async () => (await snapshot()).characters.length).toBe(5);
  const initial = await snapshot(); const idle = await advance(1000, 1000); const working = await advance(2500, 2500);
  expect(idle.characters[0].pose).not.toEqual(initial.characters[0].pose);
  expect(working.characters[0].activity).toBe('WORKING');
  const walkingA = await advance(6500, 6500); const pixelsA = await probe.locator('canvas').screenshot();
  const walkingB = await advance(8500, 8500); const pixelsB = await probe.locator('canvas').screenshot();
  expect(pixelsA.equals(pixelsB)).toBe(false);
  const btc = (state: typeof walkingA) => state.characters.find(person => person.agentId === 'btc-specialist')!;
  expect(btc(walkingA).activity).toBe('WALKING'); expect(btc(walkingA).position).not.toEqual(btc(walkingB).position);
  expect(btc(walkingA).pose).not.toEqual(btc(walkingB).pose);
  const gl = await probe.locator('canvas').evaluate(element => {
    const context = (element as HTMLCanvasElement).getContext('webgl2')!;
    if (!context || context.isContextLost()) throw new Error('WebGL2 indisponível');
    const debug = context.getExtension('WEBGL_debug_renderer_info');
    return { version: context.getParameter(context.VERSION) as string,
      renderer: debug ? context.getParameter(debug.UNMASKED_RENDERER_WEBGL) : context.getParameter(context.RENDERER) };
  }); expect(gl.version).toContain('WebGL 2');
  await mkdir('test-results/topic-2.4', { recursive: true });
  await probe.screenshot({ path: 'test-results/topic-2.4/walking-desktop.png' });
  await probe.evaluate(() => window.animationProbe.pause());
  await probe.setViewportSize({ width: 390, height: 844 });
  await probe.evaluate(() => { window.frameTime = 14000; });
  await expect.poll(() => probe.locator('canvas').evaluate(element => (element as HTMLCanvasElement).width)).toBe(390);
  const paused = await snapshot(); expect(paused.paused).toBe(true);
  expect(paused.timeMs).toBe(8500); expect(paused.characters).toEqual(walkingB.characters);
  await probe.evaluate(() => { window.animationProbe.resume(); window.animationProbe.resume(); });
  await expect.poll(async () => (await snapshot()).paused).toBe(false);
  await probe.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const resumed = await advance(15000, 9500); const meeting = await advance(40500, 35000);
  for (const id of ['btc-specialist', 'eth-specialist', 'budget-manager']) expect(meeting.characters.find(person => person.agentId === id)!.activity).toBe('MEETING');
  const meetingNext = await advance(41000, 35500); expect(btc(meetingNext).pose).not.toEqual(btc(meeting).pose);
  await probe.screenshot({ path: 'test-results/topic-2.4/meeting-mobile.png' });
  await probe.evaluate(() => window.animationProbe.dispose()); await expect(probe.locator('canvas')).toHaveCount(0);
  expect(errors).toEqual([]); expect(external).toEqual([]);
  await writeFile('test-results/topic-2.4/animation-browser.json', JSON.stringify({ gl, initial, idle, working, walkingA, walkingB, paused, resumed, meeting, meetingNext, errors, external }, null, 2));
});

test('2.4: perda real de contexto encerra uma cena com animação ativa', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.getByRole('status')).toHaveText('Cena 3D pronta');
  await page.locator('canvas').evaluate(element => {
    const gl = (element as HTMLCanvasElement).getContext('webgl2')!;
    const extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Extensão de teste indisponível');
    extension.loseContext();
  });
  await expect(page.getByRole('alert')).toContainText('Não foi possível');
  await expect(page.locator('canvas')).toHaveCount(0); expect(errors).toEqual([]);
});
