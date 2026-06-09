import React from 'react'
import { createRoot } from 'react-dom/client'
import { createInertiaApp } from '@inertiajs/react'

import { darkTheme } from '@/styles/theme'
import { ThemeManager } from '@/styles/ThemeManager'
import { GlobalStyles } from '@/styles/GlobalStyles'

const pages = import.meta.glob('./pages/**/*.tsx', { eager: true })

createInertiaApp({
  resolve: (name) => {
    const file = (pages as Record<string, { default: React.ComponentType<any> }>)[`./pages/${name}/${name}.tsx`]
    if (!file) throw new Error(`Inertia page not found: ${name}`)
    return file.default
  },
  setup({ el, App, props }) {
    const root = createRoot(el)
    root.render(
      <ThemeManager>
        <GlobalStyles />
        <App {...props} />
      </ThemeManager>,
    )
  },
  // Progress bar color stays fixed: the accent value happens to be identical
  // (or near-identical) in both palettes, so reading from `darkTheme` here is
  // fine and avoids a chicken-and-egg with the not-yet-mounted manager.
  progress: { color: darkTheme.color.accent },
})
