import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { contentSecurityPolicy, serviceWorker } from './build/plugins.ts';

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  build: {
    target: 'es2022',
    rolldownOptions: {
      input: {
        main: page('./index.html'),
        privacy: page('./privacy/index.html'),
        terms: page('./terms/index.html'),
      },
    },
  },
  plugins: [contentSecurityPolicy(), serviceWorker(page('./src/sw/sw.template.js'))],
});
