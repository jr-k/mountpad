import { useEffect, useRef, useState } from 'react'

interface UseHorizontalResizeOptions {
  /** Width to fall back to when nothing is stored / on first render. */
  initial: number
  /** Hard floor: the user can't drag the pane narrower than this. */
  min: number
  /** Hard ceiling: drag past it and the pane just stops growing. */
  max: number
  /**
   * Which edge of the pane the handle sits on. `right` means a drag to
   * the right grows the pane (e.g. the FileExplorer's right edge);
   * `left` means a drag to the right *shrinks* the pane (e.g. the
   * FileDetailsPanel's left edge, where the pane sits on the trailing
   * side of the layout).
   */
  side: 'left' | 'right'
  /** Persist the width under this localStorage key (skipped if omitted). */
  storageKey?: string
}

interface UseHorizontalResizeReturn {
  /** Current clamped pane width in pixels. */
  width: number
  /** True while the user is actively dragging the handle. */
  resizing: boolean
  /** Spread these onto the handle element. */
  handleProps: {
    onPointerDown: (ev: React.PointerEvent<HTMLElement>) => void
    onPointerMove: (ev: React.PointerEvent<HTMLElement>) => void
    onPointerUp: (ev: React.PointerEvent<HTMLElement>) => void
    onDoubleClick: () => void
  }
}

/**
 * Pointer-driven horizontal resize, used by the workspace's two
 * resizable panes (file explorer on the left, file details on the
 * right). The hook uses `setPointerCapture` so move/up events keep
 * flowing to the handle even if the cursor crosses out of it during
 * the drag - no global window listeners needed, no lost mouseup.
 *
 * A double-click on the handle resets to `initial`, matching the
 * VS Code convention. The new width persists synchronously on every
 * move; that's a few hundred localStorage writes during a single
 * drag, which is well within budget.
 */
export function useHorizontalResize(opts: UseHorizontalResizeOptions): UseHorizontalResizeReturn {
  const { initial, min, max, side, storageKey } = opts

  const clamp = (n: number): number => Math.max(min, Math.min(max, n))

  const [width, setWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return initial
    if (!storageKey) return initial
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return initial
    const parsed = parseInt(raw, 10)
    if (!Number.isFinite(parsed)) return initial
    return clamp(parsed)
  })
  const [resizing, setResizing] = useState(false)
  const startRef = useRef({ x: 0, w: 0 })

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return
    window.localStorage.setItem(storageKey, String(width))
  }, [storageKey, width])

  // While dragging we want the resize cursor (and a frozen selection)
  // across the entire document - otherwise the cursor flickers back
  // to the default whenever it strays off the 6px handle, and text
  // inside the editor would highlight as the user drags through it.
  useEffect(() => {
    if (!resizing || typeof document === 'undefined') return
    const prevCursor = document.body.style.cursor
    const prevUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevUserSelect
    }
  }, [resizing])

  const onPointerDown = (ev: React.PointerEvent<HTMLElement>): void => {
    // Capture the pointer so subsequent move/up events fire on the
    // handle regardless of where the cursor wanders. preventDefault
    // suppresses the native drag-text behaviour the browser would
    // start when the cursor crosses a text element.
    ev.preventDefault()
    ev.currentTarget.setPointerCapture(ev.pointerId)
    startRef.current = { x: ev.clientX, w: width }
    setResizing(true)
  }

  const onPointerMove = (ev: React.PointerEvent<HTMLElement>): void => {
    if (!resizing) return
    const dx = ev.clientX - startRef.current.x
    const next = side === 'right'
      ? startRef.current.w + dx
      : startRef.current.w - dx
    setWidth(clamp(next))
  }

  const onPointerUp = (ev: React.PointerEvent<HTMLElement>): void => {
    if (!resizing) return
    try { ev.currentTarget.releasePointerCapture(ev.pointerId) } catch { /* already released */ }
    setResizing(false)
  }

  const onDoubleClick = (): void => {
    setWidth(clamp(initial))
  }

  return { width, resizing, handleProps: { onPointerDown, onPointerMove, onPointerUp, onDoubleClick } }
}
