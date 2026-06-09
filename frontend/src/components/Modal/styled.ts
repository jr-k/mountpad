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
  /* On very small viewports we want some breathing room around the
     dialog so the rounded card never bleeds into the screen edges.
     The Dialog itself caps at 92vw, so the padding only kicks in
     once the viewport is too short to comfortably center it. */
  padding: ${({ theme }) => theme.space[3]};
  backdrop-filter: blur(2px);
`

// Dialog uses a flex column so the Header + Footer stay pinned and
// the Body grows to fill what's left - with `min-height: 0` enabling
// the inner overflow rule. `max-height: 92vh` (mirroring the 92vw
// width cap) prevents the dialog from ever exceeding the viewport,
// so long content scrolls inside the body rather than running off
// screen.
export const Dialog = styled.div`
  width: min(520px, 92vw);
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: ${({ theme }) => theme.color.bgPanel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.lg};
  box-shadow: ${({ theme }) => theme.shadow.lg};
  z-index: ${({ theme }) => theme.z.modal};
  animation: ${fadeIn} 140ms ease-out;
  overflow: hidden; /* clip the body's scrollbar to the dialog radius */
`

export const Header = styled.header`
  padding: ${({ theme }) => `${theme.space[4]} ${theme.space[5]}`};
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  font-weight: 600;
  flex-shrink: 0;
`

// Body is the scroll container. `min-height: 0` is the standard
// flexbox incantation that lets `overflow-y: auto` actually clip
// children - without it a flex item refuses to shrink below the
// height of its content and the scrollbar never appears.
export const Body = styled.div`
  padding: ${({ theme }) => `${theme.space[5]}`};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
  overflow-y: auto;
  overscroll-behavior: contain;
  min-height: 0;
  flex: 1 1 auto;
`

export const Footer = styled.footer`
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[5]}`};
  border-top: 1px solid ${({ theme }) => theme.color.border};
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space[2]};
  flex-shrink: 0;
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
