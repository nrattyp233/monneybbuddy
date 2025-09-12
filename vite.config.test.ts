/// <reference types="vitest" />
import { defineConfig } from 'vite'
import { defineConfig as defineViteConfig } from './vite.config'

export default defineConfig({
  ...defineViteConfig({ mode: 'test' }),
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
  },
})