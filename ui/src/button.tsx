import type { ComponentPropsWithoutRef } from 'react'
import { cn } from './cn'

// Variant classes are whole literal strings, selected by key — never
// assembled from fragments (`bg-${variant}` is exactly what the repo
// AGENTS.md `## Dispatch` review invariants forbid; a Tailwind build that
// scans this package as source cannot see a class name built at runtime).
// See ui/README.md's `## Components` section.
//
// `secondary` has no filled surface of its own to read as a control by,
// so its border carries that job alone — it uses the token meant for an
// interactive boundary rather than the plain rule/divider one, to clear
// WCAG 1.4.11's 3:1 non-text contrast minimum. See tokens.css's comment
// on that token for the contrast figures.
const variantClasses = {
  primary: 'bg-accent text-ink-inverse hover:bg-accent-hover',
  secondary: 'border border-line-interactive bg-ground-raised text-ink hover:bg-ground-sunken',
  ghost: 'bg-transparent text-ink hover:bg-ground-sunken',
} as const

const sizeClasses = {
  sm: 'h-8 gap-1.5 rounded-md px-3 text-sm',
  md: 'h-9 gap-2 rounded-md px-4 text-sm',
  lg: 'h-10 gap-2 rounded-md px-6 text-base',
} as const

// `disabled:opacity-50` is the one untokened value in this file, and
// deliberately so: Tailwind v4 has no `--opacity-*` theme namespace, so
// there is no token to add — it's a bare scale utility like `gap-2`, not
// a hex code, a px literal, or a named color. The fully-tokened
// alternative — a per-variant disabled background and ink-color pairing,
// swapped in under the disabled state instead of dimming with opacity —
// was rejected because whether that pairing beats a variant's own filled
// background depends on Tailwind's emit order rather than on anything
// declared. (Deliberately not spelled out as literal class names here:
// this file ships as source, and a Tailwind build scanning it as source
// would pick up an unused pairing mentioned only in prose — see
// ui/README.md's `## Components` section.)
const baseClasses =
  'inline-flex items-center justify-center whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-50'

export type ButtonVariant = keyof typeof variantClasses
export type ButtonSize = keyof typeof sizeClasses

export type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

// A native <button> — focus, disabled, keyboard activation, and role are
// already correct from the platform, so there is nothing here for Radix
// to wire (see ui/README.md). `type` defaults to 'button' so a Button
// dropped inside a <form> does not silently submit it.
export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
      {...props}
    />
  )
}
