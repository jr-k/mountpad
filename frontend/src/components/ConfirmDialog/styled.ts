import styled from 'styled-components'

export const Body = styled.div`
  color: ${({ theme }) => theme.color.textMuted};
  line-height: 1.5;
`

export const Strong = styled.code`
  font-family: ${({ theme }) => theme.font.mono};
  background: ${({ theme }) => theme.color.bgElev};
  padding: 1px 6px;
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.text};
`
