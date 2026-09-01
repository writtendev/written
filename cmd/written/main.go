package main

import (
	"context"
	"flag"
	"fmt"
	"os"

	"github.com/writtendev/written/internal/app"
)

func main() {
	if err := run(context.Background(), os.Args[1:]); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("written", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)

	var dir string
	var showVer bool
	var showHelp bool

	fs.StringVar(&dir, "C", "", "run as if written was started in <dir>")
	fs.BoolVar(&showVer, "version", false, "display version information")
	fs.BoolVar(&showVer, "v", false, "display version information")
	fs.BoolVar(&showHelp, "help", false, "display help information")
	fs.BoolVar(&showHelp, "h", false, "display help information")

	if err := fs.Parse(args); err != nil {
		return err
	}

	remaining := fs.Args()
	webMode := false
	if len(remaining) > 0 && remaining[0] == "web" {
		webMode = true
	}

	opts := app.Options{
		Dir:      dir,
		WebMode:  webMode,
		ShowHelp: showHelp,
		ShowVer:  showVer,
		Stdout:   os.Stdout,
		Stderr:   os.Stderr,
	}

	return app.Run(ctx, opts)
}
