import styled from 'styled-components'

export const ErrorStateRoot = styled.div`
  display: grid;
  place-items: center;
  flex: 1;
  padding: ${({ theme }) => theme.space[8]};
  text-align: center;
`

export const Title = styled.div`
  color: ${({ theme }) => theme.color.danger};
  font-size: ${({ theme }) => theme.font.size.lg};
  margin-bottom: ${({ theme }) => theme.space[2]};
`

export const Desc = styled.div`
  color: ${({ theme }) => theme.color.textMuted};
  font-size: ${({ theme }) => theme.font.size.sm};
  max-width: 360px;
  line-height: 1.5;
`
