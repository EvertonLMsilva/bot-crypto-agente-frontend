import { defineConfig } from '@playwright/test';
import foundation from '../../playwright.config';

export default defineConfig({
  ...foundation,
  testDir: '.',
  testMatch: 'characters.spec.ts',
  outputDir: '../../test-results/topic-2.3/browser',
  webServer: {
    command: 'npm run preview -- --outDir dist/topic-2.3 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});
