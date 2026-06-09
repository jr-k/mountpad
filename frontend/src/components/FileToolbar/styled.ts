import styled from 'styled-components'

// Shared toolbar height: keeps the FileToolbar (main pane) and the
// FileExplorer toolbar (left pane) visually aligned across the top of the
// workspace, no matter which buttons each one happens to contain. The value
// matches the tallest control we currently render in either toolbar (the
// 28px PanelToggle plus 2×8px vertical padding).
export const TOOLBAR_MIN_HEIGHT = '44px'

export const FileToolbarRoot = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => `${theme.space[1.5]} ${theme.space[4]}`};
  min-height: ${TOOLBAR_MIN_HEIGHT};
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgSubtle};

  /* Tight horizontal scroll instead of wrapping: keeping the toolbar to
     a single row preserves the "primary action at the right edge"
     mental model even when the title or actions overflow on phones. */
  @media (max-width: ${({ theme }) => theme.bp.md}) {
    padding: ${({ theme }) => `${theme.space[2]} ${theme.space[2]}`};
    overflow-x: auto;
    scrollbar-width: thin;
    & > * { flex-shrink: 0; }
  }
`

export const Title = styled.div`
  /* The Title slot hosts the clickable Breadcrumb. We act as a flex
     layout host that yields its available width to the breadcrumb,
     which carries its own inner overflow/scroll behaviour. */
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  font-family: ${({ theme }) => theme.font.mono};
  color: ${({ theme }) => theme.color.text};
  font-size: ${({ theme }) => theme.font.size.md};

  /* On phones the path is the lowest-priority bit of information so we
     cap its share of the toolbar. Buttons stay reachable even with long
     paths because the surrounding Root is horizontally scrollable and
     the breadcrumb has its own inner scroll. */
  @media (max-width: ${({ theme }) => theme.bp.md}) {
    flex: 0 1 auto;
    max-width: 50%;
    font-size: ${({ theme }) => theme.font.size.sm};
  }
`

export const Status = styled.span<{ $tone: 'idle' | 'dirty' | 'saving' | 'saved' | 'error' }>`
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme, $tone }) => {
    if ($tone === 'dirty') return theme.color.warning
    if ($tone === 'saving') return theme.color.accent
    if ($tone === 'saved') return theme.color.success
    if ($tone === 'error') return theme.color.danger
    return theme.color.textFaint
  }};
`

Status.displayName = 'FileToolbar.Status'

export const Kbd = styled.kbd`
  display: inline-flex;
  align-items: center;
  margin-left: 6px;
  padding: 1px 5px;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.color.textMuted};
  background: ${({ theme }) => theme.color.bgElev};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 3px;
  line-height: 1.4;
`

Kbd.displayName = 'FileToolbar.Kbd'

// PanelToggle is the icon-only button on the far right of the toolbar that
// shows/hides the file details panel. We render it slightly larger than a
// `<Button size="sm">` (32×28) so the icon stays legible without text,
// and we use the same surface tokens as the buttons next to it so it
// blends with the toolbar.
export const PanelToggle = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 28px;
  margin-left: ${({ theme }) => theme.space[1]};
  padding: 0;
  border-radius: ${({ theme }) => theme.radius.sm};
  border: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ $active, theme }) =>
    $active ? theme.color.bgElev : 'transparent'};
  color: ${({ $active, theme }) =>
    $active ? theme.color.text : theme.color.textMuted};
  cursor: pointer;
  transition: color 120ms ease, background 120ms ease, border-color 120ms ease;

  &:hover {
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.bgElev};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: 1px;
  }
  svg { display: block; }
`

PanelToggle.displayName = 'FileToolbar.PanelToggle'
