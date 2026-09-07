import { Badge, Button, Text, type BadgeTone, type ButtonVariant } from '@writtendev/ui'

// A smoke test for the three components WRTN-39 adds — not a preview of
// tokens.css (that's Specimen.tsx, WRTN-38) and not a Storybook. It is a
// row of buttons, a row of badges, and a heading, imported through the
// public specifier (`@writtendev/ui`) so `build:harness` exercises the
// same `exports` map a real consumer resolves. See ui/README.md's
// `## Components` section and AGENTS.md's `## Dispatch`.

const BUTTON_VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost']
const BADGE_TONES: BadgeTone[] = ['neutral', 'accent', 'success', 'danger', 'outline']

function Components() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 bg-ground p-8 text-ink">
      <Text as="h1" size="2xl" family="serif" weight="semibold">
        written-ui — components
      </Text>
      <Text tone="muted">
        Smoke test for Button, Badge, and Text. Dev harness only; ships to nobody.
      </Text>

      <section className="flex flex-col gap-3">
        <Text as="h2" size="lg" weight="semibold">
          Button
        </Text>
        <div className="flex items-center gap-3">
          {BUTTON_VARIANTS.map((variant) => (
            <Button key={variant} variant={variant}>
              {variant}
            </Button>
          ))}
          <Button disabled>disabled</Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <Text as="h2" size="lg" weight="semibold">
          Badge
        </Text>
        <div className="flex items-center gap-3">
          {BADGE_TONES.map((tone) => (
            <Badge key={tone} tone={tone}>
              {tone}
            </Badge>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <Text as="h2" size="lg" weight="semibold">
          Text
        </Text>
        <Text as="h3" size="xl" family="serif" weight="semibold">
          A serif heading
        </Text>
        <Text tone="muted">Muted sans body text underneath it.</Text>
      </section>
    </main>
  )
}

export default Components
