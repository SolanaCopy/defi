import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'build',
    rollupOptions: {
      onwarn(warning, warn) {
        // Suppress warnings about unresolved optional deps
        if (warning.code === 'UNRESOLVED_IMPORT') return;
        warn(warning);
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
