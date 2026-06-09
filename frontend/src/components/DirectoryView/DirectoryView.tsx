import React, { useEffect, useMemo, useRef, useState } from 'react'
import { fsApi, HttpError } from '@/lib/api'
import type { FileEntry } from '@/types/files'
import { iconFor } from '@/components/FileTreeItem'
import { LoadingState } from '@/components/LoadingState'
import { ErrorState } from '@/components/ErrorState'
import { formatMode } from '@/lib/permissions'

import * as S from './styled'

// View mode is persisted across navigations: once a user picks "grid"
// they probably want to keep browsing folders that way. The key is
// namespaced under the same `mountpad:` prefix used by the rest of the
// app (theme toggle, file-explorer details, etc.).
type ViewMode = 'list' | 'grid'
const STORAGE_KEY = 'mountpad:dirview:mode'

const readStoredMode = (): ViewMode => {
  if (typeof window === 'undefined') return 'list'
  const raw = window.localStorage.getItem(STORAGE_KEY)
  return raw === 'grid' ? 'grid' : 'list'
}

interface DirectoryViewProps {
  mountId: number
  /** Empty string means the mount root. */
  path: string
  /** Bumped from the parent to force a re-fetch after mutations. */
  refreshKey?: number
  /** Triggered when the user double-clicks an entry (file or sub-folder). */
  onOpenEntry: (entry: FileEntry) => void
  /**
   * Notified when the *primary* selection changes — i.e. when the user
   * has exactly one entry selected. `null` is emitted both for an empty
   * selection and for a multi-selection, because toolbar actions like
   * Rename and Delete only make sense against a single subject. The
   * multi-selection itself stays inside DirectoryView (visual only).
   */
  onSelectionChange?: (entry: FileEntry | null) => void
  /**
   * Called when the user activates the synthetic ".." parent entry
   * (double-click). The primary breadcrumb lives in the toolbar; this
   * callback is purely for the in-list "go up one level" affordance.
   */
  onNavigatePath?: (folderPath: string) => void
}

// Marquee state captured at mousedown. The starting coordinates are
// recorded in CONTENT space (ScrollBody's scroll offset baked in) so
// the rubber-band stays anchored to the same items even if the user
// scrolls the body while dragging.
type MarqueeMode = 'replace' | 'add' | 'toggle'
interface MarqueeState {
  startX: number
  startY: number
  mode: MarqueeMode
  baseline: Set<string>
}

// formatBytes prints a compact, Windows-Explorer-style size (e.g. "12.3 kB").
// Folders intentionally don't get a size here; recursive sizing would require
// an extra walk and isn't worth the cost for a side-panel listing.
const formatBytes = (n: number): string => {
  if (n < 1024) return `${n} B`
  const units = ['kB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`
}

const formatDate = (iso: string): string => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

const typeOf = (entry: FileEntry): string => {
  if (entry.is_dir) return 'Folder'
  const dot = entry.name.lastIndexOf('.')
  if (dot < 1 || dot === entry.name.length - 1) return 'File'
  return entry.name.slice(dot + 1).toUpperCase()
}

export const DirectoryView: React.FC<DirectoryViewProps> = ({
  mountId, path, refreshKey, onOpenEntry, onSelectionChange, onNavigatePath,
}) => {
  const [entries, setEntries] = useState<FileEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<ViewMode>(readStoredMode)

  // Selection is fully owned by DirectoryView so we can drive a Windows-
  // style multi-selection experience (marquee, Ctrl-toggle, Shift-range)
  // without leaking that complexity into the parent. The parent only
  // hears about it through `onSelectionChange`, which fires with the
  // unique entry when exactly one item is selected, and with `null`
  // otherwise — keeping toolbar actions tied to a single subject.
  //
  // - selectedPaths: committed selection (set of entry paths)
  // - anchorPath:    fixed origin used by Shift-click / Shift-arrow
  //                  range extension. Updated on plain clicks/arrows,
  //                  NOT updated on shift-extend.
  // - cursorPath:    the "current" item that arrow keys move from. Lets
  //                  shift+arrow grow the range without losing where
  //                  the keyboard cursor is.
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set())
  const [anchorPath, setAnchorPath] = useState<string | null>(null)
  const [cursorPath, setCursorPath] = useState<string | null>(null)

  // Marquee state: when non-null, a drag is in progress. `marqueeBox`
  // is the visible rectangle (content-space coords); `marqueePaths` is
  // the live set of paths the rectangle currently overlaps. Refs back
  // both so the global mousemove/mouseup handlers can read the latest
  // values without re-binding listeners on every frame.
  const [marquee, setMarquee] = useState<MarqueeState | null>(null)
  const [marqueeBox, setMarqueeBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const [marqueePaths, setMarqueePaths] = useState<Set<string>>(() => new Set())
  const marqueePathsRef = useRef<Set<string>>(new Set())
  const lastMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  const setView = (m: ViewMode) => {
    setMode(m)
    try { window.localStorage.setItem(STORAGE_KEY, m) } catch { /* quota */ }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fsApi(mountId).list(path)
      .then((res) => { if (!cancelled) setEntries(res.entries ?? []) })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof HttpError && err.status === 403) setError('Permission denied.')
        else setError(String(err))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [mountId, path, refreshKey])

  // Folders bubble to the top, then alphabetical (case-insensitive). Mirrors
  // the FileExplorer tree order so the two panels stay in sync.
  const sorted = useMemo(() => {
    if (!entries) return []
    return [...entries].sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    })
  }, [entries])

  const counts = useMemo(() => {
    if (!entries) return { dirs: 0, files: 0 }
    let dirs = 0, files = 0
    for (const e of entries) { if (e.is_dir) dirs++; else files++ }
    return { dirs, files }
  }, [entries])

  // Parent folder for the synthetic ".." entry; null when we are already
  // at the mount root (no parent to go up to). A path of "foo" yields
  // "" (root), "foo/bar" yields "foo", and so on.
  const parentPath = useMemo<string | null>(() => {
    if (!path) return null
    const idx = path.lastIndexOf('/')
    return idx >= 0 ? path.slice(0, idx) : ''
  }, [path])

  // ScrollBody ref backs the marquee math (item rects are projected
  // back into content-space using its scroll offsets) and the
  // auto-scroll that follows the keyboard cursor as it moves.
  const scrollBodyRef = useRef<HTMLDivElement | null>(null)

  // ── Selection helpers ────────────────────────────────────────────────
  // Each branch corresponds to the three modes the user expects from a
  // native file manager. Anchor moves with plain interactions and stays
  // pinned during shift-extend, which is what makes "click A, shift-
  // click C" select A→C without anchor drift.
  const selectOnly = (p: string) => {
    setSelectedPaths(new Set([p]))
    setAnchorPath(p)
    setCursorPath(p)
  }
  const toggleOne = (p: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
    setAnchorPath(p)
    setCursorPath(p)
  }
  const selectRange = (from: string | null, to: string) => {
    const anchor = from ?? to
    const a = sorted.findIndex((e) => e.path === anchor)
    const b = sorted.findIndex((e) => e.path === to)
    if (a < 0 || b < 0) { selectOnly(to); return }
    const lo = Math.min(a, b), hi = Math.max(a, b)
    const next = new Set<string>()
    for (let i = lo; i <= hi; i++) next.add(sorted[i].path)
    setSelectedPaths(next)
    setCursorPath(to)
  }
  const clearSelection = () => {
    setSelectedPaths(new Set())
    setAnchorPath(null)
    setCursorPath(null)
  }

  // Click dispatcher used by every entry row/tile. Translates the mouse
  // modifiers into the three primitive operations above.
  const handleEntryClick = (entry: FileEntry, ev: React.MouseEvent) => {
    ev.stopPropagation()
    if (ev.shiftKey) selectRange(anchorPath, entry.path)
    else if (ev.metaKey || ev.ctrlKey) toggleOne(entry.path)
    else selectOnly(entry.path)
  }

  // ── Side-effects on the selection set ───────────────────────────────
  // Reset everything when the user navigates to a different listing,
  // and prune stale paths after refreshes (e.g. an entry was deleted
  // out from under the selection). Both effects use functional setters
  // so they stay independent of one another's stored value.
  useEffect(() => {
    setSelectedPaths(new Set())
    setAnchorPath(null)
    setCursorPath(null)
    setMarquee(null)
    setMarqueeBox(null)
    setMarqueePaths(new Set())
    marqueePathsRef.current = new Set()
  }, [mountId, path])

  useEffect(() => {
    setSelectedPaths((prev) => {
      if (prev.size === 0) return prev
      let removed = false
      const valid = new Set<string>()
      for (const p of prev) {
        if (sorted.some((e) => e.path === p)) valid.add(p)
        else removed = true
      }
      return removed ? valid : prev
    })
    setAnchorPath((prev) => (prev && sorted.some((e) => e.path === prev) ? prev : null))
    setCursorPath((prev) => (prev && sorted.some((e) => e.path === prev) ? prev : null))
  }, [sorted])

  // Push the *primary* selection to the parent so the toolbar's
  // Rename/Delete buttons know what to act on. Multi-selection is
  // intentionally collapsed to `null`: bulk operations would be a
  // separate, more deliberate UI affordance.
  useEffect(() => {
    if (!onSelectionChange) return
    if (selectedPaths.size === 1) {
      const only = [...selectedPaths][0]
      const entry = sorted.find((e) => e.path === only) ?? null
      onSelectionChange(entry)
    } else {
      onSelectionChange(null)
    }
  }, [selectedPaths, sorted, onSelectionChange])

  // ── Marquee (rubber-band) selection ─────────────────────────────────
  // Single global mousemove/mouseup pair, attached only while a drag
  // is in progress. We read the live mouse position into refs so the
  // effect itself never needs to re-bind on every move event.
  useEffect(() => {
    if (!marquee || !scrollBodyRef.current) return
    const sb = scrollBodyRef.current

    const onMove = (ev: MouseEvent) => {
      const rect = sb.getBoundingClientRect()
      const curX = ev.clientX - rect.left + sb.scrollLeft
      const curY = ev.clientY - rect.top + sb.scrollTop
      lastMouseRef.current = { x: curX, y: curY }

      const left   = Math.min(marquee.startX, curX)
      const top    = Math.min(marquee.startY, curY)
      const right  = Math.max(marquee.startX, curX)
      const bottom = Math.max(marquee.startY, curY)
      setMarqueeBox({ left, top, width: right - left, height: bottom - top })

      // Hit-test every rendered item. We work in content space (so the
      // test stays valid even after the user scrolls during a drag).
      const items = sb.querySelectorAll<HTMLElement>('[data-path]')
      const hit = new Set<string>()
      for (let i = 0; i < items.length; i++) {
        const el = items[i]
        const ir = el.getBoundingClientRect()
        const itemLeft   = ir.left - rect.left + sb.scrollLeft
        const itemTop    = ir.top  - rect.top  + sb.scrollTop
        const itemRight  = itemLeft + ir.width
        const itemBottom = itemTop  + ir.height
        if (itemLeft < right && itemRight > left && itemTop < bottom && itemBottom > top) {
          const p = el.dataset.path
          if (p) hit.add(p)
        }
      }
      marqueePathsRef.current = hit
      setMarqueePaths(hit)
    }

    const onUp = () => {
      const startX = marquee.startX, startY = marquee.startY
      const { x: endX, y: endY } = lastMouseRef.current
      const dist = Math.hypot(endX - startX, endY - startY)

      if (dist < 4) {
        // Treat sub-threshold drag as a click on empty space.
        // Replace-mode clears; modifier modes preserve the selection
        // (matching how Windows handles an empty Ctrl/Shift click).
        if (marquee.mode === 'replace') clearSelection()
      } else {
        const hit = marqueePathsRef.current
        let final: Set<string>
        if (marquee.mode === 'replace') {
          final = new Set(hit)
        } else if (marquee.mode === 'add') {
          final = new Set(marquee.baseline)
          for (const p of hit) final.add(p)
        } else { // toggle
          final = new Set(marquee.baseline)
          for (const p of hit) { if (final.has(p)) final.delete(p); else final.add(p) }
        }
        setSelectedPaths(final)
        // Reposition the anchor at the first item now selected so a
        // follow-up Shift-click extends from a sensible origin.
        const firstSelected = sorted.find((e) => final.has(e.path))
        setAnchorPath(firstSelected?.path ?? null)
        setCursorPath(firstSelected?.path ?? null)
      }

      setMarquee(null)
      setMarqueeBox(null)
      setMarqueePaths(new Set())
      marqueePathsRef.current = new Set()
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    // `sorted` lives in the dep array so a listing refresh that lands
    // mid-drag re-attaches handlers with the up-to-date entries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marquee, sorted])

  // Start a marquee on empty-space mousedown. Items/parent rows already
  // stopPropagation on their own mousedown, so by the time we hit this
  // handler we're guaranteed to be on truly empty surface.
  const handleScrollBodyMouseDown = (ev: React.MouseEvent<HTMLDivElement>) => {
    if (ev.button !== 0) return
    const target = ev.target as HTMLElement | null
    if (target && target.closest('[data-path]')) return
    const sb = scrollBodyRef.current
    if (!sb) return
    const rect = sb.getBoundingClientRect()
    const startX = ev.clientX - rect.left + sb.scrollLeft
    const startY = ev.clientY - rect.top  + sb.scrollTop
    lastMouseRef.current = { x: startX, y: startY }
    const m: MarqueeMode = (ev.metaKey || ev.ctrlKey) ? 'toggle' : ev.shiftKey ? 'add' : 'replace'
    setMarquee({ startX, startY, mode: m, baseline: new Set(selectedPaths) })
    setMarqueeBox({ left: startX, top: startY, width: 0, height: 0 })
    setMarqueePaths(new Set())
    marqueePathsRef.current = new Set()
  }

  // Live "what would be selected if the user released now" set. Used
  // to drive every row/tile's `$active` highlight so the user sees the
  // marquee's effect in real time, including additive/toggle previews.
  const viewSelection = useMemo<Set<string>>(() => {
    if (!marquee) return selectedPaths
    if (marquee.mode === 'replace') return marqueePaths
    if (marquee.mode === 'add') {
      const u = new Set(marquee.baseline)
      for (const p of marqueePaths) u.add(p)
      return u
    }
    const x = new Set(marquee.baseline)
    for (const p of marqueePaths) { if (x.has(p)) x.delete(p); else x.add(p) }
    return x
  }, [selectedPaths, marquee, marqueePaths])

  // ── Keyboard navigation ─────────────────────────────────────────────
  // Plain arrows: move the cursor and replace the selection. Shift +
  // arrows: extend the range from the fixed anchor to the new cursor
  // position. Activates only when the user already has either an
  // anchor or a selection, so we never hijack arrows globally.
  useEffect(() => {
    if (sorted.length === 0) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return
      const key = ev.key
      if (key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'ArrowLeft' && key !== 'ArrowRight') return
      const target = ev.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return
      }

      // Resolve where the cursor currently sits. Prefer the explicit
      // keyboard cursor; fall back to the anchor; finally to any item
      // in the selection. If none of those exist, do nothing.
      let curIdx = cursorPath ? sorted.findIndex((e) => e.path === cursorPath) : -1
      if (curIdx < 0 && anchorPath) curIdx = sorted.findIndex((e) => e.path === anchorPath)
      if (curIdx < 0 && selectedPaths.size > 0) {
        curIdx = sorted.findIndex((e) => selectedPaths.has(e.path))
      }
      if (curIdx < 0) return

      let nextIdx = curIdx
      if (mode === 'list') {
        if (key === 'ArrowUp')   nextIdx = Math.max(0, curIdx - 1)
        if (key === 'ArrowDown') nextIdx = Math.min(sorted.length - 1, curIdx + 1)
      } else {
        const gridEl = scrollBodyRef.current?.querySelector<HTMLElement>('[data-grid="1"]')
        const cols = gridEl
          ? Math.max(1, getComputedStyle(gridEl).gridTemplateColumns.split(' ').filter(Boolean).length)
          : 1
        if (key === 'ArrowLeft')  nextIdx = Math.max(0, curIdx - 1)
        if (key === 'ArrowRight') nextIdx = Math.min(sorted.length - 1, curIdx + 1)
        if (key === 'ArrowUp') {
          const candidate = curIdx - cols
          nextIdx = candidate < 0 ? curIdx : candidate
        }
        if (key === 'ArrowDown') {
          const candidate = curIdx + cols
          nextIdx = candidate >= sorted.length ? curIdx : candidate
        }
      }

      ev.preventDefault()
      if (nextIdx === curIdx) return
      const nextPath = sorted[nextIdx].path

      if (ev.shiftKey) {
        // Range-extend from the anchor (or seed the anchor with the
        // current position if none was set yet).
        const anchor = anchorPath ?? sorted[curIdx].path
        if (!anchorPath) setAnchorPath(anchor)
        const a = sorted.findIndex((e) => e.path === anchor)
        const lo = Math.min(a, nextIdx), hi = Math.max(a, nextIdx)
        const next = new Set<string>()
        for (let i = lo; i <= hi; i++) next.add(sorted[i].path)
        setSelectedPaths(next)
        setCursorPath(nextPath)
      } else {
        selectOnly(nextPath)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorPath, anchorPath, selectedPaths, sorted, mode])

  // Keep the cursor item in view as the selection moves through arrow
  // keys. `block: 'nearest'` mirrors native file managers: no scroll
  // when the row is already on screen, smallest scroll otherwise.
  useEffect(() => {
    if (!cursorPath || !scrollBodyRef.current) return
    const el = scrollBodyRef.current.querySelector<HTMLElement>(
      `[data-path="${CSS.escape(cursorPath)}"]`,
    )
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [cursorPath])

  return (
    <S.DirectoryViewRoot>
      <S.Header>
        {/* The path itself lives in the toolbar's breadcrumb so we do
            not duplicate it here; the header keeps a discreet "Folder"
            label on the left for visual balance, then the view toggle
            and the entry counts. */}
        <S.HeaderLabel>Folder</S.HeaderLabel>
        <S.HeaderActions>
          <S.ViewToggle role="tablist" aria-label="View mode">
            <S.ViewToggleButton
              type="button"
              role="tab"
              aria-selected={mode === 'list'}
              $active={mode === 'list'}
              onClick={() => setView('list')}
              title="List view"
              aria-label="List view"
            >
              <ListIcon />
            </S.ViewToggleButton>
            <S.ViewToggleButton
              type="button"
              role="tab"
              aria-selected={mode === 'grid'}
              $active={mode === 'grid'}
              onClick={() => setView('grid')}
              title="Grid view"
              aria-label="Grid view"
            >
              <GridIcon />
            </S.ViewToggleButton>
          </S.ViewToggle>
        </S.HeaderActions>
        {entries && (
          <S.HeaderMeta>
            {counts.dirs} folder{counts.dirs === 1 ? '' : 's'} &middot;{' '}
            {counts.files} file{counts.files === 1 ? '' : 's'}
          </S.HeaderMeta>
        )}
      </S.Header>

      {/* Mousedown on empty space starts a marquee. Items/parent rows
          stopPropagation on their own mousedown, so by the time the
          handler runs we're guaranteed to be on truly empty surface.
          A sub-threshold drag is treated as a plain click → clears
          the selection (in replace mode), matching the legacy
          behaviour. */}
      <S.ScrollBody ref={scrollBodyRef} onMouseDown={handleScrollBodyMouseDown}>
        {loading && !entries
          ? <LoadingState label="Loading…" />
          : error
            ? <ErrorState title="Failed to list" description={error} />
            : mode === 'grid'
              ? renderGrid({ sorted, selectedSet: viewSelection, onClickEntry: handleEntryClick, onClickParent: clearSelection, onOpenEntry, parentPath, onNavigatePath })
              : renderList({ sorted, selectedSet: viewSelection, onClickEntry: handleEntryClick, onClickParent: clearSelection, onOpenEntry, parentPath, onNavigatePath })}
        {marqueeBox && (
          <S.MarqueeBox
            style={{
              left: marqueeBox.left,
              top: marqueeBox.top,
              width: marqueeBox.width,
              height: marqueeBox.height,
            }}
          />
        )}
      </S.ScrollBody>
    </S.DirectoryViewRoot>
  )
}

// ── Layout renderers ────────────────────────────────────────────────────
// Split out as plain functions (not components) so they share the parent's
// state without prop-drilling and stay below the main render block for
// readability.

interface LayoutProps {
  sorted: FileEntry[]
  /**
   * Set of paths currently rendered as highlighted. During a marquee
   * drag this is the *preview* set (committed selection combined with
   * the marquee's overlap), so the user sees the outcome before they
   * release the mouse.
   */
  selectedSet: Set<string>
  /**
   * Click handler for any rendered entry. The full MouseEvent is
   * forwarded so the dispatcher can read the Shift / Ctrl / Meta
   * modifiers that drive range and toggle behaviours.
   */
  onClickEntry: (entry: FileEntry, ev: React.MouseEvent) => void
  /**
   * Click handler for the synthetic ".." parent row. Clears the
   * selection without starting a marquee or activating any item.
   */
  onClickParent: () => void
  /** Double-click / Enter handler: open the file or enter the folder. */
  onOpenEntry: (entry: FileEntry) => void
  /**
   * Parent folder path. When non-null the list/grid prepends a ".."
   * synthetic entry that navigates up by calling `onNavigatePath`.
   * Null means we are already at the mount root and there is no parent
   * to go to.
   */
  parentPath: string | null
  onNavigatePath?: (folderPath: string) => void
}

const renderList = ({
  sorted, selectedSet, onClickEntry, onClickParent, onOpenEntry, parentPath, onNavigatePath,
}: LayoutProps): React.ReactElement => (
  <S.Table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Type</th>
        <th>Size</th>
        <th>Modified</th>
        <th>Mode</th>
      </tr>
    </thead>
    <tbody>
      {/* Virtual ".." row: rendered at the top whenever a parent exists,
          so the user can pop up one level instead of going through the
          breadcrumb. Single-click clears the selection (the ".." entry
          isn't itself a valid action target), double-click navigates
          up. */}
      {parentPath !== null && onNavigatePath && (
        <S.Row
          key="__parent__"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onClickParent() }}
          onDoubleClick={() => onNavigatePath(parentPath)}
          title="Parent folder"
        >
          <td className="name">
            <S.Icon aria-hidden>{'\u21B0'}</S.Icon>
            ..
          </td>
          <td className="meta">Parent folder</td>
          <td className="meta">-</td>
          <td className="meta">-</td>
          <td className="meta">-</td>
        </S.Row>
      )}
      {sorted.length === 0 && parentPath === null ? (
        <tr>
          <S.EmptyCell colSpan={5}>This folder is empty.</S.EmptyCell>
        </tr>
      ) : sorted.map((e) => (
        <S.Row
          key={e.path}
          data-path={e.path}
          $active={selectedSet.has(e.path)}
          onMouseDown={(ev) => ev.stopPropagation()}
          onClick={(ev) => onClickEntry(e, ev)}
          onDoubleClick={() => onOpenEntry(e)}
          title={e.path}
        >
          <td className="name">
            <S.Icon aria-hidden>{iconFor(e, false)}</S.Icon>
            {e.name}
          </td>
          <td className="meta">{typeOf(e)}</td>
          <td className="meta">{e.is_dir ? '-' : formatBytes(e.size)}</td>
          <td className="meta">{formatDate(e.modified_at)}</td>
          <td className="meta">{formatMode(e.mode)}</td>
        </S.Row>
      ))}
    </tbody>
  </S.Table>
)

// Grid tiles are real <button>s, which natively turn Enter/Space into a
// `click` event. We want Enter to ACTIVATE (open) rather than just SELECT,
// so we intercept the keydown, suppress the default click, and call
// onOpenEntry directly. Mouse interaction is unaffected.
const handleTileKeyDown = (
  e: React.KeyboardEvent<HTMLButtonElement>,
  onActivate: () => void,
) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    onActivate()
  }
}

const renderGrid = ({
  sorted, selectedSet, onClickEntry, onClickParent, onOpenEntry, parentPath, onNavigatePath,
}: LayoutProps): React.ReactElement => (
  // data-grid marks this element as the live CSS grid the parent
  // queries via getComputedStyle to count columns for 2D arrow-key
  // navigation. Keep it in sync with the selector in DirectoryView.
  <S.Grid data-grid="1">
    {parentPath !== null && onNavigatePath && (
      <S.Tile
        key="__parent__"
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onClickParent() }}
        onDoubleClick={() => onNavigatePath(parentPath)}
        onKeyDown={(e) => handleTileKeyDown(e, () => onNavigatePath(parentPath))}
        title="Parent folder"
      >
        <S.TileIcon aria-hidden>{'\u21B0'}</S.TileIcon>
        <S.TileName>..</S.TileName>
        <S.TileMeta>Parent folder</S.TileMeta>
      </S.Tile>
    )}
    {sorted.length === 0 && parentPath === null ? (
      <S.EmptyTile>This folder is empty.</S.EmptyTile>
    ) : sorted.map((e) => (
      <S.Tile
        key={e.path}
        data-path={e.path}
        type="button"
        $active={selectedSet.has(e.path)}
        onMouseDown={(ev) => ev.stopPropagation()}
        onClick={(ev) => onClickEntry(e, ev)}
        onDoubleClick={() => onOpenEntry(e)}
        onKeyDown={(ev) => handleTileKeyDown(ev, () => onOpenEntry(e))}
        title={e.path}
      >
        <S.TileIcon aria-hidden>{iconFor(e, false)}</S.TileIcon>
        <S.TileName>{e.name}</S.TileName>
        <S.TileMeta>{e.is_dir ? typeOf(e) : formatBytes(e.size)}</S.TileMeta>
      </S.Tile>
    ))}
  </S.Grid>
)

// ── SVG icons ───────────────────────────────────────────────────────────
// Inline so the component stays self-contained; both are ~16x16 and use
// currentColor so the active/inactive states tint themselves via the
// surrounding button's `color`.

const ListIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M5 3h9M5 8h9M5 13h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="2.5" cy="3"  r="0.9" fill="currentColor" />
    <circle cx="2.5" cy="8"  r="0.9" fill="currentColor" />
    <circle cx="2.5" cy="13" r="0.9" fill="currentColor" />
  </svg>
)

const GridIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
    <rect x="2"  y="2"  width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="9"  y="2"  width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="2"  y="9"  width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="9"  y="9"  width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)
