import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, the browser can't call api.openfront.io directly (CORS), so the Vite
// dev server proxies /api/of/* → https://api.openfront.io/* server-side. In
// production the same path is served by the Cloudflare Pages Function in
// functions/api/of/.
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
      // A missing/generic User-Agent is a confirmed trigger for OpenFront's
      // own Cloudflare bot protection on requests from GitHub Actions
      // runner IPs specifically (already fixed the same way in worker/of.js
      // and scripts/refresh-details.mjs) - this dev proxy is also used by
      // scripts/backfill-tile-stats.mjs's throwaway Vite server in CI, which
      // hit the exact same silent failure (resolveEngineCommit's fetch
      // always failing, misreported as "needs a newer engine commit").
      '/api/of': {
        target: 'https://api.openfront.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/of/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        },
      },
      // trackerfront FFA leaderboard (no CORS) — used for the FFA ship badges.
      '/api/tf': {
        target: 'https://trackerfront.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/tf/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        },
      },
    },
  },
})
