// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

// https://astro.build/config
export default defineConfig({
  integrations: [svelte()],
  site: 'https://ferg-cod3s.github.io',
  base: '/tunnelforge',
  build: {
    assets: '_assets'
  }
});
