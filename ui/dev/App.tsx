function App() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-2 bg-ground text-ink">
      <h1 className="text-2xl font-semibold">written-ui</h1>
      <p className="text-sm text-ink-muted">
        Dev harness only. Components ship from this package as source.
      </p>
      {/* Wave-1 stand-in for WRTN-36 acceptance criterion 1: the accent
          and semantic-danger colors side by side, so they're checked as
          legibly different rather than asserted. WRTN-38's specimen page
          makes this permanent and enumerated. */}
      <div className="mt-4 flex gap-2">
        <div className="rounded-md bg-accent px-4 py-2 text-sm text-ink-inverse">accent</div>
        <div className="rounded-md bg-danger px-4 py-2 text-sm text-ink-inverse">danger</div>
      </div>
    </main>
  )
}

export default App
