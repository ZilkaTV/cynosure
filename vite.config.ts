import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, the browser can't call api.openfront.io directly (CORS), so the Vite
// dev server proxies /api/of/* → https://api.openfront.io/* server-side. In
// production the same path is served by the Vercel function in api/of/.
export default defineConfig({
  plugins: [react()],
  // replaySim.worker.ts (a module worker - see replaySim.ts) now dynamically
  // imports whichever vendored engine tree matches a game's own commit (see
  // replaySimCore.ts), which needs the worker's own output bundle to support
  // code-splitting. Vite's default worker format ('iife') can't do that -
  // 'es' can, and every browser that supports module workers already
  // supports ES module workers, so this has no compatibility cost.
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      output: {
        // Splits stable, rarely-changing vendor code from app code, so a
        // deploy that only touches app logic doesn't force every returning
        // visitor to re-download React/Router/Supabase again - the vendor
        // chunk keeps the same content hash (and stays browser-cached)
        // across app-only releases.
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api/of': {
        target: 'https://api.openfront.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/of/, ''),
      },
      // trackerfront FFA leaderboard (no CORS) — used for the FFA ship badges.
      '/api/tf': {
        target: 'https://trackerfront.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/tf/, ''),
      },
    },
  },
})
