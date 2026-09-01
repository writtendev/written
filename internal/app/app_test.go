package app

import (
	"bytes"
	"context"
	"strings"
	"testing"
)

func TestRun_Version(t *testing.T) {
	var buf bytes.Buffer
	opts := Options{
		ShowVer: true,
		Stdout:  &buf,
	}

	if err := Run(context.Background(), opts); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	got := buf.String()
	if !strings.Contains(got, "written ") {
		t.Errorf("expected version output, got %q", got)
	}
}

func TestRun_Help(t *testing.T) {
	var buf bytes.Buffer
	opts := Options{
		ShowHelp: true,
		Stdout:   &buf,
	}

	if err := Run(context.Background(), opts); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	got := buf.String()
	if !strings.Contains(got, "Usage: written") {
		t.Errorf("expected help output, got %q", got)
	}
}

func TestRun_DefaultTUI(t *testing.T) {
	var buf bytes.Buffer
	opts := Options{
		Stdout: &buf,
	}

	if err := Run(context.Background(), opts); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	got := buf.String()
	if !strings.Contains(got, "written TUI mode") {
		t.Errorf("expected TUI init output, got %q", got)
	}
}

func TestRun_WebMode(t *testing.T) {
	var buf bytes.Buffer
	opts := Options{
		WebMode: true,
		Stdout:  &buf,
	}

	if err := Run(context.Background(), opts); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	got := buf.String()
	if !strings.Contains(got, "written web mode") {
		t.Errorf("expected web mode output, got %q", got)
	}
}
