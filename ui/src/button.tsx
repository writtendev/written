import type { ComponentPropsWithoutRef } from 'react'
import { cn } from './cn'

// Variant classes are whole literal strings, selected by key — never
// assembled from fragments (`bg-${variant}` is exactly what the repo
// AGENTS.md `## Dispatch` review invariants forbid; a Tailwind build that
// scans this package as source cannot see a class name built at runtime).
// See ui/README.md's `## Components` section.
const variantClasses = {
  primary: 'bg-accent text-ink-inverse hover:bg-accent-hover',
  secondary: 'border border-line bg-ground-raised text-ink hover:bg-ground-sunken',
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
// alternative (per-variant `disabled:bg-ground-sunken
// disabled:text-ink-subtle`) was rejected because whether it beats the
// variant's own `bg-accent` depends on Tailwind's emit order rather than
// on anything declared.
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
