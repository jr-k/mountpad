import styled, { css } from 'styled-components'

/**
 * Slack-style mount-point rail. Two modes:
 *
 *   - collapsed (default): a ~56px-wide rail of round avatars with the
 *     first letter of each mount's name. Tooltips on hover.
 *   - expanded: a ~220px-wide column with the name + host path, plus the
 *     small "Mounts" heading.
 *
 * The toggle button lives at the top right of the rail and persists the
 * choice to localStorage so it survives reloads.
 */

const COLLAPSED_WIDTH = '56px'
const EXPANDED_WIDTH = '220px'

export const MountPointSidebarRoot = styled.div<{ $collapsed: boolean }>`
  width: ${({ $collapsed }) => ($collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH)};
  padding: ${({ theme }) => theme.space[2]};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  transition: width 160ms ease;
  position: relative;
  align-items: ${({ $collapsed }) => ($collapsed ? 'center' : 'stretch')};

  /* Inside the mobile drawer the rail always uses the expanded layout
     (avatars + name + path) and spans the full drawer width. The
     collapsed avatars-only rail saves horizontal space on desktop; in a
     single-column drawer that benefit vanishes. */
  @media (max-width: ${({ theme }) => theme.bp.lg}) {
    width: 100%;
    align-items: stretch;
  }
`

export const Header = styled.div<{ $collapsed: boolean }>`
  display: flex;
  align-items: center;
  justify-content: ${({ $collapsed }) => ($collapsed ? 'center' : 'space-between')};
  width: 100%;
  padding: ${({ theme }) => `${theme.space[2]} ${theme.space[1]}`};
  margin-bottom: ${({ theme }) => theme.space[1]};
`

export const Heading = styled.div`
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 10px;
  color: ${({ theme }) => theme.color.textFaint};
`

export const ToggleButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid transparent;
  background: transparent;
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.textMuted};
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;

  &:hover {
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.bgElev};
    border-color: ${({ theme }) => theme.color.border};
  }
`

// Expanded list row: avatar + meta block.
export const Item = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  padding: 6px 8px;
  border: 1px solid ${({ $active, theme }) => ($active ? theme.color.accentMuted : 'transparent')};
  background: ${({ $active, theme }) => ($active ? theme.color.accentMuted : 'transparent')};
  border-radius: ${({ theme }) => theme.radius.md};
  color: ${({ theme }) => theme.color.text};
  font-size: ${({ theme }) => theme.font.size.md};
  text-align: left;
  width: 100%;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.color.bgElev}; }
`

// Compact (collapsed) variant: button is just the avatar, centered.
export const RailItem = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 0;
  background: transparent;
  border-radius: ${({ theme }) => theme.radius.md};
  cursor: pointer;
  position: relative;

  /* A subtle 2px accent stripe on the left side highlights the active
     mount without taking up horizontal space, just like Slack does. */
  &::before {
    content: '';
    position: absolute;
    left: -${({ theme }) => theme.space[2]};
    top: 6px;
    bottom: 6px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: ${({ $active, theme }) => ($active ? theme.color.accent : 'transparent')};
    transition: background 120ms ease;
  }

  ${({ $active, theme }) =>
    $active &&
    css`
      & > span { border-color: color-mix(in srgb, ${theme.color.accent} 50%, transparent); }
    `}
`

// Round avatar with the first letter. Used both in collapsed mode (as
// the whole button) and inside expanded items.
export const Avatar = styled.span<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 8px;
  background: ${({ theme }) => theme.color.bgElev};
  border: 1px solid ${({ theme }) => theme.color.border};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.mono};
  font-weight: 600;
  font-size: 13px;
  text-transform: uppercase;
  transition: border-color 120ms ease, background 120ms ease;
  ${({ $active, theme }) =>
    $active &&
    css`
      background: ${theme.color.accentMuted};
      color: ${theme.color.accent};
      border-color: color-mix(in srgb, ${theme.color.accent} 50%, transparent);
    `}
`

export const Meta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
`

export const Name = styled.div`
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const Path = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.textFaint};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`
