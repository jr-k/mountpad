import styled from 'styled-components'

export const SelectField = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: ${({ theme }) => theme.font.size.sm};
  color: ${({ theme }) => theme.color.textMuted};
`

export const Control = styled.select`
  padding: 8px 10px;
  background: ${({ theme }) => theme.color.bgElev};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.md};
  color: ${({ theme }) => theme.color.text};
  font-size: ${({ theme }) => theme.font.size.md};
  outline: none;
  &:focus { border-color: ${({ theme }) => theme.color.accent}; }
`
