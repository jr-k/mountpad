import styled from 'styled-components'

export const FileDetailsPanelRoot = styled.aside`
  /* Width is driven by the --details-width CSS variable, set inline by
     FileDetailsPanel from its resize-handle state. We default to 300px
     when the variable isn't present (initial render, or storage fail).
     position: relative anchors the absolutely-positioned resize handle
     to this pane's left edge. */
  position: relative;
  width: var(--details-width, 300px);
  flex-shrink: 0;
  border-left: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgSubtle};
  padding: ${({ theme }) => theme.space[4]};
  overflow-y: auto;
  font-size: ${({ theme }) => theme.font.size.sm};

  /* Below the lg breakpoint the details panel becomes a slide-in drawer
     from the right so it never competes with the main editor/folder
     view for horizontal space. WorkspacePage renders a backdrop
     alongside the panel when it is open, so tapping outside closes it
     via the toolbar toggle. The mobile width override wins over the
     CSS variable, which is exactly what we want.  */
  @media (max-width: ${({ theme }) => theme.bp.lg}) {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(90vw, 360px);
    z-index: ${({ theme }) => theme.z.drawer + 1};
    box-shadow: ${({ theme }) => theme.shadow.lg};
  }
`

// DetailsResizer mirrors AppShell.ExplorerResizer but sits on the
// *left* edge of the panel since the details pane lives on the right
// side of the workspace. Same 6px hit area, same hover/active accent,
// same desktop-only display rule (the mobile drawer has no need for
// a resize affordance - it slides over the editor at a fixed width).
export const DetailsResizer = styled.div<{ $resizing?: boolean }>`
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 6px;
  z-index: 4;
  cursor: col-resize;
  user-select: none;
  touch-action: none;
  background: ${({ $resizing, theme }) =>
    $resizing ? `color-mix(in srgb, ${theme.color.accent} 25%, transparent)` : 'transparent'};
  transition: background 120ms ease;

  &:hover {
    background: ${({ theme }) => `color-mix(in srgb, ${theme.color.accent} 18%, transparent)`};
  }

  @media (max-width: ${({ theme }) => theme.bp.lg}) {
    display: none;
  }
`
DetailsResizer.displayName = 'FileDetailsPanel.Resizer'

export const Title = styled.div`
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 10px;
  color: ${({ theme }) => theme.color.textFaint};
  margin-bottom: ${({ theme }) => theme.space[2]};
`

export const Group = styled.div`
  margin-bottom: ${({ theme }) => theme.space[5]};
`

export const Row = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  border-bottom: 1px dashed ${({ theme }) => theme.color.border};
  color: ${({ theme }) => theme.color.textMuted};
`

export const Value = styled.span`
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.sm};
  max-width: 65%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`
