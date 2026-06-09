import styled from 'styled-components'

/**
 * Visual primitives for the file path breadcrumb.
 *
 *   [Mount] / foo / bar / file.txt
 *      ▲       ▲    ▲     ▲
 *      │       │    │     └─ Current segment (file or active folder).
 *      │       │    │        Rendered as static text when it identifies the
 *      │       │    │        file currently open in the editor.
 *      │       └────┴──── Folder crumbs: clickable buttons that navigate
 *      │                  to that folder.
 *      └─ Root crumb: navigates to the mount root.
 *
 * The breadcrumb is its own flexbox with `min-width: 0; overflow-x: auto`
 * so very long paths scroll horizontally inside the toolbar/header
 * instead of pushing the trailing controls off-screen.
 */

export const BreadcrumbRoot = styled.nav`
  display: inline-flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  gap: 0;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.md};
  /* Horizontally scrollable if the path is too long. We hide the scroll
     bar (cosmetic noise inside a 32px-tall toolbar) but keep the wheel
     and touch interactions working. */
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
`

// Clickable folder crumb. We render it as a real <button> so the
// breadcrumb stays keyboard-navigable and announces itself as a control
// to assistive tech. The hover/focus state mirrors the toolbar button
// surfaces so the breadcrumb feels native to its container.
export const Crumb = styled.button`
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  margin: 0;
  border: 0;
  background: transparent;
  border-radius: ${({ theme }) => theme.radius.sm};
  font: inherit;
  color: ${({ theme }) => theme.color.textMuted};
  cursor: pointer;
  white-space: nowrap;
  transition: background 100ms ease, color 100ms ease;

  &:hover {
    background: ${({ theme }) => theme.color.bgElev};
    color: ${({ theme }) => theme.color.text};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: 1px;
  }
`

// The non-clickable trailing segment (file name when the toolbar is
// showing an open file). Keeps the visual rhythm of a Crumb (same
// padding) so the breadcrumb does not jitter when the leaf alternates
// between clickable folder and static file.
export const Current = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  font: inherit;
  color: ${({ theme }) => theme.color.text};
  white-space: nowrap;
`

export const Separator = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 0 1px;
  color: ${({ theme }) => theme.color.textFaint};
  user-select: none;
  pointer-events: none;
`

// RenameLeaf is the discreet pencil button that appears right after the
// leaf folder crumb. It's intentionally muted at rest (icon-only,
// transparent background) so it doesn't compete with the path itself;
// hover/focus reveals the accent so the user knows it's interactive.
// We keep the hit-area aligned with the crumbs (same vertical padding)
// so the breadcrumb stays a single, even-height row.
export const RenameLeaf = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 4px;
  padding: 2px;
  border: 0;
  background: transparent;
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.textFaint};
  cursor: pointer;
  transition: background 100ms ease, color 100ms ease;

  &:hover {
    background: ${({ theme }) => theme.color.bgElev};
    color: ${({ theme }) => theme.color.accent};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: 1px;
  }
  svg { display: block; }
`
