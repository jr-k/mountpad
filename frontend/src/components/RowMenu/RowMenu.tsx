import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import * as S from './styled'

export interface RowMenuItem {
  /** Stable key for the item. */
  key: string
  /** Visible label. */
  label: React.ReactNode
  /** Optional leading icon (16x16 ReactNode, typically an inline SVG). */
  icon?: React.ReactNode
  /** Visual tone. `danger` paints the item red and tints the hover state. */
  tone?: 'default' | 'danger'
  /** Disable the item (visible but not clickable). */
  disabled?: boolean
  /** Invoked on click. The menu closes automatically right after. */
  onSelect: () => void
}

export type RowMenuEntry = RowMenuItem | { key: string; type: 'divider' } | { key: string; type: 'label'; label: React.ReactNode }

interface RowMenuProps {
  /** Menu entries, in display order. Mix items, dividers and labels freely. */
  items: RowMenuEntry[]
  /** Accessible label for the trigger; defaults to "Open menu". */
  label?: string
  /** Disable the trigger (no menu opens, button is dimmed). */
  disabled?: boolean
  /** Preferred horizontal alignment relative to the trigger; defaults to 'end'. */
  align?: 'start' | 'end'
}

// Kebab icon: three small vertical dots. Sized to fit the 28px trigger.
const KebabIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="12" cy="5" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="19" r="2" />
  </svg>
)

/**
 * RowMenu: a "three-dots" overflow menu used in settings tables to host
 * per-row actions (Edit / Delete / Reset password / ...). It replaces a
 * row of inline buttons with a single icon trigger to keep tables tight
 * and consistent across screens.
 *
 * Behaviour:
 *  - The menu floats in a portal anchored under the trigger, so it never
 *    gets clipped by `overflow: hidden` on the surrounding Section or
 *    horizontally-scrolling TableHost.
 *  - Click outside, Escape, scroll on a parent, or selecting an item all
 *    close the menu.
 *  - Arrow keys move focus between items; Enter / Space activates the
 *    focused item; Tab closes the menu and returns focus to the trigger.
 */
export const RowMenu: React.FC<RowMenuProps> = ({ items, label = 'Open menu', disabled, align = 'end' }) => {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const [focusIdx, setFocusIdx] = useState<number>(-1)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  // The indices in `items` that correspond to interactive entries (not
  // dividers/labels). Used to drive arrow-key navigation without skipping
  // through static rows.
  const actionableIndices = useMemo(() => {
    const out: number[] = []
    items.forEach((it, i) => {
      if (!('type' in it)) out.push(i)
    })
    return out
  }, [items])

  const close = useCallback(() => {
    setOpen(false)
    setCoords(null)
    setFocusIdx(-1)
  }, [])

  // Position the menu under the trigger, flipping above if there's no room
  // below, and clamping horizontally to the viewport so the menu never
  // bleeds off-screen even when triggered on a far-right cell.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return

    const compute = () => {
      const tr = triggerRef.current?.getBoundingClientRect()
      const mb = menuRef.current?.getBoundingClientRect()
      if (!tr || !mb) return

      const gap = 6
      const margin = 8
      const vw = window.innerWidth
      const vh = window.innerHeight

      // Vertical: prefer below, flip above when the menu would overflow.
      let top = tr.bottom + gap
      if (top + mb.height > vh - margin) {
        const flipped = tr.top - mb.height - gap
        if (flipped >= margin) top = flipped
        else top = Math.max(margin, vh - mb.height - margin)
      }

      // Horizontal: align the menu's right (or left) edge to the trigger,
      // then clamp inside the viewport.
      let left = align === 'end' ? tr.right - mb.width : tr.left
      left = Math.max(margin, Math.min(vw - mb.width - margin, left))

      setCoords({ top, left })
    }

    compute()
    // Recompute on viewport changes; close on scroll inside parent containers
    // (capture phase) so a menu does not float around when the user starts
    // scrolling the table or the page.
    const onScroll = () => close()
    window.addEventListener('resize', compute)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, align, close])

  // Click-outside + Escape handlers. We attach in capture phase so a menu
  // sitting in a portal still closes when the user taps the underlying
  // page chrome (the click bubbles up to document either way).
  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (menuRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); triggerRef.current?.focus() }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('touchstart', onPointer, { passive: true })
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('touchstart', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  // Move focus into the menu on open, onto the first actionable item; this
  // makes keyboard-only flows feel snappy (open → ↓ navigates immediately).
  useEffect(() => {
    if (!open) return
    const first = actionableIndices[0]
    if (first != null) {
      setFocusIdx(first)
      // Defer to next frame so the portal has mounted and refs are wired.
      requestAnimationFrame(() => itemRefs.current[first]?.focus())
    }
  }, [open, actionableIndices])

  const moveFocus = useCallback((direction: 1 | -1) => {
    if (actionableIndices.length === 0) return
    const here = actionableIndices.indexOf(focusIdx)
    const next = actionableIndices[(here + direction + actionableIndices.length) % actionableIndices.length]
    setFocusIdx(next)
    itemRefs.current[next]?.focus()
  }, [actionableIndices, focusIdx])

  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(-1) }
    else if (e.key === 'Tab') { e.preventDefault(); close(); triggerRef.current?.focus() }
  }

  const onTriggerKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      setOpen(true)
    }
  }

  return (
    <>
      <S.RowMenuTrigger
        ref={triggerRef}
        type="button"
        $open={open}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={(e) => {
          e.stopPropagation()
          if (disabled) return
          setOpen((v) => !v)
        }}
        onKeyDown={onTriggerKey}
      >
        <KebabIcon />
      </S.RowMenuTrigger>
      {open && typeof document !== 'undefined' && createPortal(
        <S.Menu
          ref={menuRef}
          role="menu"
          tabIndex={-1}
          onKeyDown={onMenuKey}
          style={
            coords
              ? { top: coords.top, left: coords.left, visibility: 'visible' }
              : { visibility: 'hidden', top: 0, left: 0 }
          }
        >
          {items.map((entry, i) => {
            if ('type' in entry && entry.type === 'divider') {
              return <S.Divider key={entry.key} />
            }
            if ('type' in entry && entry.type === 'label') {
              return <S.SectionLabel key={entry.key}>{entry.label}</S.SectionLabel>
            }
            const item = entry as RowMenuItem
            return (
              <S.MenuItem
                key={item.key}
                ref={(el: HTMLButtonElement | null) => { itemRefs.current[i] = el }}
                type="button"
                role="menuitem"
                $tone={item.tone}
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return
                  close()
                  // Defer so the menu unmounts before any modal opens, which
                  // avoids focus-trap races between the closing portal and
                  // any dialog the item triggers.
                  setTimeout(() => item.onSelect(), 0)
                }}
              >
                {item.icon && <span className="icon">{item.icon}</span>}
                <span className="label">{item.label}</span>
              </S.MenuItem>
            )
          })}
        </S.Menu>,
        document.body,
      )}
    </>
  )
}

RowMenu.displayName = 'RowMenu'
