import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('cinco personagens fictícios: WebGL2 real, desktop/mobile e somente recursos locais', async ({ page }, testInfo) => {
  const errors: string[] = []; const external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => errors.push(request.url()));
  page.on('websocket', socket => external.push(socket.url()));
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== 'http://127.0.0.1:4173') {
      external.push(route.request().url()); return route.abort();
    }
    return route.continue();
  });
  await page.goto('/'); await expect(page.getByRole('status')).toHaveText('Cena 3D pronta');
  await expect(page.getByText('Cinco personagens fictícios · em espera')).toBeVisible();
  await expect(page.getByText('Simulação fictícia · pausada')).toBeVisible();
  const canvas = page.getByRole('img', { name: /cinco personagens fictícios/ });
  const webgl = await canvas.evaluate(element => {
    const gl = (element as HTMLCanvasElement).getContext('webgl2');
    if (!gl || gl.isContextLost()) throw new Error('WebGL2 indisponível');
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { version: gl.getParameter(gl.VERSION), renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
  });
  expect(webgl.version).toContain('WebGL 2');
  const shot = await canvas.screenshot();
  const pixels = await page.evaluate(async bytes => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    const image = document.createElement('canvas'); image.width = bitmap.width; image.height = bitmap.height;
    const context = image.getContext('2d')!; context.drawImage(bitmap, 0, 0); bitmap.close();
    const data = context.getImageData(0, 0, image.width, image.height).data;
    let skin = 0; const colors = new Set<string>();
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      colors.add(`${r >> 4},${g >> 4},${b >> 4}`);
      if (r > 110 && r > g * 1.12 && g > b * 1.1 && b > 40) skin++;
    }
    return { skin, colors: colors.size };
  }, [...shot]);
  // Pixels e capturas comprovam WebGL real; contagem/mapeamento/modelos são auditados nos testes unitários.
  expect(pixels.colors).toBeGreaterThan(100); expect(pixels.skin).toBeGreaterThan(50);
  await page.screenshot({ path: 'test-results/visual-002/characters-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => canvas.evaluate(element => {
    const c = element as HTMLCanvasElement; return Math.abs(c.width / c.height - c.clientWidth / c.clientHeight);
  })).toBeLessThan(0.01);
  await expect(page.getByRole('status')).toHaveText('Cena 3D pronta');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/visual-002/characters-mobile.png', fullPage: true });
  expect(errors).toEqual([]); expect(external).toEqual([]);
  const evidence = { webgl, pixels, errors, external };
  await writeFile('test-results/visual-002/webgl-characters.json', JSON.stringify(evidence, null, 2));
  await testInfo.attach('WebGL2 real', { body: JSON.stringify(evidence), contentType: 'application/json' });
});

test('preserva tratamento de indisponibilidade de WebGL', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
      return String(args[0]).startsWith('webgl') ? null : original.apply(this, args);
    } as typeof original;
  });
  await page.goto('/'); await expect(page.getByRole('alert')).toContainText('Não foi possível');
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('preserva limpeza e mensagem após perda real do contexto', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('status')).toHaveText('Cena 3D pronta');
  await page.locator('canvas').evaluate(element => {
    const extension = (element as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Extensão de perda de contexto indisponível');
    extension.loseContext();
  });
  await expect(page.getByRole('alert')).toContainText('Não foi possível'); await expect(page.locator('canvas')).toHaveCount(0);
});
