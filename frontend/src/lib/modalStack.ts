// Tiny module-level counter that tracks how many Modal instances are
// currently open. Components attaching window-level shortcuts read
// `isAnyModalOpen()` and bail when it's truthy, so a key press inside
// a modal can't double-trigger something underneath (e.g. Enter inside
// a rename input also activating the DirectoryView's cursor entry,
// or Cmd+S inside a confirmation dialog silently saving the file in
// the background).
//
// The counter (rather than a boolean) is what makes nested modals
// work correctly: pushing twice and popping once keeps the gate on
// until the outer modal closes as well.
//
// No React context on purpose — every consumer only needs a one-shot
// read at the moment a key fires, not a re-render when the value
// changes. Keeping it out of React also avoids ordering issues
// between the modal's mount effect and the listener's mount effect.

let openCount = 0

export const pushModal = (): void => {
  openCount += 1
}

export const popModal = (): void => {
  openCount = Math.max(0, openCount - 1)
}

export const isAnyModalOpen = (): boolean => openCount > 0
