import styled from 'styled-components'

export const MainBody = styled.div`
  flex: 1;
  display: flex;
  overflow: hidden;
  min-width: 0;
`

export const EditorWrap = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
`

// DetailsBackdrop dims the page when the details drawer is open on
// narrow viewports. It's a no-op on desktop where the panel lives in the
// flex flow next to the editor and clicking outside has no meaning. Tap
// to close: the click handler is wired up in WorkspacePage.
export const DetailsBackdrop = styled.div`
  display: none;
  @media (max-width: ${({ theme }) => theme.bp.lg}) {
    display: block;
    position: fixed;
    inset: 0;
    background: ${({ theme }) => theme.color.overlay};
    z-index: ${({ theme }) => theme.z.drawer};
  }
`
DetailsBackdrop.displayName = 'WorkspacePage.DetailsBackdrop'

export const DeleteMessage = styled.p`
  margin: 0 0 ${({ theme }) => theme.space[3]};
  font-size: ${({ theme }) => theme.font.size.md};
  color: ${({ theme }) => theme.color.text};
  line-height: 1.5;

  & code {
    font-family: ${({ theme }) => theme.font.mono};
    font-size: 0.9em;
    background: ${({ theme }) => theme.color.bgElev};
    border: 1px solid ${({ theme }) => theme.color.border};
    padding: 1px 6px;
    border-radius: 4px;
    color: ${({ theme }) => theme.color.text};
  }
`

DeleteMessage.displayName = 'WorkspacePage.DeleteMessage'

export const DeleteHint = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.sm};
  color: ${({ theme }) => theme.color.textMuted};
  line-height: 1.5;
`

DeleteHint.displayName = 'WorkspacePage.DeleteHint'

export const DeleteOption = styled.label<{ $danger?: boolean }>`
  display: grid;
  grid-template-columns: 18px 1fr;
  gap: ${({ theme }) => theme.space[3]};
  align-items: start;
  padding: ${({ theme }) => theme.space[3]};
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ $danger, theme }) => ($danger
    ? `color-mix(in srgb, ${theme.color.danger} 45%, transparent)`
    : theme.color.border)};
  background: ${({ $danger, theme }) => ($danger
    ? `color-mix(in srgb, ${theme.color.danger} 8%, transparent)`
    : 'transparent')};
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;

  &:hover {
    border-color: ${({ $danger, theme }) => ($danger
      ? `color-mix(in srgb, ${theme.color.danger} 70%, transparent)`
      : theme.color.borderStrong)};
  }

  & > input[type='checkbox'] {
    margin-top: 2px;
    accent-color: ${({ theme }) => theme.color.danger};
    cursor: pointer;
  }

  & strong {
    display: block;
    font-size: ${({ theme }) => theme.font.size.md};
    color: ${({ $danger, theme }) => ($danger ? theme.color.danger : theme.color.text)};
    font-weight: 600;
    margin-bottom: 2px;
  }

  & p {
    margin: 0;
    font-size: ${({ theme }) => theme.font.size.sm};
    color: ${({ theme }) => theme.color.textMuted};
    line-height: 1.5;
  }
`

DeleteOption.displayName = 'WorkspacePage.DeleteOption'
