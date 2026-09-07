import { defineConfig } from 'vite'

// Minimal build config: the goal at this stage is only that `vite build`
// produces static assets the Go binary can embed. There is no client UI
// here yet — see AGENTS.md and WRTN-36 onward.
export default defineConfig({
  build: {
    outDir: 'dist',
  },
})
