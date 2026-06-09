import styled, { keyframes } from 'styled-components'

const enter = keyframes`
  from { opacity: 0; transform: translateY(12px) scale(0.99); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
`

export const WelcomeScreenRoot = styled.div`
  flex: 1;
  display: grid;
  place-items: center;
  padding: ${({ theme }) => theme.space[6]};
  position: relative;
  overflow: hidden;
`
WelcomeScreenRoot.displayName = 'WelcomeScreen.Root'

export const Backdrop = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    radial-gradient(circle at 1px 1px, ${({ theme }) => theme.color.border} 1px, transparent 0);
  background-size: 22px 22px;
  background-position: -1px -1px;
  mask-image: radial-gradient(circle at 50% 40%, black, transparent 70%);
  -webkit-mask-image: radial-gradient(circle at 50% 40%, black, transparent 70%);
  opacity: 0.7;

  &::before,
  &::after {
    content: '';
    position: absolute;
    width: 480px;
    height: 480px;
    border-radius: 50%;
    filter: blur(120px);
    opacity: 0.12;
  }
  &::before {
    background: ${({ theme }) => theme.color.accent};
    top: -160px;
    left: -120px;
  }
  &::after {
    background: ${({ theme }) => theme.color.accentHover};
    bottom: -160px;
    right: -100px;
    opacity: 0.08;
  }
`
Backdrop.displayName = 'WelcomeScreen.Backdrop'

export const Card = styled.div`
  position: relative;
  width: min(640px, 100%);
  background: ${({ theme }) => theme.color.bgPanel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.xl};
  box-shadow: ${({ theme }) => theme.shadow.lg};
  padding: ${({ theme }) => theme.space[10]} ${({ theme }) => theme.space[8]} ${({ theme }) => theme.space[8]};
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  animation: ${enter} 280ms ease-out;
`
Card.displayName = 'WelcomeScreen.Card'

export const Mark = styled.div`
  width: 80px;
  height: 80px;
  border-radius: ${({ theme }) => theme.radius.lg};
  display: grid;
  place-items: center;
  background: linear-gradient(
    160deg,
    ${({ theme }) => theme.color.accentMuted},
    ${({ theme }) => theme.color.bgElev}
  );
  border: 1px solid ${({ theme }) => theme.color.border};
  color: ${({ theme }) => theme.color.accent};
  margin-bottom: ${({ theme }) => theme.space[2]};
`
Mark.displayName = 'WelcomeScreen.Mark'

export const Eyebrow = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.xs};
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: ${({ theme }) => theme.color.textFaint};
`
Eyebrow.displayName = 'WelcomeScreen.Eyebrow'

export const Title = styled.h1`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.h1};
  font-weight: 600;
  letter-spacing: -0.02em;
  color: ${({ theme }) => theme.color.text};
`
Title.displayName = 'WelcomeScreen.Title'

export const Lead = styled.p`
  margin: 0 auto ${({ theme }) => theme.space[2]};
  max-width: 50ch;
  font-size: ${({ theme }) => theme.font.size.md};
  line-height: 1.65;
  color: ${({ theme }) => theme.color.textMuted};

  & code {
    font-family: ${({ theme }) => theme.font.mono};
    font-size: 0.9em;
    background: ${({ theme }) => theme.color.bgElev};
    border: 1px solid ${({ theme }) => theme.color.border};
    padding: 0 4px;
    border-radius: 4px;
    color: ${({ theme }) => theme.color.text};
  }
`
Lead.displayName = 'WelcomeScreen.Lead'

export const Steps = styled.ol`
  list-style: none;
  margin: ${({ theme }) => theme.space[4]} 0 ${({ theme }) => theme.space[3]};
  padding: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
  text-align: left;
`
Steps.displayName = 'WelcomeScreen.Steps'

export const Step = styled.li`
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: ${({ theme }) => theme.space[3]};
  align-items: start;
  padding: ${({ theme }) => theme.space[3]};
  background: ${({ theme }) => theme.color.bgSubtle};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.md};
`
Step.displayName = 'WelcomeScreen.Step'

export const StepNumber = styled.span`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: ${({ theme }) => theme.color.accentMuted};
  color: ${({ theme }) => theme.color.accent};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.sm};
  font-weight: 600;
`
StepNumber.displayName = 'WelcomeScreen.StepNumber'

export const StepBody = styled.div`
  min-width: 0;
`
StepBody.displayName = 'WelcomeScreen.StepBody'

export const StepTitle = styled.div`
  font-size: ${({ theme }) => theme.font.size.md};
  font-weight: 600;
  color: ${({ theme }) => theme.color.text};
  margin-bottom: 2px;
`
StepTitle.displayName = 'WelcomeScreen.StepTitle'

export const StepDesc = styled.div`
  font-size: ${({ theme }) => theme.font.size.sm};
  color: ${({ theme }) => theme.color.textMuted};
  line-height: 1.5;

  & code {
    font-family: ${({ theme }) => theme.font.mono};
    font-size: 0.9em;
    background: ${({ theme }) => theme.color.bgPanel};
    border: 1px solid ${({ theme }) => theme.color.border};
    padding: 0 4px;
    border-radius: 4px;
    color: ${({ theme }) => theme.color.text};
  }
`
StepDesc.displayName = 'WelcomeScreen.StepDesc'

export const Actions = styled.div`
  margin-top: ${({ theme }) => theme.space[3]};
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[2]};
  justify-content: center;
`
Actions.displayName = 'WelcomeScreen.Actions'

export const Footnote = styled.div`
  margin-top: ${({ theme }) => theme.space[4]};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.textFaint};
  letter-spacing: 0.02em;

  & code {
    background: ${({ theme }) => theme.color.bgElev};
    border: 1px solid ${({ theme }) => theme.color.border};
    padding: 1px 6px;
    border-radius: 4px;
    color: ${({ theme }) => theme.color.text};
  }
`
Footnote.displayName = 'WelcomeScreen.Footnote'
