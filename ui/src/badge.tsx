import type { ComponentPropsWithoutRef } from 'react'
import { cn } from './cn'

// Solid fills, not tinted washes. WRTN-36 measured that a pale accent
// wash and a pale danger wash land at ΔE_OK 0.016-0.044 — at or below the
// just-noticeable threshold — which would reintroduce "brand reads as
// failure" in exactly the one component where the two tones sit side by
// side. Solid fills against `--color-ink-inverse` are ~10 JNDs apart and
// clear WCAG AA on every one of them. See ui/README.md's `## Components`
// section.
const toneClasses = {
  neutral: 'border border-line bg-ground-sunken text-ink',
  accent: 'bg-accent text-ink-inverse',
  success: 'bg-success text-ink-inverse',
  danger: 'bg-danger text-ink-inverse',
  outline: 'border border-line-strong bg-transparent text-ink',
} as const

const baseClasses =
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap'

export type BadgeTone = keyof typeof toneClasses

export type BadgeProps = ComponentPropsWithoutRef<'span'> & {
  tone?: BadgeTone
}

// A <span> — there is no behaviour or ARIA role to wire, so there is
// nothing here for Radix to earn its place doing.
export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return <span className={cn(baseClasses, toneClasses[tone], className)} {...props} />
}
