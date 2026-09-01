package main

import (
	"context"
	"testing"
)

func TestRunCLI(t *testing.T) {
	ctx := context.Background()

	tests := []struct {
		name    string
		args    []string
		wantErr bool
	}{
		{
			name:    "version flag",
			args:    []string{"--version"},
			wantErr: false,
		},
		{
			name:    "short version flag",
			args:    []string{"-v"},
			wantErr: false,
		},
		{
			name:    "help flag",
			args:    []string{"--help"},
			wantErr: false,
		},
		{
			name:    "web subcommand",
			args:    []string{"web"},
			wantErr: false,
		},
		{
			name:    "custom dir flag",
			args:    []string{"-C", "/tmp"},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := run(ctx, tt.args); (err != nil) != tt.wantErr {
				t.Fatalf("run(%v) error = %v, wantErr %v", tt.args, err, tt.wantErr)
			}
		})
	}
}
