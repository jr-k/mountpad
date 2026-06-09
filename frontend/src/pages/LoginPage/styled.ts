import styled, { keyframes, css } from 'styled-components'

const blink = keyframes`
  0%, 49%   { opacity: 1; }
  50%, 100% { opacity: 0; }
`

const dotGrid = css`
  background-color: ${({ theme }) => theme.color.bg};
  background-image:
    radial-gradient(circle at 1px 1px, ${({ theme }) => theme.color.border} 1px, transparent 0);
  background-size: 22px 22px;
  background-position: -1px -1px;
`

export const LoginPageRoot = styled.div`
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: ${({ theme }) => theme.space[6]};
  ${dotGrid}
  position: relative;
  overflow: hidden;

  &::before,
  &::after {
    content: '';
    position: absolute;
    width: 520px;
    height: 520px;
    border-radius: 50%;
    filter: blur(120px);
    opacity: 0.18;
    pointer-events: none;
  }
  &::before {
    background: ${({ theme }) => theme.color.accent};
    top: -180px;
    left: -120px;
  }
  &::after {
    background: ${({ theme }) => theme.color.accentHover};
    bottom: -200px;
    right: -160px;
    opacity: 0.10;
  }
`

LoginPageRoot.displayName = 'LoginPage.Root'

// Floating slot pinned to the top-right of the auth screen. The login flow
// doesn't render the AppShell header, so we still want users to be able to
// flip the theme from the sign-in page itself (matters for shared kiosks
// where the OS theme might not be what the user wants).
export const TopBar = styled.div`
  position: absolute;
  top: ${({ theme }) => theme.space[4]};
  right: ${({ theme }) => theme.space[4]};
  z-index: 1;
`

TopBar.displayName = 'LoginPage.TopBar'

/**
 * The frame mimics an IDE/terminal pane: corner brackets at each corner are
 * drawn with SVG-free CSS so the card stays crisp at any zoom.
 */
export const Frame = styled.div`
  position: relative;
  width: min(440px, 100%);
  padding: ${({ theme }) => theme.space[8]};

  &::before,
  &::after {
    content: '';
    position: absolute;
    width: 18px;
    height: 18px;
    border-color: ${({ theme }) => theme.color.borderStrong};
    border-style: solid;
    border-width: 0;
  }
  /* top-left + bottom-right */
  &::before {
    top: 0;
    left: 0;
    border-top-width: 2px;
    border-left-width: 2px;
    border-top-left-radius: 4px;
  }
  &::after {
    bottom: 0;
    right: 0;
    border-bottom-width: 2px;
    border-right-width: 2px;
    border-bottom-right-radius: 4px;
  }

  /* top-right + bottom-left via nested element */
  & > .corner-tr,
  & > .corner-bl {
    position: absolute;
    width: 18px;
    height: 18px;
    border-color: ${({ theme }) => theme.color.borderStrong};
    border-style: solid;
    border-width: 0;
  }
  & > .corner-tr {
    top: 0;
    right: 0;
    border-top-width: 2px;
    border-right-width: 2px;
    border-top-right-radius: 4px;
  }
  & > .corner-bl {
    bottom: 0;
    left: 0;
    border-bottom-width: 2px;
    border-left-width: 2px;
    border-bottom-left-radius: 4px;
  }
`

Frame.displayName = 'LoginPage.Frame'

export const Card = styled.form`
  background: ${({ theme }) => theme.color.bgPanel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme }) => theme.space[6]} ${({ theme }) => theme.space[6]} ${({ theme }) => theme.space[5]};
  box-shadow: ${({ theme }) => theme.shadow.lg};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
`

Card.displayName = 'LoginPage.Card'

export const BrandRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  color: ${({ theme }) => theme.color.accent};
`

BrandRow.displayName = 'LoginPage.BrandRow'

export const BrandText = styled.div`
  display: flex;
  flex-direction: column;
  line-height: 1.1;
`

BrandText.displayName = 'LoginPage.BrandText'

export const BrandName = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.xl};
  font-weight: 600;
  letter-spacing: -0.01em;
  color: ${({ theme }) => theme.color.text};
`

BrandName.displayName = 'LoginPage.BrandName'

export const BrandTag = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.xs};
  text-transform: lowercase;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.color.textFaint};
  margin-top: 4px;
`

BrandTag.displayName = 'LoginPage.BrandTag'

export const Prompt = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.sm};
  color: ${({ theme }) => theme.color.textMuted};
  margin-top: ${({ theme }) => theme.space[1]};

  & .path {
    color: ${({ theme }) => theme.color.textMuted};
  }
  & .arrow {
    color: ${({ theme }) => theme.color.textFaint};
    padding: 0 4px;
  }
  & .verb {
    color: ${({ theme }) => theme.color.text};
  }
  & .caret {
    display: inline-block;
    width: 7px;
    height: 14px;
    margin-left: 4px;
    background: ${({ theme }) => theme.color.accent};
    animation: ${blink} 1s steps(1) infinite;
    vertical-align: -2px;
  }
`

Prompt.displayName = 'LoginPage.Prompt'

export const Divider = styled.div`
  height: 1px;
  background: linear-gradient(
    to right,
    transparent,
    ${({ theme }) => theme.color.border} 12%,
    ${({ theme }) => theme.color.border} 88%,
    transparent
  );
  margin: ${({ theme }) => theme.space[1]} 0 ${({ theme }) => theme.space[2]};
`

Divider.displayName = 'LoginPage.Divider'

export const Actions = styled.div`
  margin-top: ${({ theme }) => theme.space[2]};

  & > button {
    width: 100%;
    justify-content: center;
    padding-top: 10px;
    padding-bottom: 10px;
    font-size: ${({ theme }) => theme.font.size.md};
  }
`

Actions.displayName = 'LoginPage.Actions'

export const ErrorMsg = styled.div`
  color: ${({ theme }) => theme.color.danger};
  font-size: ${({ theme }) => theme.font.size.sm};
  font-family: ${({ theme }) => theme.font.mono};
  padding: ${({ theme }) => theme.space[2]} ${({ theme }) => theme.space[3]};
  /* color-mix gives us a tinted backdrop derived from the *current* danger
     hue, so it tracks light/dark instead of locking to the dark palette. */
  background: color-mix(in srgb, ${({ theme }) => theme.color.danger} 10%, transparent);
  border: 1px solid color-mix(in srgb, ${({ theme }) => theme.color.danger} 30%, transparent);
  border-radius: ${({ theme }) => theme.radius.md};

  &::before {
    content: '! ';
    color: ${({ theme }) => theme.color.danger};
    font-weight: 700;
  }
`

ErrorMsg.displayName = 'LoginPage.ErrorMsg'

export const Footer = styled.div`
  margin-top: ${({ theme }) => theme.space[4]};
  text-align: center;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.textFaint};
  letter-spacing: 0.02em;
`

Footer.displayName = 'LoginPage.Footer'
