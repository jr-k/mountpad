import styled, { keyframes, css } from 'styled-components'
import type { TooltipPlacement } from './Tooltip'

const fadeIn = keyframes`
  from { opacity: 0; transform: scale(0.97); }
  to   { opacity: 1; transform: scale(1); }
`

// `display: contents` lets the span participate in the React event system
// (receiving onMouseEnter/Leave bubbling from descendants) without
// introducing any box of its own; the children remain laid out exactly
// as they would be inline.
export const TooltipTrigger = styled.span`
  display: contents;
`
TooltipTrigger.displayName = 'Tooltip.Trigger'

const arrowOffset = (p: TooltipPlacement) => {
  switch (p) {
    case 'top':    return css`bottom: -4px; left: 50%; transform: translateX(-50%) rotate(45deg);`
    case 'bottom': return css`top: -4px;    left: 50%; transform: translateX(-50%) rotate(45deg);`
    case 'left':   return css`right: -4px;  top: 50%;  transform: translateY(-50%) rotate(45deg);`
    case 'right':  return css`left: -4px;   top: 50%;  transform: translateY(-50%) rotate(45deg);`
  }
}

export const Bubble = styled.div<{ $placement: TooltipPlacement; $maxWidth?: number }>`
  position: fixed;
  z-index: 1000;
  max-width: ${({ $maxWidth }) => `${$maxWidth ?? 280}px`};
  padding: 8px 12px;
  background: ${({ theme }) => theme.color.bgPanel};
  border: 1px solid ${({ theme }) => theme.color.borderStrong};
  border-radius: ${({ theme }) => theme.radius.md};
  color: ${({ theme }) => theme.color.text};
  font-size: ${({ theme }) => theme.font.size.sm};
  line-height: 1.5;
  box-shadow: ${({ theme }) => theme.shadow.lg};
  pointer-events: none;
  animation: ${fadeIn} 120ms ease-out;
  word-wrap: break-word;

  /* A tiny rotated square stuck on the side of the bubble that's facing
     the trigger. Border is drawn around it from the parent so it visually
     merges with the bubble's outline. */
  &::before {
    content: '';
    position: absolute;
    width: 8px;
    height: 8px;
    background: ${({ theme }) => theme.color.bgPanel};
    border: 1px solid ${({ theme }) => theme.color.borderStrong};
    /* Hide the two edges of the square that face *into* the bubble so
       only the outer point is visible. */
    ${({ $placement }) => {
      switch ($placement) {
        case 'top':    return css`border-top: 0; border-left: 0;`
        case 'bottom': return css`border-bottom: 0; border-right: 0;`
        case 'left':   return css`border-left: 0; border-bottom: 0;`
        case 'right':  return css`border-right: 0; border-top: 0;`
      }
    }}
    ${({ $placement }) => arrowOffset($placement)}
  }
`
Bubble.displayName = 'Tooltip.Bubble'

export const Title = styled.div`
  font-weight: 600;
  font-size: ${({ theme }) => theme.font.size.sm};
  margin-bottom: 4px;
  color: ${({ theme }) => theme.color.text};
`
Title.displayName = 'Tooltip.Title'

export const Code = styled.code`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  background: ${({ theme }) => theme.color.bgElev};
  border: 1px solid ${({ theme }) => theme.color.border};
  padding: 1px 5px;
  border-radius: 4px;
  color: ${({ theme }) => theme.color.text};
`
Code.displayName = 'Tooltip.Code'

export const Muted = styled.span`
  color: ${({ theme }) => theme.color.textMuted};
`
Muted.displayName = 'Tooltip.Muted'
