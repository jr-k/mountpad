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
      & > span { box-shadow: 0 0 0 2px color-mix(in srgb, ${theme.color.accent} 60%, transparent); }
    `}
`

// luminance picks a near-black or near-white text token based on the
// background colour, with the same 0.55 threshold the shared Avatar
// uses. Inlined so we don't import a Browser-only helper into a
// styled template (which runs server-side too in test environments).
const luminance = (hex: string): number => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return 0.5
  const r = parseInt(m[1].slice(0, 2), 16) / 255
  const g = parseInt(m[1].slice(2, 4), 16) / 255
  const b = parseInt(m[1].slice(4, 6), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// Rounded-square avatar with the mount initial. Used both as the
// whole button in collapsed mode and inside expanded items / dropdown
// options. We keep the rounded-square shape (instead of switching to
// the shared circular Avatar) because it reads as a "workspace tile"
// alongside the rail/stripe affordance - the active indicator lives
// outside the avatar, freeing the avatar itself to always display
// the mount's identity colour.
export const Avatar = styled.span<{ $bg: string }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 8px;
  font-family: ${({ theme }) => theme.font.mono};
  font-weight: 600;
  font-size: 13px;
  text-transform: uppercase;
  user-select: none;
  ${({ $bg }) => css`
    background: ${$bg};
    color: ${luminance($bg) > 0.55 ? '#1f2328' : '#ffffff'};
  `}
  /* Subtle inset ring so the avatar still has an edge against same
     coloured surfaces (e.g. white avatar on white drawer). */
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
  transition: box-shadow 120ms ease;
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

// ───────────────────────────────────────────────────────────────────────
// Mobile dropdown variant.
//
// Inside the drawer (<lg) the desktop "list of mounts" reads as a stack
// of repetitive full-width cards, and the desktop collapse arrow does
// nothing useful because the drawer always forces width: 100%. So at
// that breakpoint we collapse the whole component to a single dropdown
// whose trigger shows only the ACTIVE mount; tapping it reveals the
// full list as a popover that overlays the rest of the drawer.

// Wrapper anchors the absolutely-positioned popover. Width: 100% so
// the trigger fills the entire drawer Sidebar strip edge-to-edge
// (Sidebar has no inner padding of its own in mobile).
export const DropdownRoot = styled.div`
  position: relative;
  width: 100%;
`

// Trigger reuses the visual rhythm of the desktop Item (same avatar +
// meta block) so the active mount reads identically across layouts.
// The trailing caret is the only added affordance - it signals the
// "tap to switch mount" behaviour.
//
// Visual treatment is flat and edge-to-edge: no radius, no full
// border. The drawer Sidebar already draws a bottom rule separating
// this strip from the file explorer below; adding a second rounded
// border around the trigger reads as a "card inside a bar". Open
// state is signalled by background + accent underline instead.
export const DropdownTrigger = styled.button<{ $open?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  width: 100%;
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[3]}`};
  border: 0;
  background: ${({ $open, theme }) => ($open ? theme.color.bgElev : 'transparent')};
  color: ${({ theme }) => theme.color.text};
  font-size: ${({ theme }) => theme.font.size.md};
  text-align: left;
  cursor: pointer;
  transition: background 120ms ease;
  &:hover { background: ${({ theme }) => theme.color.bgElev}; }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: -2px;
  }
`

// Caret rotates 180° when the popover is open so the user has a
// visual confirmation their tap registered (matches every native
// dropdown convention). Transition is short to feel responsive.
export const DropdownCaret = styled.span<{ $open?: boolean }>`
  display: inline-flex;
  align-items: center;
  margin-left: auto;
  color: ${({ theme }) => theme.color.textMuted};
  transition: transform 120ms ease;
  transform: rotate(${({ $open }) => ($open ? 180 : 0)}deg);
`

// Placeholder used when no mount is active yet - short-circuits the
// avatar+meta layout to avoid rendering empty cells. Italic muted
// text reads as "nothing selected", matching the convention used by
// other empty-state placeholders in the app.
export const DropdownPlaceholder = styled.span`
  flex: 1;
  color: ${({ theme }) => theme.color.textMuted};
  font-style: italic;
`

// OptionList is the flat container for the mount options rendered
// inside the mount-picker modal body. We keep it minimal - no
// border, no background, no padding - because the Modal Body already
// owns those: the dialog has its own border + radius + padding, and
// the body handles scroll when the list exceeds the dialog's
// max-height (set on Modal.Dialog itself). This component is here
// just to give the options a tight vertical rhythm and an a11y
// listbox role anchor.
export const OptionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`
OptionList.displayName = 'MountPointSidebar.OptionList'

// Individual option row rendered inside the mount picker modal.
// Mirrors the desktop Item but doesn't draw its own border (the
// dialog already frames everything), keeping rows visually quiet
// so the active highlight stands out. Used identically across
// desktop expanded view and the mobile modal - same look, same
// interaction model.
export const DropdownOption = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  width: 100%;
  padding: ${({ theme }) => `${theme.space[2]} ${theme.space[2]}`};
  border: 0;
  background: ${({ $active, theme }) => ($active ? theme.color.accentMuted : 'transparent')};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.text};
  font-size: ${({ theme }) => theme.font.size.md};
  text-align: left;
  cursor: pointer;
  &:hover { background: ${({ $active, theme }) => ($active ? theme.color.accentMuted : theme.color.bgElev)}; }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: -2px;
  }
`
