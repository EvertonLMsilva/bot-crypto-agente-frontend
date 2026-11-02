import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('escritório 2.2 renderiza WebGL real, cinco postos, resize e somente recursos locais', async ({ page }, testInfo) => {
  const errors: string[] = [];
  const external: string[] = [];
  const failed: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => failed.push(request.url()));
  page.on('websocket', socket => external.push(socket.url()));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:4173') { external.push(url.href); return route.abort(); }
    return route.continue();
  });
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Cena 3D pronta');
  await expect(page.getByText('Simulação fictícia · pausada')).toBeVisible();
  const canvas = page.getByRole('img', { name: /Escritório 3D/ });
  await expect(canvas).toHaveAttribute('aria-label', /análise central, BTC, ETH, coordenação e orçamento/);
  await expect(page.locator('.scene-caption')).toContainText('Um pavimento / postos reservados');
  const webgl = await canvas.evaluate(element => {
    const gl = (element as HTMLCanvasElement).getContext('webgl2');
    if (!gl || gl.isContextLost()) throw new Error('WebGL2 indisponível');
    return { version: gl.getParameter(gl.VERSION), renderer: gl.getParameter(gl.RENDERER),
      width: gl.drawingBufferWidth, height: gl.drawingBufferHeight };
  });
  expect(webgl.version).toContain('WebGL 2');
  expect(webgl.width).toBeGreaterThan(300);
  const shot = await canvas.screenshot();
  // Verifica pixels da imagem real do canvas, sem renderer simulado.
  const pixels = await page.evaluate(async bytes => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    const image = document.createElement('canvas'); image.width = bitmap.width; image.height = bitmap.height;
    const ctx = image.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); bitmap.close();
    const data = ctx.getImageData(0, 0, image.width, image.height).data;
    let mint = 0; let blue = 0; let amber = 0; const colors = new Set<string>();
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      colors.add(`${r >> 4},${g >> 4},${b >> 4}`);
      // Verde da vegetação substitui o piso verde da geometria anterior.
      if (g > r * 1.1 && g > b * 1.1 && g > 40) mint++;
      if (b > r * 1.25 && b > g * 1.08 && b > 120) blue++;
      if (r > b * 1.25 && g > b * 1.15 && r > 130) amber++;
    }
    return { mint, blue, amber, colors: colors.size };
  }, [...shot]);
  expect(pixels.mint).toBeGreaterThan(100);
  expect(pixels.blue).toBeGreaterThan(100);
  expect(pixels.amber).toBeGreaterThan(100);
  expect(pixels.colors).toBeGreaterThan(20);
  await page.screenshot({ path: 'test-results/visual-002/office-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => canvas.evaluate(element => {
    const canvas = element as HTMLCanvasElement;
    return Math.abs(canvas.width / canvas.height - canvas.clientWidth / canvas.clientHeight);
  })).toBeLessThan(0.01);
  await expect(page.getByRole('status')).toHaveText('Cena 3D pronta');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const statusBox = await page.getByRole('status').boundingBox();
  const captionBox = await page.locator('.scene-caption').boundingBox();
  expect(statusBox!.y + statusBox!.height).toBeLessThan(captionBox!.y);
  await page.screenshot({ path: 'test-results/visual-002/office-mobile.png', fullPage: true });
  expect(external).toEqual([]); expect(failed).toEqual([]); expect(errors).toEqual([]);
  await testInfo.attach('WebGL real e pixels', { body: JSON.stringify({ webgl, pixels, errors, external, failed }, null, 2), contentType: 'application/json' });
  await writeFile('test-results/visual-002/webgl-office.json', JSON.stringify({ webgl, pixels, errors, external, failed }, null, 2));
});

test('apresenta falha compreensível quando WebGL não está disponível', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
      if (String(args[0]).startsWith('webgl')) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Não foi possível exibir a cena 3D.');
  await expect(page.getByRole('alert')).toContainText('WebGL');
  await expect(page.locator('.scene-host canvas')).toHaveCount(0);
});

test('perda real do contexto WebGL encerra a cena e avisa o usuário', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('status')).toHaveText('Cena 3D pronta');
  await page.locator('canvas').evaluate(element => {
    const gl = (element as HTMLCanvasElement).getContext('webgl2')!;
    const extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Extensão de teste de perda de contexto indisponível');
    extension.loseContext();
  });
  await expect(page.getByRole('alert')).toContainText('Não foi possível');
  await expect(page.locator('.scene-host canvas')).toHaveCount(0);
});
