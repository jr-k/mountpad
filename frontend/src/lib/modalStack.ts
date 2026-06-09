// Module-level LIFO stack of open modals. Two distinct consumers:
//
//   * `isAnyModalOpen()` - components attaching window-level shortcuts
//     read this and bail when it's truthy, so a key press inside a
//     modal can't double-trigger something underneath (e.g. Enter
//     inside a rename input also activating the DirectoryView's
//     cursor entry, or Cmd+S inside a confirmation dialog silently
//     saving the file in the background).
//
//   * `isTopModal(id)` - the Modal component itself uses this to make
//     Escape close ONLY the topmost dialog when several modals are
//     stacked. Without it, every open modal's window-level keydown
//     listener fires on Escape and they all dismiss in one keystroke,
//     which is wrong: the user expects Escape to peel them off one
//     at a time (folder picker > edit mount > sidebar).
//
// A stack of tokens (rather than a counter) is what enables the
// top-of-stack check; nested-modal correctness for `isAnyModalOpen`
// falls out of `length > 0` symmetrically with the old counter.
//
// No React context on purpose - every consumer only needs a one-shot
// read at the moment a key fires, not a re-render when the value
// changes. Keeping it out of React also avoids ordering issues
// between the modal's mount effect and the listener's mount effect.

let nextId = 1
const stack: number[] = []

export const pushModal = (): number => {
  const id = nextId++
  stack.push(id)
  return id
}

export const popModal = (id: number): void => {
  // lastIndexOf because closing happens LIFO in the common case, so
  // the matching token is usually at the very top of the stack. Falls
  // back to a no-op when the id is unknown (defensive: a double-pop
  // from a stale closure shouldn't corrupt the stack).
  const idx = stack.lastIndexOf(id)
  if (idx >= 0) stack.splice(idx, 1)
}

export const isTopModal = (id: number): boolean =>
  stack.length > 0 && stack[stack.length - 1] === id

export const isAnyModalOpen = (): boolean => stack.length > 0
