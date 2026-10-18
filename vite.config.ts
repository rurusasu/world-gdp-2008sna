import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    singleQuote: true,
    ignorePatterns: [
      'data/**',
      'site/**',
      'dist/**',
      'docs/**',
      'package-lock.json',
      'flake.lock',
      'uv.lock',
      'pyproject.toml',
    ],
  },
  lint: {
    ignorePatterns: ['data/**', 'site/**', 'dist/**'],
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
    options: { typeAware: true, typeCheck: true },
  },
});
