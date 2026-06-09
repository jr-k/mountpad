import styled from 'styled-components'

// The toggle is a pill-shaped segmented control. We render three buttons
// side-by-side, with the active one filled in. Sized to match the user chip
// height in the header so the top bar reads as a single tidy row.
export const ThemeToggleRoot = styled.div`
  display: inline-flex;
  align-items: center;
  padding: 2px;
  border-radius: 999px;
  background: ${({ theme }) => theme.color.bgElev};
  border: 1px solid ${({ theme }) => theme.color.border};
`

ThemeToggleRoot.displayName = 'ThemeToggle.Root'

export const Segment = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 999px;
  background: ${({ $active, theme }) => ($active ? theme.color.bgPanel : 'transparent')};
  color: ${({ $active, theme }) => ($active ? theme.color.text : theme.color.textMuted)};
  cursor: pointer;
  /* Subtle pop on the active segment so the choice reads at a glance even
     when the toggle has a busy background behind it (e.g. the welcome
     screen's gradient). */
  box-shadow: ${({ $active, theme }) => ($active ? theme.shadow.sm : 'none')};
  transition: background 120ms ease, color 120ms ease, box-shadow 120ms ease;
  &:hover { color: ${({ theme }) => theme.color.text}; }
  svg { display: block; }
`

Segment.displayName = 'ThemeToggle.Segment'
