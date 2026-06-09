// Package version exposes the build-time version of the MountPad
// binary. The default ("dev") is meant for local builds; CI and
// release pipelines override it via ldflags, e.g.
//
//	go build -ldflags "-X github.com/mountpad/mountpad/internal/version.Version=v1.2.3" ./cmd/mountpad
//
// The string is plumbed through the Inertia "app" shared prop so the
// frontend can render it in the status bar without any extra API
// round-trip.
package version

// Version is the human-readable release tag of this build. Keep it
// short — the status bar in the frontend prints it as plain text
// after the GitHub link.
var Version = "dev"
