import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import * as S from './styled'

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

interface TooltipProps {
  /** Tooltip body. Pass any ReactNode: strings, rich JSX, formatted blocks. */
  content: React.ReactNode
  /** Preferred placement. Auto-flips when there's no room on that side. */
  placement?: TooltipPlacement
  /** Open delay in ms. Set to 0 for instant tooltips. */
  delay?: number
  /** Optional max-width override for the bubble. Defaults to 280px. */
  maxWidth?: number
  /** The trigger element. The tooltip listens to mouse + focus events on it. */
  children: React.ReactNode
}

/**
 * Tooltip: a tiny, dependency-free hover/focus popover.
 *
 *   <Tooltip content="Description here" placement="right">
 *     <Button>Hover me</Button>
 *   </Tooltip>
 *
 * Implementation notes:
 * - The trigger is wrapped in a `display: contents` span so the tooltip
 *   participates in event handling without affecting layout.
 * - The bubble is rendered into `document.body` via a portal so it can
 *   escape `overflow: hidden` ancestors (sidebars, scroll containers).
 * - Position is recomputed each open + on window resize/scroll, with a
 *   simple flip algorithm that tries the requested side first and falls
 *   back to the opposite side if it overflows the viewport.
 */
export const Tooltip: React.FC<TooltipProps> = ({
  content,
  placement = 'top',
  delay = 300,
  maxWidth,
  children,
}) => {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number; placement: TooltipPlacement } | null>(null)

  const triggerRef = useRef<HTMLSpanElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const timer = useRef<number | null>(null)

  const show = () => {
    if (timer.current != null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(true), delay)
  }
  const hide = () => {
    if (timer.current != null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    setOpen(false)
    setCoords(null)
  }

  useEffect(() => () => { if (timer.current != null) window.clearTimeout(timer.current) }, [])

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !bubbleRef.current) return

    const compute = () => {
      const tr = triggerRef.current?.getBoundingClientRect()
      const bb = bubbleRef.current?.getBoundingClientRect()
      if (!tr || !bb) return

      const gap = 8
      const margin = 8

      const positions: Record<TooltipPlacement, { top: number; left: number }> = {
        top:    { top: tr.top - bb.height - gap, left: tr.left + (tr.width - bb.width) / 2 },
        bottom: { top: tr.bottom + gap,            left: tr.left + (tr.width - bb.width) / 2 },
        left:   { top: tr.top + (tr.height - bb.height) / 2, left: tr.left - bb.width - gap },
        right:  { top: tr.top + (tr.height - bb.height) / 2, left: tr.right + gap },
      }

      // Try the requested side, then the opposite, then the perpendicular pair.
      const order: TooltipPlacement[] = {
        top:    ['top', 'bottom', 'right', 'left'],
        bottom: ['bottom', 'top', 'right', 'left'],
        left:   ['left', 'right', 'top', 'bottom'],
        right:  ['right', 'left', 'top', 'bottom'],
      }[placement] as TooltipPlacement[]

      const vw = window.innerWidth
      const vh = window.innerHeight
      let chosen: { top: number; left: number; placement: TooltipPlacement } | null = null
      for (const p of order) {
        const c = positions[p]
        const fits =
          c.top >= margin &&
          c.left >= margin &&
          c.top + bb.height <= vh - margin &&
          c.left + bb.width <= vw - margin
        if (fits) { chosen = { ...c, placement: p }; break }
      }
      if (!chosen) {
        // Nothing fits; clamp the requested placement to the viewport.
        const c = positions[placement]
        chosen = {
          top: Math.max(margin, Math.min(vh - bb.height - margin, c.top)),
          left: Math.max(margin, Math.min(vw - bb.width - margin, c.left)),
          placement,
        }
      }
      setCoords(chosen)
    }

    compute()
    window.addEventListener('scroll', compute, true)
    window.addEventListener('resize', compute)
    return () => {
      window.removeEventListener('scroll', compute, true)
      window.removeEventListener('resize', compute)
    }
  }, [open, placement, content])

  return (
    <>
      <S.TooltipTrigger
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </S.TooltipTrigger>
      {open && typeof document !== 'undefined' && createPortal(
        <S.Bubble
          ref={bubbleRef}
          role="tooltip"
          $placement={coords?.placement ?? placement}
          $maxWidth={maxWidth}
          style={
            coords
              ? { top: coords.top, left: coords.left, visibility: 'visible' }
              : { visibility: 'hidden', top: 0, left: 0 }
          }
        >
          {content}
        </S.Bubble>,
        document.body,
      )}
    </>
  )
}

Tooltip.displayName = 'Tooltip'
