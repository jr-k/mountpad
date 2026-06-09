import React from 'react'
import { useThemeMode, type ThemeMode } from '@/styles/ThemeManager'

import * as S from './styled'

// Three tiny SVG glyphs for the segmented control. We inline them so the
// component carries no dependency on an icon font: the toggle stays a
// self-contained leaf that can be dropped anywhere.
const SunIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
)

const MoonIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z" />
  </svg>
)

const SystemIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </svg>
)

interface Option {
  value: ThemeMode
  label: string
  icon: React.ReactNode
}

const OPTIONS: Option[] = [
  { value: 'system', label: 'Match system preference', icon: <SystemIcon /> },
  { value: 'light',  label: 'Light theme',             icon: <SunIcon /> },
  { value: 'dark',   label: 'Dark theme',              icon: <MoonIcon /> },
]

export const ThemeToggle: React.FC = () => {
  const { mode, setMode } = useThemeMode()
  return (
    <S.ThemeToggleRoot role="group" aria-label="Theme">
      {OPTIONS.map((opt) => (
        <S.Segment
          key={opt.value}
          type="button"
          $active={mode === opt.value}
          onClick={() => setMode(opt.value)}
          title={opt.label}
          aria-label={opt.label}
          aria-pressed={mode === opt.value}
        >
          {opt.icon}
        </S.Segment>
      ))}
    </S.ThemeToggleRoot>
  )
}

ThemeToggle.displayName = 'ThemeToggle'
