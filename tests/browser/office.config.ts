import { defineConfig } from '@playwright/test';
import foundation from '../../playwright.config';

// Validação isolada: preserva dist, capturas e resultados preexistentes do tópico 2.1.
export default defineConfig({
  ...foundation,
  testDir: '.',
  testMatch: 'scene.spec.ts',
  outputDir: '../../test-results/topic-2.2/browser',
  webServer: {
    command: 'npm run preview -- --outDir dist/topic-2.2 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});
