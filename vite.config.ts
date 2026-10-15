import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // dev.html = page de développement (sources TypeScript) ; index.html à la racine = jeu compilé autonome (GitHub Pages)
  build: { target: 'es2020', chunkSizeWarningLimit: 1500, rollupOptions: { input: 'dev.html' } },
  test: {
    globals: true,
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node',
  },
});
