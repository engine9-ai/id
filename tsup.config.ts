import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    levels: 'src/levels.ts',
    content: 'src/content.ts',
    core: 'src/core.ts',
    roles: 'src/roles.ts',
    forms: 'src/forms.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  target: 'es2022',
  platform: 'browser',
});
