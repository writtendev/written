// Entry point for the shared component package. This is the entire
// public surface of `ui/src` — see ui/package.json's `exports` map and
// ui/README.md's `## Exports` section.
export { Badge, type BadgeProps, type BadgeTone } from './badge'
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './button'
export {
  Text,
  type TextProps,
  type TextFamily,
  type TextSize,
  type TextTag,
  type TextWeight,
  type TextTone,
} from './text'

// `web/src/main.ts` still imports this. It is the only *runtime* import
// keeping `web`'s `vite build` an actual test of workspace resolution —
// `web` cannot render a React component yet (no `react` dependency,
// `main.ts` is not `.tsx`, and making it one is not this ticket). Goes
// away when `web` becomes a real client.
export const UI_PACKAGE_PLACEHOLDER = true
