import styled from 'styled-components'

// A deliberately discreet strip at the bottom of every page. We keep
// it short (~22px), low-contrast (textFaint over bgSubtle, top
// border in border) and use a small monospace font so the metrics
// read as ambient telemetry rather than UI chrome.
export const StatusBarRoot = styled.footer`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  height: 22px;
  padding: 0 ${({ theme }) => theme.space[3]};
  border-top: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgSubtle};
  color: ${({ theme }) => theme.color.textFaint};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  user-select: none;

  @media (max-width: ${({ theme }) => theme.bp.sm}) {
    padding: 0 ${({ theme }) => theme.space[2]};
    gap: ${({ theme }) => theme.space[2]};
  }
`
StatusBarRoot.displayName = 'StatusBar.Root'

export const Left = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
`
Left.displayName = 'StatusBar.Left'

export const Right = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  margin-left: auto;
  flex-shrink: 0;
`
Right.displayName = 'StatusBar.Right'

// A subtle bullet separator we drop between adjacent metric chips
// when a page bubbles several signals up. Rendered as an inert span
// so screen readers don't announce it.
export const Sep = styled.span`
  color: ${({ theme }) => theme.color.border};
  &::before { content: '·'; }
`
Sep.displayName = 'StatusBar.Sep'

// Single metric pill. No background — keeping the bar visually flat
// — just an icon-and-text pairing. The icon slot is optional so a
// caller can use the same chip for a pure-text metric (e.g. "42
// items").
export const Metric = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: ${({ theme }) => theme.color.textFaint};

  & > svg {
    display: block;
    color: ${({ theme }) => theme.color.textFaint};
  }

  & > b {
    color: ${({ theme }) => theme.color.textMuted};
    font-weight: 600;
  }
`
Metric.displayName = 'StatusBar.Metric'

// External link styled to match the muted metric chips. Picks up the
// accent color on hover so the user knows it's interactive without
// pulling visual weight at rest.
export const Link = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: ${({ theme }) => theme.color.textFaint};
  text-decoration: none;
  transition: color 120ms ease;

  & > svg { display: block; }

  &:hover {
    color: ${({ theme }) => theme.color.accent};
  }
  &:focus-visible {
    outline: 1px solid ${({ theme }) => theme.color.accent};
    outline-offset: 2px;
    border-radius: 2px;
  }
`
Link.displayName = 'StatusBar.Link'
