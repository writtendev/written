import { createElement, type HTMLAttributes, type Ref } from 'react'
import { cn } from './cn'

// `as` is a closed union of intrinsic tags, not generic polymorphism —
// React.createElement(as, …) with HTMLAttributes<HTMLElement> typechecks
// cleanly and needs no generic component, no ElementType, no
// ComponentPropsWithoutRef<T> gymnastics. An eight-tag union covers
// everything a review tool renders; see ui/README.md's `## Components`
// section for the full reasoning.
//
// No `'label'`: an explicitly-associated form `<label for>` needs
// `htmlFor`, which isn't on `HTMLAttributes` (it's `LabelHTMLAttributes`)
// — giving every `as` variant an `htmlFor` prop would let it appear on a
// `<div>` just as much as a `<label>`, and a per-tag discriminated union
// is exactly the generic-polymorphism machinery the plain
// `HTMLAttributes<HTMLElement>` approach above exists to avoid. A tag the
// primitive cannot properly support is worse than not offering it; the
// day a real `<label>` is needed, it's an ordinary native element, not a
// `<Text as="label">`.
export type TextTag = 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span' | 'div' | 'code'

// Semantics (`as`: what the document says) and scale (`size`: what it
// looks like) are independent on purpose — an <h3> at text-lg is a
// normal, correct thing to want. Coupling them is how a text primitive
// turns into six components.
const sizeClasses = {
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
  '3xl': 'text-3xl',
} as const

// The three roles tokens.css defines, no more: serif for display
// headings, sans for body, mono only where the content is actually code.
const familyClasses = {
  sans: 'font-sans',
  serif: 'font-serif',
  mono: 'font-mono',
} as const

// One of the few properties a caller's className can safely override —
// included as a prop anyway so a serif 3xl heading doesn't have to reach
// for className for the ordinary case.
const weightClasses = {
  regular: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
} as const

const toneClasses = {
  default: 'text-ink',
  muted: 'text-ink-muted',
  subtle: 'text-ink-subtle',
  inverse: 'text-ink-inverse',
  accent: 'text-accent',
} as const

export type TextSize = keyof typeof sizeClasses
export type TextFamily = keyof typeof familyClasses
export type TextWeight = keyof typeof weightClasses
export type TextTone = keyof typeof toneClasses

// `HTMLAttributes<HTMLElement>` carries no `ref` (unlike
// `ComponentProps<'tag'>` — see button.tsx and badge.tsx), because there
// is no single element type to point it at while `as` is a union: added
// explicitly here, consistent with the other two components' React 19
// ref reasoning, typed against the same `HTMLElement` every `as` variant
// shares.
export type TextProps = HTMLAttributes<HTMLElement> & {
  ref?: Ref<HTMLElement>
  as?: TextTag
  size?: TextSize
  family?: TextFamily
  weight?: TextWeight
  tone?: TextTone
}

// The one text/heading primitive. It spans the ramp with props, not with
// siblings — there is no Heading, no Display, no Code.
export function Text({
  as = 'p',
  size = 'base',
  family = 'sans',
  weight = 'regular',
  tone = 'default',
  className,
  ...props
}: TextProps) {
  return createElement(as, {
    className: cn(
      sizeClasses[size],
      familyClasses[family],
      weightClasses[weight],
      toneClasses[tone],
      className,
    ),
    ...props,
  })
}
