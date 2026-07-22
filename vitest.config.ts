import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts on purpose - these tests only exercise pure
// logic (stats classification/scoring, the XP curve, speedrun validation),
// so there's no need to load the app's dev-server proxy or worker config
// here, and no risk of test config accidentally affecting the real build.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
