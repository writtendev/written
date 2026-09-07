// Joins whole class-name strings with a space, dropping any falsy value.
// Every argument here must already be a complete literal string — this
// never assembles a class from fragments. See ui/README.md's
// `## Components` section and the repo AGENTS.md `## Dispatch` review
// invariants ("no dynamically constructed class names").
//
// Not exported from the package barrel (ui/src/index.ts): it's an
// internal helper, not part of the public surface WRTN-37 just finished
// enumerating.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
