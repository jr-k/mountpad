import { createGlobalStyle } from 'styled-components'

export const GlobalStyles = createGlobalStyle`
  *, *::before, *::after { box-sizing: border-box; }
  html, body, #app { height: 100%; }
  body {
    margin: 0;
    background: ${({ theme }) => theme.color.bg};
    color: ${({ theme }) => theme.color.text};
    font-family: ${({ theme }) => theme.font.family};
    font-size: ${({ theme }) => theme.font.size.md};
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  a { color: ${({ theme }) => theme.color.accent}; text-decoration: none; }
  a:hover { color: ${({ theme }) => theme.color.accentHover}; }
  button { font-family: inherit; cursor: pointer; }
  input, select, textarea { font-family: inherit; color: inherit; }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.color.border};
    border-radius: ${({ theme }) => theme.radius.md};
  }
  ::-webkit-scrollbar-thumb:hover { background: ${({ theme }) => theme.color.borderStrong}; }
`
