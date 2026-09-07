// Shared parser for tokens.css's custom-property declarations.
//
// This is the ONLY place the parsing regex lives. Two callers import it:
// Specimen.tsx (via a `?raw` import of tokens.css, for rendering) and
// ../scripts/check-tokens.mjs (the build gate, run under plain Node, for
// asserting the built stylesheet matches). Neither hand-maintains a
// parallel list of token names — see AGENTS.md's `## Dispatch` and
// WRTN-38's ticket plan for why a specimen page, or a gate, that can drift
// from the design system is worse than none.
//
// Every export here takes the CSS source as a string argument rather than
// reading the file itself (no `?raw` import in this module): that is what
// lets a plain Node script pull in this exact parsing logic with no Vite
// runtime.
//
// Kept out of Specimen.tsx as its own module: eslint.config.js scopes
// react-refresh/only-export-components to `ui/dev/**`, which requires a
// component file to export nothing but its component. A file that also
// exported these parsing helpers would trip that rule.

/** Strips CSS block comments, so declaration matching never sees prose. */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '')
}

// Matches a custom-property declaration at the start of a line: `--name:`.
// The character class includes `*` so a namespace reset (`--color-*:`) is
// matched too; parseTokenNames drops those explicitly below, rather than
// excluding them here, so a caller that wants the resets themselves (the
// gate's reverse check) can reuse this same pattern.
const DECLARATION = /^[ \t]*(--[a-z0-9*-]+)\s*:/gim

/**
 * Every custom-property name `tokens.css` declares, in file order, with
 * namespace resets (`--color-*`, `--text-*`, `--radius-*`) and duplicates
 * removed. Comments are stripped first, so a name only mentioned in prose
 * is never mistaken for a declaration.
 */
export function parseTokenNames(source: string): string[] {
  const stripped = stripComments(source)
  const seen = new Set<string>()
  const names: string[] = []
  for (const match of stripped.matchAll(DECLARATION)) {
    const name = match[1]
    if (name.endsWith('-*') || seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

export type TokenGroup = 'color' | 'font' | 'text' | 'spacing' | 'radius' | 'other'

/** Which specimen-page section a token name belongs in, by its prefix. */
export function classifyToken(name: string): TokenGroup {
  if (name === '--spacing') return 'spacing'
  if (name.startsWith('--color-')) return 'color'
  if (name.startsWith('--font-')) return 'font'
  if (name.startsWith('--text-')) return 'text'
  if (name.startsWith('--radius-')) return 'radius'
  return 'other'
}

/** Groups token names by classifyToken, preserving each group's file order. */
export function groupTokenNames(names: string[]): Record<TokenGroup, string[]> {
  const groups: Record<TokenGroup, string[]> = {
    color: [],
    font: [],
    text: [],
    spacing: [],
    radius: [],
    other: [],
  }
  for (const name of names) {
    groups[classifyToken(name)].push(name)
  }
  return groups
}

const LINE_HEIGHT_SUFFIX = '--line-height'

export interface RampStep {
  name: string
  lineHeightName: string | null
}

/**
 * Pairs each `--text-*` size with its `--*--line-height` sibling by
 * derivation, not by a lookup table, and drops the line-height entries
 * from the primary list — they render alongside their size, not as their
 * own row.
 */
export function pairTextRamp(textNames: string[]): RampStep[] {
  const known = new Set(textNames)
  return textNames
    .filter((name) => !name.endsWith(LINE_HEIGHT_SUFFIX))
    .map((name) => {
      const lineHeightName = `${name}${LINE_HEIGHT_SUFFIX}`
      return { name, lineHeightName: known.has(lineHeightName) ? lineHeightName : null }
    })
}
