// The MountPad app ships with both a dark (default) and a light palette. We
// keep the *shape* of the two themes strictly identical so any consumer that
// reads `theme.color.xxx` keeps compiling: only the values differ between
// `lightTheme` and `darkTheme`. The `appearance` discriminator lets the few
// places that need to tweak rendering depending on luminosity (e.g. the
// CodeMirror editor wrapper) branch without reverse-engineering the colors.

// Appearance is the discriminator both palettes share. Declaring it as
// a union (rather than `as const` on each palette) keeps `typeof
// darkTheme` and `typeof lightTheme` structurally identical, which in
// turn lets `Theme = typeof darkTheme` accept the light palette too.
// An interface can extend Theme (single object literal) but NOT a
// union, so this discipline is what keeps the styled-components
// `DefaultTheme` augmentation valid.
export type Appearance = 'light' | 'dark'

const sharedTokens = {
  space: {
    0:  '0',
    1:  '4px',
    1.5:  '7px',
    2:  '8px',
    3:  '12px',
    4:  '16px',
    5:  '20px',
    6:  '24px',
    8:  '32px',
    10: '40px',
    12: '48px',
  },
  radius: {
    sm: '4px',
    md: '6px',
    lg: '10px',
    xl: '14px',
  },
  font: {
    family: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`,
    mono:   `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`,
    size: {
      xs: '11px',
      sm: '12px',
      md: '13px',
      lg: '15px',
      xl: '18px',
      h2: '22px',
      h1: '28px',
    },
  },
  z: {
    panel:   10,
    sticky:  20,
    overlay: 80,
    modal:   90,
    toast:   100,
    // Drawer sits between regular panels and the modal layer so backdrops
    // can occlude page chrome but not the modal stack itself.
    drawer:  70,
  },
  // Breakpoints follow a content-first scale: below `lg` the workspace
  // collapses its multi-column shell into a single-column layout with the
  // sidebar/explorer overlaying as drawers. Values exposed as strings so
  // they slot straight into `@media (max-width: ${theme.bp.lg})`.
  bp: {
    sm: '640px',
    md: '900px',
    lg: '1024px',
    xl: '1280px',
  },
} as const

export const darkTheme = {
  appearance: 'dark' as Appearance,
  color: {
    bg:        '#0d1117',
    bgSubtle:  '#11161f',
    bgPanel:   '#161b25',
    bgElev:    '#1c2230',
    border:    '#252b38',
    borderStrong: '#2f3645',

    text:      '#e6edf3',
    textMuted: '#8b95a7',
    textFaint: '#5c6675',

    accent:    '#6aa0ff',
    accentHover: '#86b1ff',
    accentMuted: '#1e2d49',
    onAccent:  '#0b1220',

    success:   '#3fb950',
    warning:   '#d29922',
    danger:    '#f85149',
    dangerHover: '#ff6e63',

    overlay:   'rgba(5, 8, 14, 0.55)',
  },
  shadow: {
    sm: '0 1px 2px rgba(0,0,0,0.25)',
    md: '0 4px 12px rgba(0,0,0,0.30)',
    lg: '0 20px 40px rgba(0,0,0,0.40)',
  },
  ...sharedTokens,
}

// Light palette: high-contrast, slightly cool, mirrors GitHub-ish neutrals so
// muted text stays legible. The accent stays in the same blue family as the
// dark theme to keep brand cohesion across modes.
export const lightTheme = {
  appearance: 'light' as Appearance,
  color: {
    bg:        '#f6f8fa',
    bgSubtle:  '#ffffff',
    bgPanel:   '#ffffff',
    bgElev:    '#f0f3f6',
    border:    '#d0d7de',
    borderStrong: '#afb8c1',

    text:      '#1f2328',
    textMuted: '#57606a',
    textFaint: '#848d97',

    accent:    '#0969da',
    accentHover: '#1f6feb',
    accentMuted: '#ddf4ff',
    onAccent:  '#ffffff',

    success:   '#1a7f37',
    warning:   '#9a6700',
    danger:    '#cf222e',
    dangerHover: '#a40e26',

    overlay:   'rgba(31, 35, 40, 0.45)',
  },
  // Light surfaces need softer shadows than dark ones, otherwise the
  // floating layers look like a heavy bruise on the page.
  shadow: {
    sm: '0 1px 2px rgba(31,35,40,0.08)',
    md: '0 4px 12px rgba(31,35,40,0.10)',
    lg: '0 20px 40px rgba(31,35,40,0.14)',
  },
  ...sharedTokens,
}

// Backwards-compat alias: a few non-React modules (e.g. the CodeMirror editor
// theme builder) used to import `theme` directly. Keeping the export pointed
// at the dark palette preserves their behavior while the components migrate
// to `useTheme()` from styled-components.
export const theme = darkTheme

// Theme = typeof darkTheme works for both palettes because the
// outer object literals are NOT `as const`: colour values widen to
// `string`, and `appearance` is widened to `Appearance` at the
// source. lightTheme structurally matches the same type, so
// ThemeManager can swap palettes without a cast.
export type Theme = typeof darkTheme
