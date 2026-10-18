import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://rurusasu.github.io',
  base: '/world-gdp-2008sna/',
  trailingSlash: 'always',
  srcDir: './web',
  publicDir: './site',
  outDir: './dist',
  output: 'static',
});
