import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react({ jsxRuntime: "automatic" }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  build: {
    outDir: 'dist/public',
    rollupOptions: {
      output: {
        manualChunks: {
          'jspdf': ['jspdf'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['lucide-react', 'jspdf'],
    exclude: ['canvg', 'html2canvas', 'dompurify'],
    esbuildOptions: {
      plugins: [
        {
          name: 'core-js-external',
          setup(build) {
            build.onResolve({ filter: /^core-js\// }, (args) => ({
              path: args.path,
              external: true,
            }));
          },
        },
      ],
    },
  },
  server: {
    allowedHosts: true,
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
});
