// Module augmentation that wires our theme shape into styled-components'
// `DefaultTheme`. Without this, `({ theme }) => theme.color.bg` and every
// other consumer would see `DefaultTheme` as an empty interface and fail
// type-check (the values work at runtime because ThemeProvider injects
// the palette directly).
import 'styled-components'

import type { Theme } from './styles/theme'

declare module 'styled-components' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface DefaultTheme extends Theme {}
}
