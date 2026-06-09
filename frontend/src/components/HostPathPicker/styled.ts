import styled from 'styled-components'

// Stretches to fill the host Modal (rendered with size="lg" so the
// Dialog itself caps at 720px). We never set our own width: the
// Modal owns the dialog dimensions, and PickerSurface just claims
// all the room the Body grants it. Setting a width here used to
// exceed the Dialog cap and triggered a horizontal scrollbar on
// the Body (which has overflow-y: auto, implicitly promoting
// overflow-x to auto by spec).
export const PickerSurface = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
  width: 100%;
  min-width: 0;
  min-height: 420px;
`

export const PathBar = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
`

export const PathInput = styled.input`
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  background: ${({ theme }) => theme.color.bgElev};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.md};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.sm};
  outline: none;
  transition: border-color 120ms ease;
  &:focus { border-color: ${({ theme }) => theme.color.accent}; }
`

export const IconButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  background: ${({ theme }) => theme.color.bgElev};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.md};
  color: ${({ theme }) => theme.color.text};
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.color.borderStrong};
    background: ${({ theme }) => theme.color.bgPanel};
  }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`

// Scroll container for the directory listing. Fixed min-height keeps
// the dialog stable as the user navigates between dense and sparse
// folders - jumpy modal sizing felt nauseating in testing.
export const Listing = styled.div`
  flex: 1 1 auto;
  min-height: 280px;
  max-height: 50vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bgSubtle};
`

export const Row = styled.button<{ $isDir: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: 0;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  text-align: left;
  color: ${({ theme, $isDir }) => ($isDir ? theme.color.text : theme.color.textFaint)};
  font-size: ${({ theme }) => theme.font.size.md};
  cursor: ${({ $isDir }) => ($isDir ? 'pointer' : 'default')};
  font-family: ${({ theme }) => theme.font.family};

  /* Files are rendered for context but not actionable: dim them, no
     hover, no pointer. The parent component also disables the click
     handler so this is purely visual. */
  &:hover {
    background: ${({ theme, $isDir }) => ($isDir ? theme.color.bgElev : 'transparent')};
  }
  &:last-child { border-bottom: 0; }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: -2px;
  }
`

export const RowIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  color: ${({ theme }) => theme.color.textMuted};
`

export const RowName = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const Empty = styled.div`
  padding: ${({ theme }) => theme.space[5]};
  color: ${({ theme }) => theme.color.textMuted};
  font-size: ${({ theme }) => theme.font.size.sm};
  text-align: center;
`

export const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[3]};
  font-size: ${({ theme }) => theme.font.size.sm};
  color: ${({ theme }) => theme.color.textMuted};
`

export const HiddenToggle = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
`

export const ErrorBanner = styled.div`
  padding: 8px 12px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: color-mix(in srgb, ${({ theme }) => theme.color.danger} 10%, transparent);
  border: 1px solid color-mix(in srgb, ${({ theme }) => theme.color.danger} 30%, transparent);
  color: ${({ theme }) => theme.color.danger};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.sm};
`
