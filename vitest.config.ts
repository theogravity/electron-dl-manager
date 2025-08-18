import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [],
    include: ['test/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', 'dist']
  },
  resolve: {
    alias: {
      electron: path.resolve(__dirname, '__mocks__/electron.js')
    }
  }
})
