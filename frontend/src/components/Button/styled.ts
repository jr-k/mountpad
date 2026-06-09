import styled, { css } from 'styled-components'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const variants = {
  primary: css`
    background: ${({ theme }) => theme.color.accent};
    color: ${({ theme }) => theme.color.onAccent};
    border: 1px solid ${({ theme }) => theme.color.accent};
    &:hover:not(:disabled) { background: ${({ theme }) => theme.color.accentHover}; border-color: ${({ theme }) => theme.color.accentHover}; }
  `,
  secondary: css`
    background: ${({ theme }) => theme.color.bgElev};
    color: ${({ theme }) => theme.color.text};
    border: 1px solid ${({ theme }) => theme.color.border};
    &:hover:not(:disabled) { border-color: ${({ theme }) => theme.color.borderStrong}; background: ${({ theme }) => theme.color.bgPanel}; }
  `,
  ghost: css`
    background: transparent;
    color: ${({ theme }) => theme.color.textMuted};
    border: 1px solid transparent;
    &:hover:not(:disabled) { color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.bgElev}; }
  `,
  danger: css`
    background: ${({ theme }) => theme.color.danger};
    color: #ffffff;
    border: 1px solid ${({ theme }) => theme.color.danger};
    &:hover:not(:disabled) { background: ${({ theme }) => theme.color.dangerHover}; border-color: ${({ theme }) => theme.color.dangerHover}; }
  `,
}

const sizes = {
  sm: css`padding: 4px 10px; font-size: ${({ theme }) => theme.font.size.sm};`,
  md: css`padding: 6px 14px; font-size: ${({ theme }) => theme.font.size.md};`,
}

export const ButtonRoot = styled.button<{ $variant: Variant; $size: Size }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: ${({ theme }) => theme.radius.md};
  font-weight: 500;
  line-height: 1.2;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.color.accent}; outline-offset: 1px; }
  ${({ $variant }) => variants[$variant]}
  ${({ $size }) => sizes[$size]}
`
