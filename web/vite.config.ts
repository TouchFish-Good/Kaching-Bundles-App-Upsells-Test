import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { inlineEntryStyles } from './build/inline-entry-styles.mjs';

const proxyOptions = {
  target: `http://127.0.0.1:${process.env.BACKEND_PORT || 80}`,
  changeOrigin: false,
  secure: true,
  ws: false,
};


// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), inlineEntryStyles()],
  build: {
    // Keep workspace CSS in the entry asset for embedded first navigation.
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // The primary route is static so Vite preloads it with the entry graph.
        // Keep its implementation separate from the small bootstrap module.
        manualChunks: {
          'quantity-breaks-workspace': ['./src/pages/quantity-breaks.tsx'],
        },
      },
    },
  },
  ssr: { noExternal: ['@shoplinedev/appbridge'] },
  server: {
    host: "localhost",
    port: process.env.FRONTEND_PORT as unknown as number,
    proxy: {
      ...(process.env.BACKEND_PORT ? { "^/(\\?.*)?$": proxyOptions } : {}),
      "^/api(/|(\\?.*)?$)": proxyOptions,
    },
    // ref: https://vite.dev/config/server-options.html#server-allowedhosts
    allowedHosts: true,
  },
})
