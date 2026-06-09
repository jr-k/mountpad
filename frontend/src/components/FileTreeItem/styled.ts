import styled from 'styled-components'

// Row is the full-width clickable strip for a tree entry. We render it as
// a <div> (not a <button>) because the disclosure chevron in front needs
// to be its own button — nesting a <button> inside another <button> is
// invalid HTML and confuses screen readers. Keyboard focus is preserved
// via tabIndex + role on the consumer side.
export const FileTreeItemRow = styled.div<{
  $depth: number
  $active?: boolean
  $dropTarget?: boolean
}>`
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 8px 5px ${({ $depth }) => 4 + $depth * 16}px;
  background: ${({ $active, $dropTarget, theme }) =>
    $dropTarget ? theme.color.accentMuted
      : $active ? theme.color.accentMuted
        : 'transparent'};
  color: ${({ theme }) => theme.color.text};
  text-align: left;
  font-size: ${({ theme }) => theme.font.size.sm};
  border-radius: ${({ theme }) => theme.radius.sm};
  cursor: pointer;
  box-shadow: ${({ $dropTarget, theme }) =>
    $dropTarget ? `inset 0 0 0 1px ${theme.color.accent}` : 'none'};
  /* Prevent the second click of a double-click from selecting the entry
     name as plain text — that would feel jarring in a file-manager UX,
     where double-click means "open". */
  user-select: none;
  &:hover { background: ${({ $active, $dropTarget, theme }) =>
    $dropTarget ? theme.color.accentMuted
      : $active ? theme.color.accentMuted
        : theme.color.bgElev}; }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: -2px;
  }
`

FileTreeItemRow.displayName = 'FileTreeItem.Row'

// Disclosure is the tiny chevron-button shown only on folders. It is the
// SOLE control for collapsing/expanding the branch; clicking elsewhere on
// the row activates (navigates to) the folder instead. The chevron rotates
// 90° when the branch is open so the orientation hint always matches the
// underlying state.
export const Disclosure = styled.button<{ $open?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border: 0;
  padding: 0;
  background: transparent;
  color: ${({ theme }) => theme.color.textMuted};
  cursor: pointer;
  border-radius: ${({ theme }) => theme.radius.sm};
  transition: transform 120ms ease, background 120ms ease, color 120ms ease;
  &:hover {
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.bgElev};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: 1px;
  }
  & > svg {
    display: block;
    transition: transform 120ms ease;
    transform: ${({ $open }) => ($open ? 'rotate(90deg)' : 'rotate(0deg)')};
  }
`

Disclosure.displayName = 'FileTreeItem.Disclosure'

// DisclosureSpacer keeps file rows visually aligned with folder rows by
// reserving the same horizontal slot the chevron would occupy. Without
// it, file entries would slide left under their parent's chevron and the
// tree would look ragged.
export const DisclosureSpacer = styled.span`
  display: inline-block;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
`

DisclosureSpacer.displayName = 'FileTreeItem.DisclosureSpacer'

export const Icon = styled.span`
  width: 20px;
  flex-shrink: 0;
  text-align: center;
  font-size: 16px;
  line-height: 1;
  /* Emojis render best with system fonts; opt into color emoji explicitly. */
  font-family:
    "Apple Color Emoji",
    "Segoe UI Emoji",
    "Noto Color Emoji",
    "Twemoji Mozilla",
    sans-serif;
`

Icon.displayName = 'FileTreeItem.Icon'

export const Name = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

Name.displayName = 'FileTreeItem.Name'

// Details renders the Linux-style trailing metadata "owner:group · rwxr-x---"
// when the explorer "details" toggle is on. It sits inline on the right side
// of the row, dimmer than the entry name so the eye still anchors on names.
export const Details = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 10px;
  color: ${({ theme }) => theme.color.textFaint};
  flex-shrink: 0;
  margin-left: auto;
`

Details.displayName = 'FileTreeItem.Details'

export const Owner = styled.span`
  color: ${({ theme }) => theme.color.textMuted};
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

Owner.displayName = 'FileTreeItem.Owner'

export const Group = styled.span`
  color: ${({ theme }) => theme.color.textMuted};
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

Group.displayName = 'FileTreeItem.Group'

export const Sep = styled.span`
  color: ${({ theme }) => theme.color.textFaint};
`

Sep.displayName = 'FileTreeItem.Sep'

export const Mode = styled.span`
  /* The rwx triplet sits after a thin separator so eye flow stays linear.
     Letter-spacing nudges the monospace glyphs apart for legibility. */
  padding-left: 6px;
  border-left: 1px solid ${({ theme }) => theme.color.border};
  letter-spacing: 0.04em;
`

Mode.displayName = 'FileTreeItem.Mode'
