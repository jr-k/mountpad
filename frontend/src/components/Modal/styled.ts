import styled, { keyframes } from 'styled-components'

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
`

export const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: ${({ theme }) => theme.color.overlay};
  z-index: ${({ theme }) => theme.z.overlay};
  display: grid;
  place-items: center;
  backdrop-filter: blur(2px);
`

export const Dialog = styled.div`
  width: min(520px, 92vw);
  background: ${({ theme }) => theme.color.bgPanel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.lg};
  box-shadow: ${({ theme }) => theme.shadow.lg};
  z-index: ${({ theme }) => theme.z.modal};
  animation: ${fadeIn} 140ms ease-out;
`

export const Header = styled.header`
  padding: ${({ theme }) => `${theme.space[4]} ${theme.space[5]}`};
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  font-weight: 600;
`

export const Body = styled.div`
  padding: ${({ theme }) => `${theme.space[5]}`};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
`

export const Footer = styled.footer`
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[5]}`};
  border-top: 1px solid ${({ theme }) => theme.color.border};
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space[2]};
`

// Form wrapper used when the Modal is given an `onSubmit` handler.
// `display: contents` keeps the Body/Footer layout exactly as if no form
// were present, so the existing styled rules and Dialog grid still apply.
// `position: relative` makes the hidden submit button (`position: absolute`)
// anchor to the form itself, not the closest positioned ancestor.
export const Form = styled.form`
  display: contents;
  position: relative;
`
