import styled from 'styled-components'

export const PermissionMatrixRoot = styled.div`
  display: grid;
  /* The row-label column hugs its content; the three permission columns share
     the remaining space equally, so the matrix stretches to whatever width
     its container offers. */
  grid-template-columns: auto repeat(3, 1fr);
  gap: 4px;
  font-size: ${({ theme }) => theme.font.size.sm};
  width: 100%;
`

export const HeaderCell = styled.div`
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.color.textFaint};
  padding: 4px 6px;
`

export const RowLabel = styled.div`
  padding: 6px;
  color: ${({ theme }) => theme.color.textMuted};
`

export const Cell = styled.button<{ $on: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  background: ${({ $on, theme }) => ($on ? theme.color.accentMuted : theme.color.bgElev)};
  color: ${({ $on, theme }) => ($on ? theme.color.accentHover : theme.color.textFaint)};
  border: 1px solid ${({ $on, theme }) => ($on ? theme.color.accent : theme.color.border)};
  border-radius: ${({ theme }) => theme.radius.sm};
  font-family: ${({ theme }) => theme.font.mono};
  cursor: pointer;
  transition: background 120ms, color 120ms, border-color 120ms;
  &:hover { border-color: ${({ theme }) => theme.color.accent}; }

  /* Read-only state: the cell is no longer a control, so we drop the accent
     hues entirely and render a flat, low-contrast "tile" in the page's dark
     gray palette. Both ON and OFF cells share the same neutral fill; only the
     letter color signals the bit (dim = off, slightly brighter = on). */
  &:disabled {
    cursor: not-allowed;
    background: ${({ theme }) => theme.color.bgSubtle};
    border-color: ${({ theme }) => theme.color.border};
    color: ${({ $on, theme }) => ($on ? theme.color.textMuted : theme.color.textFaint)};
    opacity: 0.7;
    &:hover { border-color: ${({ theme }) => theme.color.border}; }
  }
`
