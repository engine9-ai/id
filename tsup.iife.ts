import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { id: 'src/iife.ts' },
  format: ['iife'],
  outExtension: () => ({ js: '.iife.js' }),
  sourcemap: true,
  minify: true,
  clean: false,
  dts: false,
  target: 'es2022',
  platform: 'browser',
});
