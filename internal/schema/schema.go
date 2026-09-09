// Package schema embeds written's writ.schema: the SDLC vocabulary (review,
// comment, issue, project, cycle, document, section, label, workflow-state,
// settings) that written ships into its users' writ repositories. See
// docs/sdlc-vocabulary.md for the design reasoning this port preserves and
// the audit mapping every deleted writ spec section onto its declaration
// here.
//
// This package imports nothing from github.com/writtendev/writ: it only
// embeds a source file. The test-only dependency that parses and validates
// it lives in schema_test.go, so written's shipped binary never links the
// writ engine.
package schema

import _ "embed"

// Source is the raw contents of writ.schema, written's schema-source-file
// declaration of the SDLC vocabulary. A conforming writ repository accepts
// it via `writ schema plan` (see docs/sdlc-vocabulary.md for the exact
// acceptance commands run against the pinned writ commit).
//
//go:embed writ.schema
var Source []byte
