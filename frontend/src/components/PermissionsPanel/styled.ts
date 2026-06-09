import styled from 'styled-components'

export const PermissionsPanelRoot = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
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
`
