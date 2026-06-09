import styled from 'styled-components'

export const EmptyStateRoot = styled.div`
  display: grid;
  place-items: center;
  flex: 1;
  padding: ${({ theme }) => theme.space[8]};
  color: ${({ theme }) => theme.color.textMuted};
  text-align: center;
`

export const Title = styled.div`
  font-size: ${({ theme }) => theme.font.size.lg};
  color: ${({ theme }) => theme.color.text};
  margin-bottom: ${({ theme }) => theme.space[2]};
`

export const Desc = styled.div`
  font-size: ${({ theme }) => theme.font.size.sm};
  max-width: 320px;
  line-height: 1.5;
`
