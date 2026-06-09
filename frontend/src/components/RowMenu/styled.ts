import styled, { css, keyframes } from 'styled-components'

/**
 * Visual primitives for the row overflow menu (three-dots dropdown).
 *
 * Layout:
 *   <Trigger> ⋮ </Trigger>
 *       │
 *       ▼   (portaled to <body>, absolutely positioned over the page)
 *   <Menu>
 *     <MenuItem>Edit</MenuItem>
 *     <MenuItem>Reset password</MenuItem>
 *     <Divider />
 *     <MenuItem tone="danger">Delete</MenuItem>
 *   </Menu>
 *
 * The menu floats above scroll containers via a React portal, so we don't
 * fight the `overflow: hidden / auto` on Section/TableHost. Trigger is a
 * regular button so it keeps standard focus + keyboard semantics.
 */

// Trigger: small icon-only button. Sized to match the toolbar/Button(sm)
// rhythm (28px tall, narrow body) so it slots into a settings table row
// without taking more space than the old action button group it replaces.
export const RowMenuTrigger = styled.button<{ $open?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid
    ${({ $open, theme }) => ($open ? theme.color.borderStrong : 'transparent')};
  background: ${({ $open, theme }) => ($open ? theme.color.bgElev : 'transparent')};
  color: ${({ $open, theme }) => ($open ? theme.color.text : theme.color.textMuted)};
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;

  &:hover {
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.bgElev};
    border-color: ${({ theme }) => theme.color.border};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: 1px;
  }
  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  svg { display: block; }
`
RowMenuTrigger.displayName = 'RowMenu.Trigger'

// Tiny fade+rise animation on open so the menu does not pop in abruptly.
// Keep it short — 90ms — so power users moving between rows do not feel a
// stutter when reopening a menu on a neighbouring line.
const enter = keyframes`
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
`

export const Menu = styled.div`
  position: fixed;
  z-index: ${({ theme }) => theme.z.modal};
  min-width: 180px;
  padding: 4px;
  background: ${({ theme }) => theme.color.bgPanel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.lg};
  box-shadow: ${({ theme }) => theme.shadow.lg};
  animation: ${enter} 90ms ease-out;
  display: flex;
  flex-direction: column;
  gap: 2px;
  /* Allow the menu to scroll if a future caller throws in 20 items, while
     keeping the rounded corners crisp. */
  max-height: 60vh;
  overflow-y: auto;
`
Menu.displayName = 'RowMenu.Menu'

export const MenuItem = styled.button<{ $tone?: 'default' | 'danger' }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  width: 100%;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  border-radius: ${({ theme }) => theme.radius.md};
  font-size: ${({ theme }) => theme.font.size.sm};
  text-align: left;
  cursor: pointer;
  color: ${({ $tone, theme }) =>
    $tone === 'danger' ? theme.color.danger : theme.color.text};
  transition: background 100ms ease, color 100ms ease;

  &:hover, &:focus-visible {
    outline: none;
    ${({ $tone, theme }) =>
      $tone === 'danger'
        ? css`
            background: color-mix(in srgb, ${theme.color.danger} 12%, transparent);
            color: ${theme.color.danger};
          `
        : css`
            background: ${theme.color.bgElev};
            color: ${theme.color.text};
          `}
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    background: transparent;
  }

  & > .label { flex: 1; min-width: 0; }
  & > .icon  {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    color: currentColor;
    opacity: 0.85;
  }
`
MenuItem.displayName = 'RowMenu.MenuItem'

export const Divider = styled.div`
  height: 1px;
  margin: 4px 2px;
  background: ${({ theme }) => theme.color.border};
`
Divider.displayName = 'RowMenu.Divider'

// Optional small caption rendered above a group of items. Useful when the
// menu mixes navigation and destructive actions and we want to label the
// danger zone explicitly.
export const SectionLabel = styled.div`
  padding: 6px 10px 4px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.textFaint};
`
SectionLabel.displayName = 'RowMenu.SectionLabel'
