import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // The dev harness (index.html + entry point) lives entirely under
  // dev/ — it never ships. Rooting Vite there keeps that true instead
  // of leaving a harness-only index.html at the package root.
  root: 'dev',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  plugins: [react(), tailwindcss()],
})
