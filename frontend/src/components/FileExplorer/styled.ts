import styled from 'styled-components'
import { TOOLBAR_MIN_HEIGHT } from '@/components/FileToolbar/styled'

export const FileExplorerRoot = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: ${({ theme }) => theme.color.bgPanel};
`

export const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => `${theme.space[2]} ${theme.space[3]}`};
  min-height: ${TOOLBAR_MIN_HEIGHT};
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
`

export const PathBar = styled.div`
  flex: 1;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.sm};
  color: ${({ theme }) => theme.color.textMuted};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const List = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: ${({ theme }) => theme.space[1]};
`

export const Group = styled.div`
  display: flex;
  flex-direction: column;
`

// DetailsToggle is the compact square icon-button next to the +File/+Folder
// actions in the explorer toolbar. It flips the "show owner:group · rwx"
// metadata trail on every row. Active state mirrors a pressed button so the
// user keeps track of whether details are on after scrolling.
//
// Vertical metrics deliberately mirror the small <Button> variant used
// for "+ File" and "+ Folder" right next to it: same padding, same
// border, same radius. That way the three buttons line up as a single
// uniform row instead of having a slightly taller square sticking out.
export const DetailsToggle = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  line-height: 1.2;
  border: 1px solid ${({ $active, theme }) => ($active ? theme.color.accent : theme.color.border)};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ $active, theme }) => ($active ? theme.color.accentMuted : 'transparent')};
  color: ${({ $active, theme }) => ($active ? theme.color.accent : theme.color.textMuted)};
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
  &:hover {
    color: ${({ theme }) => theme.color.text};
    border-color: ${({ theme }) => theme.color.borderStrong};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: 1px;
  }
  svg { display: block; }
`

DetailsToggle.displayName = 'FileExplorer.DetailsToggle'
