import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        // Cada vista cae en su propio chunk: el arranque solo baja el shell.
        manualChunks(id) {
          if (id.includes('/src/core/') || id.includes('/src/patterns/')) return 'runtime';
          if (id.includes('/src/components/media/Player')) return 'player';
          return undefined;
        },
      },
    },
  },
});
