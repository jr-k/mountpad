import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ThemeProvider } from 'styled-components'

import { darkTheme, lightTheme, type Theme } from './theme'

// User preference: `system` follows the OS, `light` / `dark` are hard pins.
// We persist the choice in localStorage so it survives page reloads, and we
// listen to `prefers-color-scheme` while `system` is active so a system
// theme flip (e.g. macOS auto night shift) propagates instantly.
export type ThemeMode = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'mountpad:theme:mode'

interface ThemeModeContextValue {
  /** The raw user choice (might be "system"). */
  mode: ThemeMode
  /** The currently rendered appearance, never "system". */
  appearance: 'light' | 'dark'
  setMode: (mode: ThemeMode) => void
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null)

// readStoredMode is SSR-safe: when window is missing, it falls back to
// `system` (which then resolves to `dark` in the SSR path; the client will
// re-evaluate on mount).
const readStoredMode = (): ThemeMode => {
  if (typeof window === 'undefined') return 'system'
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    // localStorage might be disabled (private mode, etc.); silently fall
    // back to the default - the toggle still works in-memory.
  }
  return 'system'
}

const systemAppearance = (): 'light' | 'dark' => {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export const ThemeManager: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode)
  const [systemAppr, setSystemAppr] = useState<'light' | 'dark'>(systemAppearance)

  // Listen to the OS color-scheme switch only while `mode` is "system": any
  // hard choice (light/dark) overrides the OS preference, so we don't pay
  // for an event listener we'd ignore anyway.
  useEffect(() => {
    if (mode !== 'system') return
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => setSystemAppr(mql.matches ? 'light' : 'dark')
    // Safari < 14 only supports the legacy `addListener` API; we cover both.
    if (mql.addEventListener) {
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    }
    mql.addListener(onChange)
    return () => mql.removeListener(onChange)
  }, [mode])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    try { window.localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
  }, [])

  const appearance: 'light' | 'dark' = mode === 'system' ? systemAppr : mode
  const palette: Theme = appearance === 'light' ? lightTheme : darkTheme

  // Tell the browser (scrollbars, form controls, default fonts) about the
  // current scheme. Keeps native chrome consistent with the app surface.
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.style.colorScheme = appearance
  }, [appearance])

  const value = useMemo(() => ({ mode, appearance, setMode }), [mode, appearance, setMode])

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={palette}>{children}</ThemeProvider>
    </ThemeModeContext.Provider>
  )
}

export const useThemeMode = (): ThemeModeContextValue => {
  const ctx = useContext(ThemeModeContext)
  if (!ctx) throw new Error('useThemeMode must be used inside a ThemeManager')
  return ctx
}
