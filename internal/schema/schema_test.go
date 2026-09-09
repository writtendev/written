package schema

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/writtendev/writ/engine"
	"github.com/writtendev/writ/engine/schemasrc"
	"github.com/writtendev/writ/engine/state"
)

// testObjectID is the schema object id used only to exercise Compile in
// this test. A real repository mints its own 32-hex id at apply time
// (spec/schema-source.md §5); reusing one id across successive applies of
// the same source file is load-bearing there, but this test never applies
// anything, so any well-formed id works.
const testObjectID = "0123456789abcdef0123456789abcdef"

// compile reproduces what `writ schema plan` does against an empty
// repository, minus git plumbing and delta-versus-existing-log (see the
// ticket's Decision 2): parse the source, compile it to the op vocabulary,
// and fold it into a state.Schema exactly as engine.Store.Schema would.
func compile(t *testing.T) state.Schema {
	t.Helper()
	f, err := schemasrc.Parse("writ.schema", Source)
	if err != nil {
		t.Fatalf("Parse(writ.schema): %v", err)
	}
	envs, err := schemasrc.Compile(f, testObjectID)
	if err != nil {
		t.Fatalf("Compile: %v", err)
	}
	sch, err := writ.SchemaFromEnvelopes(envs)
	if err != nil {
		t.Fatalf("SchemaFromEnvelopes: %v", err)
	}
	return sch
}

// vendoredTypes lists the ten types this schema declares, and the basename
// under testdata/fieldrules/ each type's vendored field-rules.json table
// was copied to (spec/testdata/<dir>/field-rules.json in the writ repo,
// read at origin/main per the ticket).
var vendoredTypes = []string{
	"review", "comment", "issue", "project", "cycle",
	"document", "section", "label", "workflow-state", "settings",
}

func TestSchemaCompilesWithZeroConflicts(t *testing.T) {
	sch := compile(t)
	if sch.Namespace != "written" {
		t.Errorf("Namespace = %q, want %q", sch.Namespace, "written")
	}

	rules, conflicts := writ.RulesFromSchemas([]state.Schema{sch})
	if len(conflicts) != 0 {
		t.Fatalf("RulesFromSchemas reported %d conflict(s), want 0: %+v", len(conflicts), conflicts)
	}

	if len(rules) != len(vendoredTypes) {
		got := make([]string, 0, len(rules))
		for typ := range rules {
			got = append(got, typ)
		}
		sort.Strings(got)
		t.Fatalf("compiled schema has rules for %d type(s) %v, want %d %v", len(rules), got, len(vendoredTypes), vendoredTypes)
	}
	for _, typ := range vendoredTypes {
		if _, ok := rules[typ]; !ok {
			t.Errorf("type %q has no rules in the compiled schema", typ)
		}
	}

	// 116 total field rules across the ten vendored tables: review 28,
	// issue 20, comment 8, cycle 10, document 7, label 6, project 8,
	// section 9, settings 10, workflow-state 10. (The ticket's plan
	// states "107 rules total"; summing its own per-type breakdown gives
	// 116, matching what's actually vendored below and what writ's
	// spec/testdata/*/field-rules.json tables actually contain at
	// origin/main cbf074c — a total-arithmetic slip in the ticket text,
	// not a mismatch in the per-type counts, which are exactly as
	// written there and are asserted table-by-table in
	// TestFieldRulesMatchVendoredTables.)
	const wantTotal = 116
	total := 0
	for _, rs := range rules {
		total += len(rs)
	}
	if total != wantTotal {
		t.Errorf("compiled schema has %d total field rules, want %d", total, wantTotal)
	}
}

// divergences names every deliberate difference between a vendored
// field-rules.json table and this package's compiled schema, keyed by
// "type.op_type.op_version.field" with a one-line reason each.
//
// Empty. The ticket's plan flagged exactly one candidate divergence —
// promoting review.set-status.status or issue.set-state.state from lww to
// lattice — and the ticket's own "Decision: no lattice types (2026-09-07)"
// resolved it by promoting neither: a state must be able to go backwards,
// which a lattice forbids by construction. With that resolved, writ.schema
// is a straight transcription of every rule in every vendored table: no
// field's strategy, value type, key, or target differs from what
// field-rules.json already declares. A future change to writ.schema's
// fields, strategies, or value types away from the vendored tables must
// add a named, reasoned entry here, or TestFieldRulesMatchVendoredTables
// fails.
var divergences = map[string]string{}

// ruleKey identifies one vendored or compiled field rule by the tuple the
// ticket's audit keys on: type, op_type, op_version, field.
type ruleKey struct {
	typ, opType, field string
	opVersion          int64
}

func (k ruleKey) String() string {
	return fmt.Sprintf("%s.%s.%d.%s", k.typ, k.opType, k.opVersion, k.field)
}

// comparableRule is the subset of state.Rule the ticket's audit compares:
// (target, strategy, value_type, enum, key, key_types, max_length,
// lattice) — everything except the identifying tuple above.
//
// ObjectType is excluded deliberately: RulesFromSchemas populates it from
// the compiled schema (see engine's schema.go), but no vendored
// field-rules.json table carries one, so comparing it would always fail
// for a reason that has nothing to do with this port. Deprecated is
// excluded because nothing here is deprecated and it carries no fold
// semantics of its own (spec/schema-ops.md §5, §8).
type comparableRule struct {
	Target, Strategy, ValueType string
	Enum, Key, Lattice          string // joined in declared order; order is semantic (key columns, enum values)
	KeyTypes                    string // "col=type" pairs, sorted by column, since key_types is an unordered map
	MaxLength                   int64
}

func normalizeRule(r state.Rule) comparableRule {
	keyTypes := make([]string, 0, len(r.KeyTypes))
	for col, typ := range r.KeyTypes {
		keyTypes = append(keyTypes, col+"="+typ)
	}
	sort.Strings(keyTypes)
	return comparableRule{
		Target:    r.Target,
		Strategy:  r.Strategy,
		ValueType: r.ValueType,
		Enum:      strings.Join(r.Enum, ","),
		Key:       strings.Join(r.Key, ","),
		Lattice:   strings.Join(r.Lattice, ","),
		KeyTypes:  strings.Join(keyTypes, ","),
		MaxLength: r.MaxLength,
	}
}

func loadVendoredRules(t *testing.T, typ string) map[ruleKey]comparableRule {
	t.Helper()
	path := filepath.Join("testdata", "fieldrules", typ+".json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("reading vendored field rules %s: %v", path, err)
	}
	var rules []state.Rule
	if err := json.Unmarshal(data, &rules); err != nil {
		t.Fatalf("unmarshaling vendored field rules %s: %v", path, err)
	}
	set := make(map[ruleKey]comparableRule, len(rules))
	for _, r := range rules {
		k := ruleKey{typ: typ, opType: r.OpType, opVersion: r.OpVersion, field: r.Field}
		if _, dup := set[k]; dup {
			t.Fatalf("vendored table %s declares rule %s twice", path, k)
		}
		set[k] = normalizeRule(r)
	}
	return set
}

// TestFieldRulesMatchVendoredTables is the machine audit the ticket's
// Decision 3 calls for: every one of the 107-per-the-ticket (116 actual,
// see TestSchemaCompilesWithZeroConflicts) vendored field rules is either
// matched exactly by the compiled schema or named in divergences with a
// reason. This is what turns the port's audit checklist from trusted into
// tested — and it is provably able to fail: deleting a field from
// writ.schema, or corrupting one of its strategy keywords, makes this test
// fail by naming the missing or mismatched rule (see "How to know it
// worked" in the ticket).
func TestFieldRulesMatchVendoredTables(t *testing.T) {
	sch := compile(t)
	got, conflicts := writ.RulesFromSchemas([]state.Schema{sch})
	if len(conflicts) != 0 {
		t.Fatalf("RulesFromSchemas reported %d conflict(s), want 0: %+v", len(conflicts), conflicts)
	}

	for _, typ := range vendoredTypes {
		want := loadVendoredRules(t, typ)

		gotSet := make(map[ruleKey]comparableRule, len(got[typ]))
		for _, r := range got[typ] {
			k := ruleKey{typ: typ, opType: r.OpType, opVersion: r.OpVersion, field: r.Field}
			gotSet[k] = normalizeRule(r)
		}

		for k, wantRule := range want {
			gotRule, ok := gotSet[k]
			delete(gotSet, k)
			if !ok {
				if reason, known := divergences[k.String()]; known {
					t.Logf("known divergence %s: dropped from writ.schema (%s)", k, reason)
					continue
				}
				t.Errorf("vendored rule %s has no matching rule in the compiled schema", k)
				continue
			}
			if gotRule != wantRule {
				if reason, known := divergences[k.String()]; known {
					t.Logf("known divergence %s: %s", k, reason)
					continue
				}
				t.Errorf("rule %s diverges from its vendored table entry:\n  vendored: %+v\n  compiled: %+v", k, wantRule, gotRule)
			}
		}
		// Whatever remains in gotSet is a rule the compiled schema
		// declares with no vendored counterpart at all.
		for k := range gotSet {
			if reason, known := divergences[k.String()]; known {
				t.Logf("known divergence %s: added beyond the vendored table (%s)", k, reason)
				continue
			}
			t.Errorf("compiled schema declares rule %s with no entry in the vendored table for %q", k, typ)
		}
	}
}

// TestInvalidFixturesRejected proves the gate can fail (AGENTS.md's ##
// Dispatch review invariant: "a gate which cannot fail is not a gate").
// Each fixture under testdata/invalid/ is a minimal writ.schema that a
// careless edit to this package's schema, or a neutered parser, could
// plausibly let through; Parse must reject every one of them with a file,
// line, and column, per spec/schema-source.md §9.
func TestInvalidFixturesRejected(t *testing.T) {
	cases := []struct {
		file    string
		wantErr string
	}{
		{
			file:    "unknown-strategy.schema",
			wantErr: `unknown merge strategy "lastwriterwins"`,
		},
		{
			file:    "missing-key-for-keyed-lww.schema",
			wantErr: "strategy keyed-lww requires a key(...) modifier",
		},
	}

	for _, c := range cases {
		t.Run(c.file, func(t *testing.T) {
			path := filepath.Join("testdata", "invalid", c.file)
			src, err := os.ReadFile(path)
			if err != nil {
				t.Fatalf("reading fixture %s: %v", path, err)
			}

			_, err = schemasrc.Parse(c.file, src)
			if err == nil {
				t.Fatalf("Parse(%s) succeeded, want it rejected with an error containing %q", c.file, c.wantErr)
			}

			errs, ok := err.(schemasrc.ErrorList)
			if !ok || len(errs) == 0 {
				t.Fatalf("Parse(%s) returned error of type %T, want a non-empty schemasrc.ErrorList carrying file/line/column", c.file, err)
			}
			first := errs[0]
			if first.File != c.file {
				t.Errorf("Parse(%s) error names file %q, want %q", c.file, first.File, c.file)
			}
			if first.Line <= 0 || first.Col <= 0 {
				t.Errorf("Parse(%s) error has no 1-based line/column: %+v", c.file, first)
			}
			if !strings.Contains(err.Error(), c.wantErr) {
				t.Errorf("Parse(%s) error = %q, want it to contain %q", c.file, err.Error(), c.wantErr)
			}
		})
	}
}
