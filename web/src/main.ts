// Placeholder entry point for `written web`.
//
// This proves the workspace wiring (web -> ui, and a working `vite build`
// that the Go binary can later embed); it is not the client itself. The
// actual UI lands once @writtendev/ui has real contents — see AGENTS.md and
// WRTN-36 onward.
import { UI_PACKAGE_PLACEHOLDER } from '@writtendev/ui'

if (UI_PACKAGE_PLACEHOLDER) {
  const app = document.getElementById('app')
  if (app) {
    app.textContent = 'written web — coming soon'
  }
}
