import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vercel serves api/*.js in production; `vite` alone does not. This runs the
// same handlers in dev so pages that call /api work locally too.
const devApi = () => ({
  name: 'dev-api',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const m = req.url.match(/^\/api\/([\w-]+)/);
      if (!m) return next();
      try {
        const mod = await server.ssrLoadModule(`/api/${m[1]}.js`);
        const shim = Object.assign(res, {
          status(code) { res.statusCode = code; return shim; },
          json(body) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); },
        });
        await mod.default(req, shim);
      } catch (err) {
        res.statusCode = 500;
        res.end(String(err));
      }
    });
  },
});

export default defineConfig({
  plugins: [react(), devApi()],
  build: {
    outDir: 'build',
    // The LI.FI chunk alone is ~1.5 MB; it is lazy-loaded, so the warning is noise.
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      onwarn(warning, warn) {
        // Suppress warnings about unresolved optional deps
        if (warning.code === 'UNRESOLVED_IMPORT') return;
        warn(warning);
      },
      output: {
        // Split the heavy vendors out of the entry chunk so the browser can
        // cache them independently and download them in parallel. Anything
        // reachable only from the lazy bridge modal stays out of the entry
        // graph entirely and is not listed here.
        manualChunks: {
          react: ['react', 'react-dom'],
          ethers: ['ethers'],
          motion: ['framer-motion'],
          // Only the thin React wrapper — @tsparticles/slim is deliberately
          // left out so it stays in its own dynamically-imported chunk.
          particles: ['@tsparticles/react'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
