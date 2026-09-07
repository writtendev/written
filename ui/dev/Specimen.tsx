import { useMemo, type ReactNode } from 'react'
import tokensSource from '../src/tokens.css?raw'
import { groupTokenNames, pairTextRamp, parseTokenNames } from './tokens'

// The living style guide: every token tokens.css declares, enumerated from
// the file's own text (names only — see ./tokens.ts) and rendered with its
// live cascade value (var(--name) for the swatch, getComputedStyle for the
// printed label). Nothing on this page copies a value out of tokens.css;
// changing a value there, or adding a new token, changes this page with no
// other edit. See AGENTS.md's `## Dispatch` and WRTN-38's ticket plan.

const ACCENT_NAME = '--color-accent'
const ACCENT_HOVER_NAME = '--color-accent-hover'
const DANGER_NAME = '--color-danger'

function resolveValue(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

// Scales a resolved CSS length ("0.25rem") by a multiplier for the spacing
// bars' labels. This still reads the number from the cascade — never a
// hardcoded rem value — it just does the same arithmetic `calc(var(--spacing)
// * n)` does, so the label doesn't depend on measuring a DOM node's layout
// (which races the stylesheet's own load in dev mode: `getComputedStyle` on
// an element can read 0 before Vite's dev-mode CSS <link> finishes loading,
// with no re-render to correct it afterward).
function scaleLength(value: string, multiplier: number): string {
  const match = /^(-?[\d.]+)([a-z%]*)$/i.exec(value)
  if (!match) return `${value} × ${multiplier}`
  const [, amount, unit] = match
  const scaled = parseFloat(amount) * multiplier
  // Round off IEEE-754 noise (0.3 * 3 === 0.8999999999999999) before
  // printing — this only affects the label text. The bar's own width
  // still comes from `calc(var(--spacing) * n)` in SpacingBar below, so
  // the rendered size stays exact regardless of how this is formatted.
  const rounded = Math.round(scaled * 1e6) / 1e6
  return `${rounded}${unit}`
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="border-b border-line pb-1 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function MissingTokenWarning({ names }: { names: string[] }) {
  return (
    <p className="rounded-md border border-danger bg-ground-sunken p-3 text-sm text-danger">
      Missing expected token{names.length > 1 ? 's' : ''}: {names.join(', ')} — tokens.css was
      expected to declare {names.length > 1 ? 'these names' : 'this name'} but doesn't.
    </p>
  )
}

function ColorChip({ name }: { name: string }) {
  return (
    <div
      className="flex flex-col items-start gap-1 rounded-md p-3 text-sm"
      style={{ background: `var(${name})`, color: 'var(--color-ink-inverse)' }}
    >
      <code>{name}</code>
    </div>
  )
}

function ColorSwatch({ name }: { name: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className="h-16 rounded-md border"
        style={{ background: `var(${name})`, borderColor: 'var(--color-line)' }}
      />
      <code className="text-xs text-ink-muted">{name}</code>
      <code className="text-xs text-ink-subtle">{resolveValue(name)}</code>
    </div>
  )
}

function FontSpecimen({ name }: { name: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xl" style={{ fontFamily: `var(${name})` }}>
        The quick brown fox jumps over the lazy dog.
      </p>
      <code className="text-xs text-ink-muted">
        {name}: {resolveValue(name)}
      </code>
    </div>
  )
}

function RampRow({ name, lineHeightName }: { name: string; lineHeightName: string | null }) {
  return (
    <div className="flex items-baseline gap-4">
      <p
        className="w-64 shrink-0"
        style={{
          fontSize: `var(${name})`,
          lineHeight: lineHeightName ? `var(${lineHeightName})` : undefined,
        }}
      >
        Sphinx of black quartz
      </p>
      <code className="text-xs text-ink-muted">
        {name}: {resolveValue(name)}
        {lineHeightName ? ` / ${lineHeightName}: ${resolveValue(lineHeightName)}` : ''}
      </code>
    </div>
  )
}

const SPACING_MULTIPLIERS = [1, 2, 3, 4, 6, 8, 12, 16, 24]

function SpacingBar({ name, multiplier }: { name: string; multiplier: number }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-4 rounded-sm bg-accent"
        style={{ width: `calc(var(${name}) * ${multiplier})` }}
      />
      <code className="text-xs text-ink-muted">
        {name} × {multiplier} = {scaleLength(resolveValue(name), multiplier)}
      </code>
    </div>
  )
}

function RadiusBox({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="h-16 w-16 border bg-ground-raised"
        style={{ borderRadius: `var(${name})`, borderColor: 'var(--color-line)' }}
      />
      <code className="text-xs text-ink-muted">{name}</code>
      <code className="text-xs text-ink-subtle">{resolveValue(name)}</code>
    </div>
  )
}

function OtherTokenRow({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-3">
      <code className="text-xs text-ink-muted">{name}</code>
      <code className="text-xs text-ink-subtle">{resolveValue(name)}</code>
    </div>
  )
}

function Specimen() {
  const names = useMemo(() => parseTokenNames(tokensSource), [])
  const groups = useMemo(() => groupTokenNames(names), [names])
  const ramp = useMemo(() => pairTextRamp(groups.text), [groups.text])

  const hasAccent = names.includes(ACCENT_NAME)
  const hasDanger = names.includes(DANGER_NAME)
  const hasAccentHover = names.includes(ACCENT_HOVER_NAME)
  const missingAccentDanger = [!hasAccent && ACCENT_NAME, !hasDanger && DANGER_NAME].filter(
    (n): n is string => Boolean(n),
  )

  return (
    <main className="mx-auto flex min-h-svh max-w-4xl flex-col gap-12 bg-ground p-8 text-ink">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">@writtendev/ui — specimen</h1>
        <p className="text-sm text-ink-muted">
          Every token in <code>tokens.css</code>, read live from the cascade. Dev harness only;
          ships to nobody. See <code>ui/README.md</code>.
        </p>
      </header>

      <Section title="Accent vs. danger">
        {missingAccentDanger.length > 0 ? (
          <MissingTokenWarning names={missingAccentDanger} />
        ) : (
          <div className="flex gap-3">
            <ColorChip name={ACCENT_NAME} />
            <ColorChip name={DANGER_NAME} />
            {hasAccentHover && <ColorChip name={ACCENT_HOVER_NAME} />}
          </div>
        )}
      </Section>

      <Section title="Color">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {groups.color.map((name) => (
            <ColorSwatch key={name} name={name} />
          ))}
        </div>
      </Section>

      <Section title="Type — families">
        <div className="flex flex-col gap-4">
          {groups.font.map((name) => (
            <FontSpecimen key={name} name={name} />
          ))}
        </div>
      </Section>

      <Section title="Type — ramp">
        <div className="flex flex-col gap-3">
          {ramp.map((step) => (
            <RampRow key={step.name} name={step.name} lineHeightName={step.lineHeightName} />
          ))}
        </div>
      </Section>

      <Section title="Spacing">
        <div className="flex flex-col gap-2">
          {groups.spacing.map((name) =>
            SPACING_MULTIPLIERS.map((multiplier) => (
              <SpacingBar key={`${name}-${multiplier}`} name={name} multiplier={multiplier} />
            )),
          )}
        </div>
      </Section>

      <Section title="Radii">
        <div className="flex gap-6">
          {groups.radius.map((name) => (
            <RadiusBox key={name} name={name} />
          ))}
        </div>
      </Section>

      {groups.other.length > 0 && (
        <Section title="Other">
          <div className="flex flex-col gap-2">
            {groups.other.map((name) => (
              <OtherTokenRow key={name} name={name} />
            ))}
          </div>
        </Section>
      )}
    </main>
  )
}

export default Specimen
