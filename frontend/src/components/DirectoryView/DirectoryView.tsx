import React, { useEffect, useMemo, useRef, useState } from 'react'
import { api, fsApi, HttpError } from '@/lib/api'
import type { FileEntry } from '@/types/files'
import { iconFor } from '@/components/FileTreeItem'
import { LoadingState } from '@/components/LoadingState'
import { ErrorState } from '@/components/ErrorState'
import { formatMode } from '@/lib/permissions'
import {
  MOVE_MIME, setActiveDrag, clearActiveDrag,
  isValidDropTarget, performDropMove,
} from '@/lib/dnd'
import { isAnyModalOpen } from '@/lib/modalStack'
import { useShowHidden, isHiddenEntry } from '@/hooks/useShowHidden'

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

// ── Sort + column-visibility model ──────────────────────────────────────
// The dropdown in the header lets the user pick how the listing is
// ordered (Sort by …) and the order direction (asc / desc). Each
// preference is persisted independently so a user who picked
// "modified · desc" keeps that for every folder they navigate into.
//
// Owner/Group are listed even though they don't render in the default
// columns - they're still meaningful sort keys.
//
// Creation date is intentionally absent: the listing API only exposes
// the modification time (`ModifiedAt`), so a "created" sort would
// require new backend plumbing (statx birth time on Linux, Btim on
// macOS) before it can be surfaced.
export type SortKey =
  | 'name' | 'type' | 'size' | 'modified' | 'owner' | 'group'
export type SortDir = 'asc' | 'desc'

const SORT_KEYS_STORAGE = 'mountpad:dirview:sortKey'
const SORT_DIR_STORAGE  = 'mountpad:dirview:sortDir'
const COLS_STORAGE      = 'mountpad:dirview:columns'

const SORT_LABELS: Record<SortKey, string> = {
  name:     'Name',
  type:     'Type',
  size:     'Size',
  modified: 'Date modified',
  owner:    'Owner',
  group:    'Group',
}

const isSortKey = (s: string): s is SortKey =>
  s === 'name' || s === 'type' || s === 'size' || s === 'modified' || s === 'owner' || s === 'group'

const readStoredSortKey = (): SortKey => {
  if (typeof window === 'undefined') return 'name'
  const raw = window.localStorage.getItem(SORT_KEYS_STORAGE)
  return raw && isSortKey(raw) ? raw : 'name'
}
const readStoredSortDir = (): SortDir => {
  if (typeof window === 'undefined') return 'asc'
  return window.localStorage.getItem(SORT_DIR_STORAGE) === 'desc' ? 'desc' : 'asc'
}

// Columns visible in the list-view header. `name` is special: it
// always renders (it's the entry's identity) and never appears as a
// togglable option in the Columns menu.
export type ColumnKey = 'type' | 'size' | 'modified' | 'mode' | 'owner' | 'group'
const COLUMN_LABELS: Record<ColumnKey, string> = {
  type:     'Type',
  size:     'Size',
  modified: 'Date modified',
  mode:     'Mode',
  owner:    'Owner',
  group:    'Group',
}
const DEFAULT_COLUMNS: ColumnKey[] = ['type', 'size', 'modified', 'mode']

const isColumnKey = (s: string): s is ColumnKey =>
  s === 'type' || s === 'size' || s === 'modified' || s === 'mode' || s === 'owner' || s === 'group'

const readStoredColumns = (): Set<ColumnKey> => {
  if (typeof window === 'undefined') return new Set(DEFAULT_COLUMNS)
  try {
    const raw = window.localStorage.getItem(COLS_STORAGE)
    if (!raw) return new Set(DEFAULT_COLUMNS)
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set(DEFAULT_COLUMNS)
    const out = new Set<ColumnKey>()
    for (const v of parsed) if (typeof v === 'string' && isColumnKey(v)) out.add(v)
    return out
  } catch {
    return new Set(DEFAULT_COLUMNS)
  }
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
   * Notified when the *primary* selection changes - i.e. when the user
   * has exactly one entry selected. `null` is emitted both for an empty
   * selection and for a multi-selection, so single-target actions like
   * Rename only enable themselves against a single subject.
   */
  onSelectionChange?: (entry: FileEntry | null) => void
  /**
   * Notified with the full selection on every change. Always called in
   * tandem with `onSelectionChange` and gives the parent everything it
   * needs to drive multi-aware actions (e.g. "Delete N items").
   */
  onSelectedEntriesChange?: (entries: FileEntry[]) => void
  /**
   * Called when the user activates the synthetic ".." parent entry
   * (double-click). The primary breadcrumb lives in the toolbar; this
   * callback is purely for the in-list "go up one level" affordance.
   */
  onNavigatePath?: (folderPath: string) => void
  /**
   * Fired after a successful drag-and-drop move. The parent uses this
   * to bump the shared refresh key so both the directory listing AND
   * the FileExplorer sidebar tree re-fetch and reflect the new layout.
   */
  onAfterMutation?: () => void
  /**
   * Path the parent wants selected + cursored as soon as it appears
   * in the listing. Set after a mutation that changes an entry's
   * path (e.g. rename) so the user keeps visual continuity on the
   * row they just edited instead of losing the highlight to the
   * refresh-driven prune. The component fires
   * `onPendingFocusConsumed` once it applies the focus so the
   * parent can drop the value and stop forcing it on subsequent
   * unrelated refreshes.
   */
  pendingFocus?: string | null
  onPendingFocusConsumed?: () => void
  /**
   * Notified whenever the displayed entry count changes. `visible`
   * is the number of rows currently rendered (after the show-hidden
   * filter), `total` is the raw entry count from the backend. The
   * workspace pipes this into the bottom status bar so the user
   * gets an ambient "42 items" / "42 of 48 items" readout without
   * the component having to reach into DirectoryView's internals.
   */
  onCountsChange?: (counts: { visible: number; total: number }) => void
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
  mountId, path, refreshKey, onOpenEntry, onSelectionChange, onSelectedEntriesChange, onNavigatePath,
  onAfterMutation, pendingFocus, onPendingFocusConsumed, onCountsChange,
}) => {
  const [entries, setEntries] = useState<FileEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<ViewMode>(readStoredMode)

  // Sort + visible-columns preferences (persisted, see helpers above).
  // Owner/Group are valid sort keys regardless of whether their column
  // is on - sorting "by owner" still makes sense in grid view, for
  // instance, where columns don't render at all.
  const [sortKey, setSortKey] = useState<SortKey>(readStoredSortKey)
  const [sortDir, setSortDir] = useState<SortDir>(readStoredSortDir)
  const [visibleCols, setVisibleCols] = useState<Set<ColumnKey>>(readStoredColumns)
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [colsMenuOpen, setColsMenuOpen] = useState(false)
  const sortMenuRef = useRef<HTMLDivElement | null>(null)
  const colsMenuRef = useRef<HTMLDivElement | null>(null)

  // App-wide "show hidden files" preference, shared with FileExplorer
  // via a tiny module-level pub/sub (see hooks/useShowHidden). Flipping
  // it here also flips the sidebar in the same tick - no parent
  // plumbing needed.
  const { showHidden, toggleShowHidden } = useShowHidden()

  // Lazy {id → name} directories for the Owner/Group columns. We hit
  // /api/directory/* (member-accessible) instead of /api/users (admin)
  // so regular users still get readable labels. Mirrors the strategy
  // used by FileExplorer's details mode.
  const [userById, setUserById] = useState<Record<number, string>>({})
  const [groupById, setGroupById] = useState<Record<number, string>>({})
  const [directoryLoaded, setDirectoryLoaded] = useState(false)

  const setView = (m: ViewMode) => {
    setMode(m)
    try { window.localStorage.setItem(STORAGE_KEY, m) } catch { /* quota */ }
  }
  const setSortKeyAndPersist = (k: SortKey) => {
    setSortKey(k)
    try { window.localStorage.setItem(SORT_KEYS_STORAGE, k) } catch { /* quota */ }
  }
  const setSortDirAndPersist = (d: SortDir) => {
    setSortDir(d)
    try { window.localStorage.setItem(SORT_DIR_STORAGE, d) } catch { /* quota */ }
  }
  const toggleColumn = (c: ColumnKey) => {
    setVisibleCols((prev) => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c); else next.add(c)
      try { window.localStorage.setItem(COLS_STORAGE, JSON.stringify(Array.from(next))) } catch { /* quota */ }
      return next
    })
  }

  // Selection is fully owned by DirectoryView so we can drive a Windows-
  // style multi-selection experience (marquee, Ctrl-toggle, Shift-range)
  // without leaking that complexity into the parent. The parent only
  // hears about it through `onSelectionChange`, which fires with the
  // unique entry when exactly one item is selected, and with `null`
  // otherwise - keeping toolbar actions tied to a single subject.
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

  // Continuously-tracked pointer position (content-space coords) used
  // for two unrelated things at once:
  // - Marquee: onMove writes here, onUp reads it for the final box.
  // - Keyboard nav: when the user presses an arrow with no current
  //   cursor, we drop the cursor onto the entry nearest the pointer
  //   so they can start navigating from wherever their mouse sits,
  //   not from the start of the list.
  // `inside` flips with mouseenter/mouseleave on the ScrollBody, so
  // the keyboard heuristic can degrade to "select the first item" when
  // the pointer left the panel entirely.
  const pointerRef = useRef<{ x: number; y: number; inside: boolean }>({ x: 0, y: 0, inside: false })

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

  // Folders always bubble to the top regardless of sort key - this is
  // the universal file-manager convention, and putting a 200-folder
  // listing under the size-sorted files would be unreadable. Within
  // each group (dirs / files) we apply the selected sort key + dir.
  // Name is the stable tie-breaker so two items that share a key
  // (same modified time, same size, etc.) keep a deterministic order.
  const sorted = useMemo(() => {
    if (!entries) return []
    const nameCmp = (a: FileEntry, b: FileEntry) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    const keyCmp = (a: FileEntry, b: FileEntry): number => {
      switch (sortKey) {
        case 'name': return nameCmp(a, b)
        case 'type': {
          const ta = typeOf(a).toLowerCase(), tb = typeOf(b).toLowerCase()
          if (ta !== tb) return ta.localeCompare(tb)
          return nameCmp(a, b)
        }
        case 'size': {
          // Folders all show "-" for size; comparing them as 0 keeps
          // their relative order stable (falls through to name).
          const sa = a.is_dir ? 0 : a.size
          const sb = b.is_dir ? 0 : b.size
          if (sa !== sb) return sa - sb
          return nameCmp(a, b)
        }
        case 'modified': {
          const ma = a.modified_at || ''
          const mb = b.modified_at || ''
          if (ma !== mb) return ma < mb ? -1 : 1
          return nameCmp(a, b)
        }
        case 'owner': {
          const la = userById[a.owner_id ?? -1] ?? String(a.owner_id ?? '')
          const lb = userById[b.owner_id ?? -1] ?? String(b.owner_id ?? '')
          if (la !== lb) return la.localeCompare(lb)
          return nameCmp(a, b)
        }
        case 'group': {
          const la = groupById[a.group_id ?? -1] ?? String(a.group_id ?? '')
          const lb = groupById[b.group_id ?? -1] ?? String(b.group_id ?? '')
          if (la !== lb) return la.localeCompare(lb)
          return nameCmp(a, b)
        }
      }
      // Defensive tail return: if a future SortKey is added without
      // updating the switch above, the listing will fall back to name
      // ordering instead of mysteriously returning undefined.
      return nameCmp(a, b)
    }
    const sign = sortDir === 'asc' ? 1 : -1
    // Filter out dotfiles up-front when the "show hidden" pref is
    // off, then sort the remaining set. Doing the filter before the
    // sort avoids allocating + sorting a chunk of the array we'll
    // immediately throw away on big folders.
    const base = showHidden ? entries : entries.filter((e) => !isHiddenEntry(e.name))
    return [...base].sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
      return sign * keyCmp(a, b)
    })
  }, [entries, sortKey, sortDir, userById, groupById, showHidden])

  // Fetch the user/group directories the first time we actually need
  // them - i.e. when the Owner/Group column is on OR sorting by owner
  // or group. Without this, the dropdowns/columns would render raw
  // numeric IDs forever. Failures are silent on purpose: the labels
  // simply fall back to the raw ID, same as in FileExplorer.
  const needsDirectory =
    visibleCols.has('owner') || visibleCols.has('group') ||
    sortKey === 'owner' || sortKey === 'group'
  useEffect(() => {
    if (!needsDirectory || directoryLoaded) return
    let cancelled = false
    ;(async () => {
      try {
        const [users, groups] = await Promise.all([
          api.get<Array<{ id: number; username: string }>>('/api/directory/users'),
          api.get<Array<{ id: number; name: string }>>('/api/directory/groups'),
        ])
        if (cancelled) return
        const um: Record<number, string> = {}
        for (const u of users ?? []) um[u.id] = u.username
        const gm: Record<number, string> = {}
        for (const g of groups ?? []) gm[g.id] = g.name
        setUserById(um)
        setGroupById(gm)
      } catch { /* numeric IDs are a fine fallback */ } finally {
        if (!cancelled) setDirectoryLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [needsDirectory, directoryLoaded])

  const counts = useMemo(() => {
    if (!entries) return { dirs: 0, files: 0 }
    let dirs = 0, files = 0
    for (const e of entries) { if (e.is_dir) dirs++; else files++ }
    return { dirs, files }
  }, [entries])

  // Visible columns flattened into the canonical display order so the
  // header / rows iterate the same sequence regardless of how the
  // user toggled them on. We key off COLUMN_LABELS so adding a new
  // column later is a one-line change there.
  const orderedColumns = useMemo<ColumnKey[]>(() => {
    return (Object.keys(COLUMN_LABELS) as ColumnKey[]).filter((c) => visibleCols.has(c))
  }, [visibleCols])

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
    setDraggingPaths(new Set())
    setDropTargetPath(null)
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

  // Carry the highlight onto a path the parent just renamed/moved
  // into the current listing. We wait for the entries to land (i.e.
  // `loading` to flip back to false and the target to appear in
  // `sorted`) so we don't apply focus against the stale pre-refresh
  // listing - that would just be pruned by the effect above. Once
  // applied, we notify the parent so it can clear the request and we
  // don't re-steal the user's selection on unrelated future refreshes.
  useEffect(() => {
    if (!pendingFocus) return
    if (loading) return
    if (!sorted.some((e) => e.path === pendingFocus)) return
    setSelectedPaths(new Set([pendingFocus]))
    setAnchorPath(pendingFocus)
    setCursorPath(pendingFocus)
    onPendingFocusConsumed?.()
  }, [pendingFocus, sorted, loading, onPendingFocusConsumed])

  // Ambient telemetry for the bottom status bar. We push the counts
  // on every change in either the raw entries (server-driven) or the
  // visible projection (show-hidden toggle, sort, etc.), so the
  // parent never has to introspect DirectoryView's filtering logic.
  // The visible count is sourced from `sorted` rather than recomputed
  // here to stay in lockstep with what the user actually sees.
  useEffect(() => {
    if (!onCountsChange) return
    onCountsChange({ visible: sorted.length, total: entries?.length ?? 0 })
  }, [sorted.length, entries?.length, onCountsChange])

  // Push the selection to the parent. Two flavours, kept in sync:
  // - onSelectionChange: the *primary* entry when exactly one item is
  //   selected, otherwise null. Used by single-target actions (Rename,
  //   Permissions).
  // - onSelectedEntriesChange: the whole array, used by multi-aware
  //   actions (bulk Delete with a "Delete N items" label).
  useEffect(() => {
    // Resolve paths to live entries in stable sorted order. The order
    // matters for the bulk-delete summary the parent renders.
    const entries: FileEntry[] = []
    for (const e of sorted) if (selectedPaths.has(e.path)) entries.push(e)
    onSelectedEntriesChange?.(entries)
    if (onSelectionChange) {
      onSelectionChange(entries.length === 1 ? entries[0] : null)
    }
  }, [selectedPaths, sorted, onSelectionChange, onSelectedEntriesChange])

  // ── Marquee (rubber-band) selection ─────────────────────────────────
  // Single global mousemove/mouseup pair, attached only while a drag
  // is in progress. We read the live mouse position into refs so the
  // effect itself never needs to re-bind on every move event.
  useEffect(() => {
    if (!marquee || !scrollBodyRef.current) return
    const sb = scrollBodyRef.current

    // Edge-scroll plumbing: when the pointer enters the dead zone
    // near the top/bottom (or left/right) of the visible ScrollBody,
    // we drive an rAF loop that nudges sb.scrollTop/Left by `vY/vX`
    // each frame until the pointer leaves the zone or the drag ends.
    // The selection box has to keep growing while we scroll (the
    // pointer stays at the same clientY but the content underneath
    // moves), so the rAF tick re-runs the same update() the
    // mousemove handler does.
    const lastClient = { x: 0, y: 0 }
    let vX = 0, vY = 0
    let rafId = 0

    const EDGE = 56        // px - dead zone before scroll kicks in
    const MAX_SPEED = 22   // px per rAF frame at the very edge

    const update = () => {
      const rect = sb.getBoundingClientRect()
      const curX = lastClient.x - rect.left + sb.scrollLeft
      const curY = lastClient.y - rect.top + sb.scrollTop
      pointerRef.current = { x: curX, y: curY, inside: pointerRef.current.inside }

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

    const tick = () => {
      // Bail out cleanly when the ScrollBody hits a hard limit -
      // otherwise we'd burn CPU on no-op rAF callbacks once the
      // user reaches the top or bottom.
      const maxTop = sb.scrollHeight - sb.clientHeight
      const maxLeft = sb.scrollWidth - sb.clientWidth
      if (vY < 0 && sb.scrollTop <= 0) vY = 0
      if (vY > 0 && sb.scrollTop >= maxTop) vY = 0
      if (vX < 0 && sb.scrollLeft <= 0) vX = 0
      if (vX > 0 && sb.scrollLeft >= maxLeft) vX = 0

      if (vY !== 0) sb.scrollTop  = Math.max(0, Math.min(maxTop,  sb.scrollTop  + vY))
      if (vX !== 0) sb.scrollLeft = Math.max(0, Math.min(maxLeft, sb.scrollLeft + vX))

      if (vY !== 0 || vX !== 0) {
        update()
        rafId = requestAnimationFrame(tick)
      } else {
        rafId = 0
      }
    }

    const computeVelocity = (clientX: number, clientY: number) => {
      const rect = sb.getBoundingClientRect()
      // Use the viewport-clipped portion of the ScrollBody so dragging
      // toward the BOTTOM OF THE VIEWPORT (not the bottom of the
      // possibly-taller element) is enough to trigger a scroll. This
      // matches Finder / Explorer / Files etc.
      const top    = Math.max(rect.top,    0)
      const bottom = Math.min(rect.bottom, window.innerHeight)
      const left   = Math.max(rect.left,   0)
      const right  = Math.min(rect.right,  window.innerWidth)

      vY = 0
      if (clientY < top + EDGE)    vY = -Math.ceil(((top + EDGE - clientY) / EDGE) * MAX_SPEED)
      if (clientY > bottom - EDGE) vY =  Math.ceil(((clientY - (bottom - EDGE)) / EDGE) * MAX_SPEED)
      vX = 0
      if (clientX < left + EDGE)   vX = -Math.ceil(((left + EDGE - clientX) / EDGE) * MAX_SPEED)
      if (clientX > right - EDGE)  vX =  Math.ceil(((clientX - (right - EDGE)) / EDGE) * MAX_SPEED)
    }

    const onMove = (ev: MouseEvent) => {
      lastClient.x = ev.clientX
      lastClient.y = ev.clientY
      computeVelocity(ev.clientX, ev.clientY)
      update()
      if ((vY !== 0 || vX !== 0) && rafId === 0) {
        rafId = requestAnimationFrame(tick)
      }
    }

    const onUp = () => {
      const startX = marquee.startX, startY = marquee.startY
      const { x: endX, y: endY } = pointerRef.current
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

      if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
      vY = 0; vX = 0
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
      if (rafId) cancelAnimationFrame(rafId)
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
    pointerRef.current = { x: startX, y: startY, inside: true }
    const m: MarqueeMode = (ev.metaKey || ev.ctrlKey) ? 'toggle' : ev.shiftKey ? 'add' : 'replace'
    setMarquee({ startX, startY, mode: m, baseline: new Set(selectedPaths) })
    setMarqueeBox({ left: startX, top: startY, width: 0, height: 0 })
    setMarqueePaths(new Set())
    marqueePathsRef.current = new Set()
  }

  // Pointer tracking on the ScrollBody itself: feeds the "nearest item
  // to the mouse" heuristic for first-arrow navigation. We bake in the
  // scroll offsets so the recorded coordinates stay valid even after
  // the user scrolls and then presses a key.
  const handleScrollBodyMouseMove = (ev: React.MouseEvent<HTMLDivElement>) => {
    const sb = scrollBodyRef.current
    if (!sb) return
    const rect = sb.getBoundingClientRect()
    pointerRef.current = {
      x: ev.clientX - rect.left + sb.scrollLeft,
      y: ev.clientY - rect.top  + sb.scrollTop,
      inside: true,
    }
  }
  const handleScrollBodyMouseEnter = handleScrollBodyMouseMove
  const handleScrollBodyMouseLeave = () => { pointerRef.current.inside = false }

  // ── Drag-and-drop (move) ────────────────────────────────────────────
  // Source: the selected entries (or the single hovered entry if the
  // user starts dragging an unselected item - matches every native
  // file manager). Target: any folder row/tile in this view, plus
  // the synthetic ".." row, plus folder rows in the sidebar tree
  // (handled by FileTreeItem, sharing the same dnd module).
  //
  // The drag image is a small preview node we keep parked off-screen;
  // setDragImage snapshots it at dragstart, so subsequent mutations
  // (or the node leaving the DOM) don't affect the cursor any more.
  const [draggingPaths, setDraggingPaths] = useState<Set<string>>(() => new Set())
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null)
  const dragGhostRef = useRef<HTMLDivElement | null>(null)

  const beginDrag = (entry: FileEntry, ev: React.DragEvent) => {
    // Build the source set: if the user grabbed an unselected entry,
    // treat it as a fresh single-item selection. Otherwise the whole
    // current selection follows the cursor.
    let sourcePaths: string[]
    if (selectedPaths.has(entry.path)) {
      sourcePaths = sorted.filter((e) => selectedPaths.has(e.path)).map((e) => e.path)
    } else {
      selectOnly(entry.path)
      sourcePaths = [entry.path]
    }

    setActiveDrag({ mountId, sourceFolder: path, paths: sourcePaths })
    // Both setData (for cross-component browsers that need the MIME
    // type registered) and effectAllowed for the cursor.
    try {
      ev.dataTransfer.setData(MOVE_MIME, JSON.stringify(sourcePaths))
    } catch { /* some browsers reject custom MIME until a user-gesture; harmless */ }
    ev.dataTransfer.effectAllowed = 'move'

    // Compose the floating ghost: icon + first filename + optional
    // "+N" badge when more than one entry follows the cursor.
    const ghost = dragGhostRef.current
    if (ghost) {
      const first = sourcePaths[0]
      const firstEntry = sorted.find((e) => e.path === first)
      const icon = firstEntry ? iconFor(firstEntry, false) : '📄'
      const name = firstEntry?.name ?? first
      const extra = sourcePaths.length - 1
      ghost.innerHTML = ''
      const iconEl = document.createElement('span')
      iconEl.textContent = icon
      iconEl.style.cssText = 'font-size:16px;line-height:1;font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif;'
      const nameEl = document.createElement('span')
      nameEl.textContent = name
      nameEl.style.cssText = 'overflow:hidden;text-overflow:ellipsis;max-width:240px;'
      ghost.appendChild(iconEl)
      ghost.appendChild(nameEl)
      if (extra > 0) {
        const badge = document.createElement('span')
        badge.textContent = `+${extra}`
        badge.style.cssText = 'padding:1px 6px;border-radius:999px;background:currentColor;color:transparent;font-size:11px;font-weight:600;'
        // currentColor for background, transparent for text would hide it; flip:
        badge.style.color = '#fff'
        badge.style.background = 'rgb(56,139,253)'
        ghost.appendChild(badge)
      }
      // Cursor anchored slightly inside the top-left of the preview
      // so the badge stays visible to the right of the pointer.
      ev.dataTransfer.setDragImage(ghost, 12, 12)
    }

    setDraggingPaths(new Set(sourcePaths))
  }

  const endDrag = () => {
    // Always clear locally; clearActiveDrag is idempotent and was
    // likely already called by performDropMove on a successful drop.
    setDraggingPaths(new Set())
    setDropTargetPath(null)
    clearActiveDrag()
  }

  // Drop targets share the same accept logic. Returning `true` from
  // `acceptDrag` flips the row/tile into its highlighted state and
  // primes the browser to fire `drop` on release.
  const acceptDrag = (targetFolder: string, ev: React.DragEvent): boolean => {
    if (!ev.dataTransfer.types.includes(MOVE_MIME)) return false
    if (!isValidDropTarget(mountId, targetFolder)) return false
    ev.preventDefault()
    ev.dataTransfer.dropEffect = 'move'
    return true
  }

  const handleFolderDragOver = (targetFolder: string) =>
    (ev: React.DragEvent) => {
      if (acceptDrag(targetFolder, ev)) {
        ev.stopPropagation()
        setDropTargetPath(targetFolder)
      }
    }
  const handleFolderDragLeave = (targetFolder: string) =>
    () => {
      // Only clear if the cursor truly left *this* target. A nested
      // child element firing dragleave while moving inside the same
      // row would otherwise drop the highlight prematurely.
      setDropTargetPath((cur) => (cur === targetFolder ? null : cur))
    }
  const handleFolderDrop = (targetFolder: string) =>
    async (ev: React.DragEvent) => {
      if (!ev.dataTransfer.types.includes(MOVE_MIME)) return
      ev.preventDefault()
      ev.stopPropagation()
      setDropTargetPath(null)
      setDraggingPaths(new Set())
      const { attempted, failed } = await performDropMove(mountId, targetFolder)
      if (attempted > 0 && failed < attempted) onAfterMutation?.()
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

  // Find the entry whose centre is closest to the current pointer
  // position. Used to seed the keyboard cursor when the user starts
  // navigating with the arrows before having clicked anything - so the
  // first arrow press lands "where they are looking", not at the top
  // of the list. Falls back to the first entry when the pointer has
  // never entered the panel.
  const pickNearestItemIdx = (): number => {
    if (sorted.length === 0) return -1
    const sb = scrollBodyRef.current
    if (!sb) return 0
    const pointer = pointerRef.current
    if (!pointer.inside) return 0
    const sbRect = sb.getBoundingClientRect()
    let bestIdx = 0
    let bestDist = Infinity
    for (let i = 0; i < sorted.length; i++) {
      const el = sb.querySelector<HTMLElement>(
        `[data-path="${CSS.escape(sorted[i].path)}"]`,
      )
      if (!el) continue
      const r = el.getBoundingClientRect()
      const cx = (r.left + r.right) / 2 - sbRect.left + sb.scrollLeft
      const cy = (r.top  + r.bottom) / 2 - sbRect.top  + sb.scrollTop
      const dx = cx - pointer.x, dy = cy - pointer.y
      const d  = dx * dx + dy * dy
      if (d < bestDist) { bestDist = d; bestIdx = i }
    }
    return bestIdx
  }

  // ── Keyboard navigation ─────────────────────────────────────────────
  // - Arrows: move the keyboard cursor; replace selection (plain) or
  //   extend range from the anchor (Shift).
  // - First arrow without any cursor: seed the cursor on the entry
  //   nearest the mouse pointer, so navigation can start without
  //   the user having to click first.
  // - Enter: activate the cursor entry through our own model - NOT
  //   through whichever DOM element happens to be focused. This keeps
  //   the keyboard contract bound to the visible selection instead of
  //   stale browser focus left behind by an earlier click. Space is
  //   deliberately NOT a synonym so we don't hijack page scrolling.
  useEffect(() => {
    if (sorted.length === 0) return
    const onKey = (ev: KeyboardEvent) => {
      const key = ev.key
      const isArrow = key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight'
      const isActivate = key === 'Enter'
      if (!isArrow && !isActivate) return
      // Modifier guard: arrows accept Shift (range extend); activation
      // accepts no modifier. Anything else is a system shortcut and
      // we keep our hands off it.
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return
      if (isActivate && ev.shiftKey) return
      // A modal sitting on top owns the keyboard while it's open -
      // pressing Enter inside a rename input must not also activate
      // whatever the DirectoryView cursor was pointing at underneath.
      if (isAnyModalOpen()) return
      const target = ev.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return
      }

      // Resolve where the cursor currently sits. Prefer the explicit
      // keyboard cursor; fall back to the anchor; finally to any item
      // in the selection.
      let curIdx = cursorPath ? sorted.findIndex((e) => e.path === cursorPath) : -1
      if (curIdx < 0 && anchorPath) curIdx = sorted.findIndex((e) => e.path === anchorPath)
      if (curIdx < 0 && selectedPaths.size > 0) {
        curIdx = sorted.findIndex((e) => selectedPaths.has(e.path))
      }

      if (isActivate) {
        // preventDefault swallows the native Enter→click that fires
        // on any incidentally-focused <button>, so activation always
        // routes through OUR cursor rather than browser focus.
        if (curIdx < 0) return
        ev.preventDefault()
        onOpenEntry(sorted[curIdx])
        return
      }

      // First arrow with no prior selection: drop the cursor on the
      // entry nearest the mouse pointer. This press only initialises;
      // the next press is the one that actually moves.
      if (curIdx < 0) {
        const nearest = pickNearestItemIdx()
        if (nearest < 0) return
        ev.preventDefault()
        selectOnly(sorted[nearest].path)
        return
      }

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
  }, [cursorPath, anchorPath, selectedPaths, sorted, mode, onOpenEntry])

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

  // Close header dropdowns on outside click or Escape. Both menus
  // share the same handler - the wrapper refs let us check whether
  // the click landed inside the menu's own subtree (which would mean
  // "user is interacting with the menu, keep it open").
  useEffect(() => {
    if (!sortMenuOpen && !colsMenuOpen) return
    const onPointer = (ev: MouseEvent) => {
      const t = ev.target as Node | null
      if (!t) return
      if (sortMenuOpen && sortMenuRef.current?.contains(t)) return
      if (colsMenuOpen && colsMenuRef.current?.contains(t)) return
      setSortMenuOpen(false)
      setColsMenuOpen(false)
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') { setSortMenuOpen(false); setColsMenuOpen(false) }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [sortMenuOpen, colsMenuOpen])

  return (
    <S.DirectoryViewRoot>
      <S.Header>
        {/* The path itself lives in the toolbar's breadcrumb so we do
            not duplicate it here; the header keeps a discreet "Folder"
            label on the left for visual balance, then the view toggle
            and the entry counts. */}
        <S.HeaderLabel>Folder</S.HeaderLabel>
        <S.HeaderActions>
          {/* Sort dropdown + order toggle.
              The button group keeps them visually tied: pick the key,
              flip the direction, no need to re-open the dropdown. */}
          <S.HeaderButtonGroup ref={sortMenuRef}>
            <S.HeaderButton
              type="button"
              $wide
              $active={sortMenuOpen}
              aria-haspopup="menu"
              aria-expanded={sortMenuOpen}
              onClick={() => { setSortMenuOpen((v) => !v); setColsMenuOpen(false) }}
              title="Sort by"
            >
              <span>Sort: {SORT_LABELS[sortKey]}</span>
              <CaretIcon />
            </S.HeaderButton>
            <S.HeaderButton
              type="button"
              onClick={() => setSortDirAndPersist(sortDir === 'asc' ? 'desc' : 'asc')}
              title={sortDir === 'asc' ? 'Ascending - click to reverse' : 'Descending - click to reverse'}
              aria-label={`Sort direction: ${sortDir === 'asc' ? 'ascending' : 'descending'}`}
            >
              {sortDir === 'asc' ? <SortAscIcon /> : <SortDescIcon />}
            </S.HeaderButton>
            {sortMenuOpen && (
              <S.MenuPopover role="menu">
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <S.MenuItem
                    key={k}
                    type="button"
                    role="menuitemradio"
                    aria-checked={sortKey === k}
                    $active={sortKey === k}
                    onClick={() => { setSortKeyAndPersist(k); setSortMenuOpen(false) }}
                  >
                    <S.MenuCheck aria-hidden>{sortKey === k ? <CheckIcon /> : null}</S.MenuCheck>
                    {SORT_LABELS[k]}
                  </S.MenuItem>
                ))}
              </S.MenuPopover>
            )}
          </S.HeaderButtonGroup>

          {/* Columns dropdown - checkboxes, no auto-close on toggle
              so the user can flip multiple columns in one go. */}
          <S.HeaderButtonGroup ref={colsMenuRef}>
            <S.HeaderButton
              type="button"
              $wide
              $active={colsMenuOpen}
              aria-haspopup="menu"
              aria-expanded={colsMenuOpen}
              onClick={() => { setColsMenuOpen((v) => !v); setSortMenuOpen(false) }}
              title="Show/hide columns"
            >
              <span>Columns</span>
              <CaretIcon />
            </S.HeaderButton>
            {colsMenuOpen && (
              <S.MenuPopover role="menu">
                {(Object.keys(COLUMN_LABELS) as ColumnKey[]).map((c) => {
                  const on = visibleCols.has(c)
                  return (
                    <S.MenuItem
                      key={c}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={on}
                      $active={on}
                      onClick={() => toggleColumn(c)}
                    >
                      <S.MenuCheck aria-hidden>{on ? <CheckIcon /> : null}</S.MenuCheck>
                      {COLUMN_LABELS[c]}
                    </S.MenuItem>
                  )
                })}
              </S.MenuPopover>
            )}
          </S.HeaderButtonGroup>

          {/* Show/hide dotfiles. Icon mirrors the current state
              (eye = visible, eye-off = hidden) - matching the
              convention used by Finder / GNOME Files / VS Code.
              `aria-pressed` makes it a toggle button for AT; the
              tooltip + label make the next action explicit. */}
          <S.HeaderButton
            type="button"
            $active={showHidden}
            aria-pressed={showHidden}
            aria-label={showHidden ? 'Hide hidden files' : 'Show hidden files'}
            title={showHidden ? 'Hide hidden files (dotfiles)' : 'Show hidden files (dotfiles)'}
            onClick={toggleShowHidden}
          >
            {showHidden ? <EyeIcon /> : <EyeOffIcon />}
          </S.HeaderButton>

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
      <S.ScrollBody
        ref={scrollBodyRef}
        onMouseDown={handleScrollBodyMouseDown}
        onMouseMove={handleScrollBodyMouseMove}
        onMouseEnter={handleScrollBodyMouseEnter}
        onMouseLeave={handleScrollBodyMouseLeave}
      >
        {loading && !entries
          ? <LoadingState label="Loading…" />
          : error
            ? <ErrorState title="Failed to list" description={error} />
            : mode === 'grid'
              ? renderGrid({
                  sorted, selectedSet: viewSelection,
                  onClickEntry: handleEntryClick, onClickParent: clearSelection,
                  onOpenEntry, parentPath, onNavigatePath,
                  draggingPaths, dropTargetPath,
                  onDragStartEntry: beginDrag, onDragEndEntry: endDrag,
                  onFolderDragOver: handleFolderDragOver,
                  onFolderDragLeave: handleFolderDragLeave,
                  onFolderDrop: handleFolderDrop,
                  columns: orderedColumns,
                  userById, groupById,
                })
              : renderList({
                  sorted, selectedSet: viewSelection,
                  onClickEntry: handleEntryClick, onClickParent: clearSelection,
                  onOpenEntry, parentPath, onNavigatePath,
                  draggingPaths, dropTargetPath,
                  onDragStartEntry: beginDrag, onDragEndEntry: endDrag,
                  onFolderDragOver: handleFolderDragOver,
                  onFolderDragLeave: handleFolderDragLeave,
                  onFolderDrop: handleFolderDrop,
                  columns: orderedColumns,
                  userById, groupById,
                })}
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
      {/* Floating preview consumed by dataTransfer.setDragImage at
          dragstart. Kept permanently mounted off-screen so the ref
          is always live; its content is mutated imperatively right
          before the snapshot is taken. */}
      <S.DragGhost ref={dragGhostRef} aria-hidden />
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

  // ── Drag-and-drop wiring ───────────────────────────────────────────
  /** Paths currently being dragged (rendered with ghost opacity). */
  draggingPaths: Set<string>
  /** Path of the folder currently hovered as a drop target, or null. */
  dropTargetPath: string | null
  /** Drag-source handlers, applied to every entry row/tile. */
  onDragStartEntry: (entry: FileEntry, ev: React.DragEvent) => void
  onDragEndEntry: () => void
  /** Drop-target handler factories, keyed by the destination folder path. */
  onFolderDragOver: (folderPath: string) => (ev: React.DragEvent) => void
  onFolderDragLeave: (folderPath: string) => (ev: React.DragEvent) => void
  onFolderDrop: (folderPath: string) => (ev: React.DragEvent) => Promise<void>

  // ── List-view column controls ──────────────────────────────────────
  /** Ordered list of meta columns rendered to the right of Name. */
  columns: ColumnKey[]
  /** {id → label} maps used by the Owner / Group columns. */
  userById: Record<number, string>
  groupById: Record<number, string>
}

// labelFor mirrors FileTreeItem's helper: a Linux-style dash when
// the entry has no explicit owner/group set, otherwise the directory
// label, falling back to the raw numeric ID until the directory load
// completes (or if it fails altogether).
const labelFor = (id: number | null | undefined, map: Record<number, string>): string => {
  if (id === null || id === undefined) return '-'
  return map[id] ?? String(id)
}

const renderList = ({
  sorted, selectedSet, onClickEntry, onClickParent, onOpenEntry, parentPath, onNavigatePath,
  draggingPaths, dropTargetPath,
  onDragStartEntry, onDragEndEntry,
  onFolderDragOver, onFolderDragLeave, onFolderDrop,
  columns, userById, groupById,
}: LayoutProps): React.ReactElement => {
  // Single source of truth for the meta cells: drives both the header
  // and every row so adding/removing a column from the menu reflows
  // the table in one render without divergence.
  const renderCell = (e: FileEntry, c: ColumnKey): React.ReactNode => {
    switch (c) {
      case 'type':     return typeOf(e)
      case 'size':     return e.is_dir ? '-' : formatBytes(e.size)
      case 'modified': return formatDate(e.modified_at)
      case 'mode':     return formatMode(e.mode)
      case 'owner':    return labelFor(e.owner_id, userById)
      case 'group':    return labelFor(e.group_id, groupById)
    }
  }
  const colCount = 1 + columns.length // Name + meta columns
  return (
    <S.Table>
      <thead>
        <tr>
          <th>Name</th>
          {columns.map((c) => <th key={c}>{COLUMN_LABELS[c]}</th>)}
        </tr>
      </thead>
      <tbody>
        {/* Virtual ".." row: rendered at the top whenever a parent
            exists, so the user can pop up one level instead of going
            through the breadcrumb. Doubles as a drop target so the
            user can move selected entries up by dragging onto "..". */}
        {parentPath !== null && onNavigatePath && (
          <S.Row
            key="__parent__"
            $dropTarget={dropTargetPath === parentPath}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onClickParent() }}
            onDoubleClick={() => onNavigatePath(parentPath)}
            onDragOver={onFolderDragOver(parentPath)}
            onDragEnter={onFolderDragOver(parentPath)}
            onDragLeave={onFolderDragLeave(parentPath)}
            onDrop={onFolderDrop(parentPath)}
            title="Parent folder"
          >
            <td className="name">
              <S.Icon aria-hidden>{'\u21B0'}</S.Icon>
              ..
            </td>
            {columns.map((c) => (
              <td key={c} className="meta">{c === 'type' ? 'Parent folder' : '-'}</td>
            ))}
          </S.Row>
        )}
        {sorted.length === 0 && parentPath === null ? (
          <tr>
            <S.EmptyCell colSpan={colCount}>This folder is empty.</S.EmptyCell>
          </tr>
        ) : sorted.map((e) => {
          // Folders alone accept drops; files would be a no-op and we
          // don't want the row to flash as a valid target when it
          // isn't.
          const dropHandlers = e.is_dir ? {
            onDragOver: onFolderDragOver(e.path),
            onDragEnter: onFolderDragOver(e.path),
            onDragLeave: onFolderDragLeave(e.path),
            onDrop: onFolderDrop(e.path),
          } : {}
          return (
            <S.Row
              key={e.path}
              data-path={e.path}
              $active={selectedSet.has(e.path)}
              $dragging={draggingPaths.has(e.path)}
              $dropTarget={e.is_dir && dropTargetPath === e.path}
              draggable
              onDragStart={(ev) => onDragStartEntry(e, ev)}
              onDragEnd={onDragEndEntry}
              onMouseDown={(ev) => ev.stopPropagation()}
              onClick={(ev) => onClickEntry(e, ev)}
              onDoubleClick={() => onOpenEntry(e)}
              title={e.path}
              {...dropHandlers}
            >
              <td className="name">
                <S.Icon aria-hidden>{iconFor(e, false)}</S.Icon>
                {e.name}
              </td>
              {columns.map((c) => (
                <td key={c} className="meta">{renderCell(e, c)}</td>
              ))}
            </S.Row>
          )
        })}
      </tbody>
    </S.Table>
  )
}

// Tiles intentionally stay OUT of the DOM focus chain. `tabIndex=-1`
// keeps them off the tab sequence; we only stopPropagation on
// mousedown (so the marquee handler skips us) but DO NOT
// preventDefault - that would kill the native dragstart in Firefox
// for a draggable element. Enter activation still goes through the
// global keydown handler in DirectoryView, which acts on OUR
// cursorPath, so a momentarily-focused tile doesn't create a stale
// Enter→click race.
const tileMouseDown = (ev: React.MouseEvent) => {
  ev.stopPropagation()
}

const renderGrid = ({
  sorted, selectedSet, onClickEntry, onClickParent, onOpenEntry, parentPath, onNavigatePath,
  draggingPaths, dropTargetPath,
  onDragStartEntry, onDragEndEntry,
  onFolderDragOver, onFolderDragLeave, onFolderDrop,
}: LayoutProps): React.ReactElement => (
  // data-grid marks this element as the live CSS grid the parent
  // queries via getComputedStyle to count columns for 2D arrow-key
  // navigation. Keep it in sync with the selector in DirectoryView.
  <S.Grid data-grid="1">
    {parentPath !== null && onNavigatePath && (
      <S.Tile
        key="__parent__"
        type="button"
        tabIndex={-1}
        $dropTarget={dropTargetPath === parentPath}
        onMouseDown={tileMouseDown}
        onClick={(e) => { e.stopPropagation(); onClickParent() }}
        onDoubleClick={() => onNavigatePath(parentPath)}
        onDragOver={onFolderDragOver(parentPath)}
        onDragEnter={onFolderDragOver(parentPath)}
        onDragLeave={onFolderDragLeave(parentPath)}
        onDrop={onFolderDrop(parentPath)}
        title="Parent folder"
      >
        <S.TileIcon aria-hidden>{'\u21B0'}</S.TileIcon>
        <S.TileName>..</S.TileName>
        <S.TileMeta>Parent folder</S.TileMeta>
      </S.Tile>
    )}
    {sorted.length === 0 && parentPath === null ? (
      <S.EmptyTile>This folder is empty.</S.EmptyTile>
    ) : sorted.map((e) => {
      const dropHandlers = e.is_dir ? {
        onDragOver: onFolderDragOver(e.path),
        onDragEnter: onFolderDragOver(e.path),
        onDragLeave: onFolderDragLeave(e.path),
        onDrop: onFolderDrop(e.path),
      } : {}
      return (
        <S.Tile
          key={e.path}
          data-path={e.path}
          type="button"
          tabIndex={-1}
          $active={selectedSet.has(e.path)}
          $dragging={draggingPaths.has(e.path)}
          $dropTarget={e.is_dir && dropTargetPath === e.path}
          draggable
          onDragStart={(ev) => onDragStartEntry(e, ev)}
          onDragEnd={onDragEndEntry}
          onMouseDown={tileMouseDown}
          onClick={(ev) => onClickEntry(e, ev)}
          onDoubleClick={() => onOpenEntry(e)}
          title={e.path}
          {...dropHandlers}
        >
          <S.TileIcon aria-hidden>{iconFor(e, false)}</S.TileIcon>
          <S.TileName>{e.name}</S.TileName>
          <S.TileMeta>{e.is_dir ? typeOf(e) : formatBytes(e.size)}</S.TileMeta>
        </S.Tile>
      )
    })}
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

// Tiny caret pointing down - used by the Sort/Columns dropdown
// triggers to advertise their menu affordance.
const CaretIcon: React.FC = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
    <polyline points="2,3.5 5,6.5 8,3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// Filled checkmark for the active sort key + on-state column toggle.
const CheckIcon: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
    <polyline points="2.5,6.5 5,9 9.5,3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// Eye / Eye-off for the "show hidden files" toggle. The icon
// reflects the current state (eye = dotfiles visible, eye-off =
// hidden), mirroring macOS / GNOME conventions where the icon
// shows what *is*, not what would happen on click.
const EyeIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)
const EyeOffIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M17.94 17.94A11 11 0 0 1 12 20c-7 0-11-8-11-8a19.6 19.6 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A11 11 0 0 1 12 4c7 0 11 8 11 8a19.5 19.5 0 0 1-2.16 3.19" />
    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)

// Sort direction icons: a short stack of horizontal lines decreasing
// (asc, narrow → wide upwards) or increasing (desc) in length. Reads
// at-a-glance as "A→Z" / "Z→A" without needing letters that wouldn't
// make sense for size or date sorts.
const SortAscIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
    <line x1="3" y1="4"  x2="9"  y2="4"  stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <line x1="3" y1="8"  x2="11" y2="8"  stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <line x1="3" y1="12" x2="13" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)
const SortDescIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
    <line x1="3" y1="4"  x2="13" y2="4"  stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <line x1="3" y1="8"  x2="11" y2="8"  stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <line x1="3" y1="12" x2="9"  y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)
