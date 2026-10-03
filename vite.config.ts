import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { contentSecurityPolicy, serviceWorker } from './build/plugins.ts';

export default defineConfig({
  build: {
    target: 'es2022',
  },
  plugins: [
    contentSecurityPolicy(),
    serviceWorker(fileURLToPath(new URL('./src/sw/sw.template.js', import.meta.url))),
  ],
});
