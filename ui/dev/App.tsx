import Components from './Components'
import Specimen from './Specimen'

// Specimen is the tokens.css style guide (WRTN-38); Components is the
// WRTN-39 smoke test for Button/Badge/Text. Rendered one after another
// rather than folded together — Specimen enumerates tokens.css by
// parsing it, and has nothing to enumerate about components, so keeping
// it a separate page preserves its "renders what it finds" contract
// (and ui/scripts/check-tokens.mjs, which checks it as built).
function App() {
  return (
    <>
      <Specimen />
      <Components />
    </>
  )
}

export default App
