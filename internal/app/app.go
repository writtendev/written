package app

import (
	"context"
	"fmt"
	"io"
)

// Version is populated at link time via ldflags.
var Version = "dev"

// Options holds runtime options for written.
type Options struct {
	Dir      string
	WebMode  bool
	ShowHelp bool
	ShowVer  bool
	Stdout   io.Writer
	Stderr   io.Writer
}

// Run executes the application logic based on the provided options.
func Run(ctx context.Context, opts Options) error {
	if opts.ShowVer {
		if opts.Stdout != nil {
			fmt.Fprintf(opts.Stdout, "written %s\n", Version)
		}
		return nil
	}

	if opts.ShowHelp {
		if opts.Stdout != nil {
			fmt.Fprintln(opts.Stdout, "Usage: written [-C <dir>] [web] [--version] [--help]")
		}
		return nil
	}

	if opts.WebMode {
		if opts.Stdout != nil {
			fmt.Fprintln(opts.Stdout, "written web mode initialized")
		}
		return nil
	}

	if opts.Stdout != nil {
		fmt.Fprintln(opts.Stdout, "written TUI mode initialized")
	}
	return nil
}
