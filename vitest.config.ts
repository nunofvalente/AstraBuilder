import { defineConfig } from 'vitest/config';

export default defineConfig({
  css: {
    postcss: {
      plugins: [],
    },
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.{ts,tsx}',
        'src/app/**/page.tsx',
        'src/app/**/layout.tsx',
        'src/app/globals.css',
        'src/i18n/locales/**',
      ],
    },
  },
});
