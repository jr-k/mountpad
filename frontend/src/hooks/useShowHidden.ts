import { useEffect, useState } from 'react'

/**
 * Show / hide dotfile entries (Unix-style hidden files whose name
 * starts with `.`). The toggle is a single global preference shared
 * by every listing in the app (DirectoryView, FileExplorer) so the
 * user only flips it once and both panes update in lockstep.
 *
 * The state lives at module scope behind a tiny pub/sub:
 *   - one localStorage write per change (persists across reloads),
 *   - a Set of subscriber callbacks fans the change out to every
 *     `useShowHidden` consumer mounted in the page, in-tab.
 *   - the `storage` event handles cross-tab sync as a free bonus.
 */

const STORAGE_KEY = 'mountpad:show-hidden'

const subscribers = new Set<(value: boolean) => void>()

const readPersisted = (): boolean => {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

let cached: boolean = readPersisted()

const writePersisted = (value: boolean): void => {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0') } catch { /* quota / disabled */ }
}

/** Module-level setter; also used by the hook's `set`/`toggle`. */
export const setShowHidden = (value: boolean): void => {
  if (cached === value) return
  cached = value
  writePersisted(value)
  for (const fn of subscribers) fn(value)
}

export const getShowHidden = (): boolean => cached

interface UseShowHiddenReturn {
  showHidden: boolean
  setShowHidden: (value: boolean) => void
  toggleShowHidden: () => void
}

export function useShowHidden(): UseShowHiddenReturn {
  const [value, setValue] = useState<boolean>(cached)

  useEffect(() => {
    subscribers.add(setValue)

    // Cross-tab sync via the native `storage` event. Only fires for
    // changes made in *other* documents, so we don't need to guard
    // against re-entry from our own writePersisted call.
    const onStorage = (ev: StorageEvent) => {
      if (ev.key !== STORAGE_KEY) return
      const next = ev.newValue === '1'
      if (next !== cached) {
        cached = next
        for (const fn of subscribers) fn(next)
      }
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage)
    }

    return () => {
      subscribers.delete(setValue)
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage)
      }
    }
  }, [])

  return {
    showHidden: value,
    setShowHidden,
    // Read from `cached` (not `value`) so two toggles in the same tick
    // compose correctly instead of both flipping from the same stale
    // snapshot.
    toggleShowHidden: () => setShowHidden(!cached),
  }
}

/** True when the entry should be hidden under the current preference. */
export const isHiddenEntry = (name: string): boolean => name.startsWith('.')
