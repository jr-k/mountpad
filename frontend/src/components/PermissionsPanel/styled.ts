import styled from 'styled-components'

export const PermissionsPanelRoot = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
`

export const Intro = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.color.textMuted};
  font-size: ${({ theme }) => theme.font.size.sm};
  line-height: 1.5;
`

export const Panes = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: ${({ theme }) => theme.space[3]};
  align-items: stretch;

  @media (max-width: ${({ theme }) => theme.bp.md}) {
    grid-template-columns: 1fr;
  }
`

export const Pane = styled.section<{ $host?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
  padding: ${({ theme }) => theme.space[3]};
  border: 1px solid ${({ $host, theme }) => ($host ? theme.color.accent : theme.color.border)};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bgSubtle};
`

export const PaneHeader = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[2]};
`

export const PaneLead = styled.p`
  margin: ${({ theme }) => `${theme.space[1]} 0 0`};
  color: ${({ theme }) => theme.color.textMuted};
  font-size: ${({ theme }) => theme.font.size.xs};
  line-height: 1.45;
`

export const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
`

export const Heading = styled.h3`
  font-size: ${({ theme }) => theme.font.size.md};
  margin: 0;
  color: ${({ theme }) => theme.color.text};
`

export const Subtle = styled.div`
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.textFaint};
`

export const MatrixWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  width: 100%;

  & > ${Subtle} {
    align-self: flex-end;
  }
`

export const HostWarning = styled.div`
  margin-top: auto;
  padding: ${({ theme }) => theme.space[2]};
  border-left: 3px solid ${({ theme }) => theme.color.accent};
  background: ${({ theme }) => theme.color.bgElev};
  color: ${({ theme }) => theme.color.textMuted};
  font-size: ${({ theme }) => theme.font.size.xs};
  line-height: 1.45;
`

export const HostLocked = styled(HostWarning)`
  margin-top: 0;
`

// Inline error string for ACL save failures. Lives in the panel rather than
// using the global ErrorState surface because the message is contextual
// (right above the field that triggered it).
export const ErrorText = styled.div`
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.danger};
`

ErrorText.displayName = 'PermissionsPanel.ErrorText'

export const Row = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[2]};
  align-items: end;

  & > * {
    flex: 1;
    min-width: 0;
  }
`
