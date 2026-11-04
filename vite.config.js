import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The single-file build lets dist/index.html open by double-click, with no server.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { assetsInlineLimit: 100000000, chunkSizeWarningLimit: 4000 },
  server: { port: 5173 },
});
