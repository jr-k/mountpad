import styled, { keyframes } from 'styled-components'

const spin = keyframes`
  to { transform: rotate(360deg); }
`

export const LoadingStateRoot = styled.div`
  display: grid;
  place-items: center;
  flex: 1;
  padding: ${({ theme }) => theme.space[8]};
  color: ${({ theme }) => theme.color.textMuted};
`

export const Spinner = styled.div`
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid ${({ theme }) => theme.color.border};
  border-top-color: ${({ theme }) => theme.color.accent};
  animation: ${spin} 0.8s linear infinite;
`
