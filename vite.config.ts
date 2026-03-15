import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/edu-rpg/',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    target: 'es2020',
  },
});
