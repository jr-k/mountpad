import { useEffect } from 'react'

interface Options {
  /** When false, the listener is detached entirely (no preventDefault either). */
  enabled?: boolean
}

/**
 * Binds Ctrl+S (Linux/Windows) and Cmd+S (macOS) globally to trigger `onSave`.
 *
 * The browser's default "save page" dialog is always swallowed when the hook
 * is enabled, even if `onSave` decides to no-op. That keeps the UX
 * predictable while a save is in flight or the file has no pending changes.
 *
 * The listener is attached to `window` in the capture phase so it fires even
 * when focus is inside a `<textarea>` (the text editor) or any input.
 */
export function useSaveShortcut(onSave: () => void, { enabled = true }: Options = {}): void {
  useEffect(() => {
    if (!enabled) return

    const handler = (e: KeyboardEvent) => {
      const isSaveKey = (e.key === 's' || e.key === 'S')
      const meta = e.metaKey || e.ctrlKey
      if (!isSaveKey || !meta) return
      // Ignore the rare Shift+Ctrl+S "Save As" combo so the browser can still
      // surface it if the user wires it to a different action later.
      if (e.shiftKey) return

      e.preventDefault()
      e.stopPropagation()
      onSave()
    }

    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [onSave, enabled])
}
