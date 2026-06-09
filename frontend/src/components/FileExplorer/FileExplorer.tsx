import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { fsApi, HttpError, api } from '@/lib/api'
import type { FileEntry } from '@/types/files'
import { FileTreeItem } from '@/components/FileTreeItem'
import { Button } from '@/components/Button'
import { LoadingState } from '@/components/LoadingState'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { MOVE_MIME, isValidDropTarget, performDropMove } from '@/lib/dnd'
import { useShowHidden, isHiddenEntry } from '@/hooks/useShowHidden'

import * as S from './styled'

// localStorage key for the "show details" toggle. We persist the preference
// so refreshing the explorer (or jumping between mounts) preserves whether
// the user wants the Linux-style metadata column visible.
const DETAILS_STORAGE_KEY = 'mountpad:explorer:details'

// localStorage key prefix for the per-mount expanded-folders set. Refreshing
// the page should restore the same tree shape, so the user does not lose
// the folders they had unfolded. Keyed by mount id so different mounts do
// not collide (and switching mounts does not leak the other one's state).
const EXPANDED_STORAGE_KEY = (mountId: number) => `mountpad:explorer:expanded:${mountId}`

const readExpanded = (mountId: number): Set<string> => {
  // Defaults: root is always expanded. We add it back unconditionally so a
  // corrupted/empty storage entry still yields a usable tree.
  const fallback = new Set<string>([''])
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(EXPANDED_STORAGE_KEY(mountId))
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return fallback
    const next = new Set<string>()
    for (const v of parsed) {
      if (typeof v === 'string') next.add(v)
    }
    next.add('')
    return next
  } catch {
    return fallback
  }
}

interface UserDirEntry { id: number; username: string; display_name?: string }
interface GroupDirEntry { id: number; name: string }

interface FileExplorerProps {
  mountId: number
  activePath: string
  onOpenFile: (entry: FileEntry) => void
  onChangeDir: (path: string) => void
  onCreateFile: () => void
  onCreateDir: () => void
  refreshKey?: number
  /**
   * Called once when listing the mount root yields a 403. The parent uses
   * this to drop the mount from the sidebar in case the server-side filter
   * was bypassed (e.g. stale Inertia visit cached on the client).
   */
  onRootForbidden?: (mountId: number) => void
  /**
   * Fired after a successful drag-and-drop move into a sidebar folder.
   * The parent bumps its shared refresh key so both this explorer AND
   * the workspace's DirectoryView re-fetch and reflect the new layout.
   */
  onAfterMutation?: () => void
  /**
   * Rewriting hint sent by the parent after a rename succeeds. Any
   * path in the `expanded` set that equals `from` or sits under it is
   * rewritten with the new prefix, so the user keeps their unfolded
   * branches across the rename instead of seeing the whole subtree
   * snap shut. Cleared via `onPendingRenameConsumed` once applied.
   */
  pendingRename?: { from: string; to: string } | null
  onPendingRenameConsumed?: () => void
}

// rewriteExpanded returns a new Set with every path inside `from`
// rebased onto `to`. Used both for a direct rename of `from` itself
// and for transitive rewrites of descendants (e.g. renaming `notes`
// also updates `notes/2026/january` → `archive/2026/january`).
// The empty source guard prevents accidentally matching every path
// at the mount root when `from` happens to be "".
function rewriteExpanded(set: Set<string>, from: string, to: string): Set<string> {
  if (!from || from === to) return set
  let changed = false
  const next = new Set<string>()
  for (const p of set) {
    if (p === from) { next.add(to); changed = true }
    else if (p.startsWith(from + '/')) { next.add(to + p.slice(from.length)); changed = true }
    else next.add(p)
  }
  return changed ? next : set
}

interface DirState {
  loading: boolean
  error?: string
  entries: FileEntry[]
}

// ancestorsOf returns every parent path of the given file path, in shallow→deep
// order, including the implicit root ("").
//
//   ancestorsOf("notes/2026/january.md") → ["", "notes", "notes/2026"]
//
// Used to auto-expand the tree down to a deep-linked file so the user lands
// on a fully unfolded explorer rather than a single-line root.
function ancestorsOf(path: string): string[] {
  const out: string[] = ['']
  if (!path) return out
  const parts = path.split('/')
  // The last segment is the file or leaf folder itself: skip it; only its
  // parents need to be expanded.
  for (let i = 1; i < parts.length; i++) {
    out.push(parts.slice(0, i).join('/'))
  }
  return out
}

export const FileExplorer: React.FC<FileExplorerProps> = ({
  mountId, activePath, onOpenFile, onChangeDir, onCreateFile, onCreateDir, refreshKey,
  onRootForbidden, onAfterMutation, pendingRename, onPendingRenameConsumed,
}) => {
  const [dirs, setDirs] = useState<Record<string, DirState>>({})
  // Initial value is read from localStorage so the very first render
  // already reflects the persisted shape - no flash of a collapsed tree
  // before an effect "restores" it.
  const [expanded, setExpanded] = useState<Set<string>>(() => readExpanded(mountId))

  // Lazily-built id→label maps for owner and group. They stay empty until the
  // user actually flips the "details" toggle on, so we don't pay the round
  // trip for users who never use it.
  const [showDetails, setShowDetails] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(DETAILS_STORAGE_KEY) === '1'
  })
  const [userById, setUserById] = useState<Record<number, string>>({})
  const [groupById, setGroupById] = useState<Record<number, string>>({})
  const [directoryLoaded, setDirectoryLoaded] = useState(false)

  // App-wide "show hidden files" preference, shared with DirectoryView
  // via a module-level pub/sub (see hooks/useShowHidden). The toggle
  // lives in the DirectoryView header; we just consume the value here
  // and re-filter on every change so the sidebar stays in lockstep.
  const { showHidden } = useShowHidden()

  const loadDir = useCallback(async (path: string) => {
    setDirs((prev) => ({ ...prev, [path]: { loading: true, entries: prev[path]?.entries || [] } }))
    try {
      const res = await fsApi(mountId).list(path)
      setDirs((prev) => ({ ...prev, [path]: { loading: false, entries: res.entries } }))
    } catch (err: unknown) {
      // If the very root of the mount is forbidden, the user shouldn't see it
      // in the sidebar at all. We let the parent know so it can prune the list.
      if (path === '' && err instanceof HttpError && err.status === 403) {
        onRootForbidden?.(mountId)
      }
      setDirs((prev) => ({ ...prev, [path]: { loading: false, error: String(err), entries: [] } }))
    }
  }, [mountId, onRootForbidden])

  useEffect(() => {
    setDirs({})
    // Restore the per-mount expanded set from localStorage on every
    // mount change or refresh, then eagerly fetch each persisted folder
    // so the tree branches come back populated instead of empty.
    let restored = readExpanded(mountId)
    // If the parent reports a path was just renamed, rebase every
    // matching entry in the set BEFORE we apply it. Doing it here
    // (rather than in a separate effect) lets the persist effect
    // pick up the rewritten value on the very next commit and means
    // we never read the now-stale paths to issue refetches with -
    // those would 404 on the backend and leave the branch empty.
    if (pendingRename) {
      restored = rewriteExpanded(restored, pendingRename.from, pendingRename.to)
    }
    setExpanded(restored)
    void loadDir('')
    for (const p of restored) {
      if (p === '') continue
      void loadDir(p)
    }
    if (pendingRename) onPendingRenameConsumed?.()
    // pendingRename / onPendingRenameConsumed are intentionally NOT in
    // the dep array: the parent always pairs a rename hint with a
    // refreshKey bump, and re-running this effect on the consumed
    // callback's re-render would just re-fetch the same listings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mountId, loadDir, refreshKey])

  // Persist the expanded set after every change. We strip the root entry
  // (always implicitly expanded) to keep the stored payload small.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const arr = Array.from(expanded).filter((p) => p !== '')
      window.localStorage.setItem(EXPANDED_STORAGE_KEY(mountId), JSON.stringify(arr))
    } catch { /* storage may be disabled or full */ }
  }, [expanded, mountId])

  // Pull the {id → name} directories the first time the user flips on the
  // details toggle. We hit `/api/directory/*` instead of `/api/users` (admin
  // only) so regular members still get readable owner:group labels. Failures
  // are silent: the FileTreeItem falls back to displaying raw IDs.
  useEffect(() => {
    if (!showDetails || directoryLoaded) return
    let cancelled = false
    ;(async () => {
      try {
        const [users, groups] = await Promise.all([
          api.get<UserDirEntry[]>('/api/directory/users'),
          api.get<GroupDirEntry[]>('/api/directory/groups'),
        ])
        if (cancelled) return
        const um: Record<number, string> = {}
        for (const u of users ?? []) um[u.id] = u.username
        const gm: Record<number, string> = {}
        for (const g of groups ?? []) gm[g.id] = g.name
        setUserById(um)
        setGroupById(gm)
      } catch {
        // Non-fatal: details still render with numeric IDs.
      } finally {
        if (!cancelled) setDirectoryLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [showDetails, directoryLoaded])

  const toggleDetails = useCallback(() => {
    setShowDetails((prev) => {
      const next = !prev
      try { window.localStorage.setItem(DETAILS_STORAGE_KEY, next ? '1' : '0') } catch { /* storage might be disabled */ }
      return next
    })
  }, [])

  // When the active path points deep into a sub-tree (typically after a
  // refresh on a deep-linked URL), expand and prefetch every ancestor so
  // the selected entry is reachable in the tree. This effect only ADDS
  // to the expanded set - it never removes - so a user's deliberate
  // collapse stays in place until they navigate again. The active
  // entry itself is intentionally NOT auto-expanded: that decision is
  // left to the user via the chevron.
  useEffect(() => {
    if (!activePath) return
    const ancestors = ancestorsOf(activePath)
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const p of ancestors) next.add(p)
      return next
    })
    for (const p of ancestors) {
      if (p === '') continue // root is already loaded by the effect above
      if (!dirs[p]) void loadDir(p)
    }
    // We intentionally don't depend on `dirs` to avoid an infinite reload
    // loop: loadDir mutates it, which would re-trigger this effect. The
    // freshness of `dirs` matters only for the dedupe check, which is fine
    // to do against a slightly-stale snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath, mountId, loadDir])

  // toggle handles ONLY the expand/collapse of a folder branch - it is
  // wired exclusively to the disclosure chevron in FileTreeItem. User
  // input always wins here: even the parent of the currently-viewed
  // entry can be collapsed. The tree shape is purely driven by the
  // `expanded` set and persisted to localStorage.
  const toggle = (entry: FileEntry) => {
    if (!entry.is_dir) return
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(entry.path)) next.delete(entry.path)
      else { next.add(entry.path); void loadDir(entry.path) }
      return next
    })
  }

  // activate is the row click / Enter / Space handler: it opens the
  // entry. Folders are navigated to (their contents show in
  // DirectoryView) AND auto-expanded so the user immediately sees
  // their children in the sidebar tree - matches the desktop file
  // manager convention of "click a folder, see what's inside". Files
  // are opened in the editor.
  //
  // The expand is one-directional: clicking an already-open folder
  // leaves it open (the chevron is still the only way to collapse).
  // This avoids the surprise of a click both navigating into a folder
  // and hiding the children the user just landed on.
  const activate = (entry: FileEntry) => {
    if (entry.is_dir) {
      setExpanded((prev) => {
        if (prev.has(entry.path)) return prev
        const next = new Set(prev)
        next.add(entry.path)
        return next
      })
      // Lazily fetch the listing if we don't have it yet - same path
      // the chevron toggle takes when opening a branch for the first
      // time.
      if (!dirs[entry.path]) void loadDir(entry.path)
    }
    onChangeDir(entry.path)
    onOpenFile(entry)
  }

  // ── Drag-and-drop drop targets ──────────────────────────────────────
  // The sidebar tree mirrors the rest of the app: any folder row can
  // act as a drop target for the active drag, including the synthetic
  // "/" root row. Highlighting is driven by `dropTargetPath` so only
  // the row directly under the cursor lights up - and so a deep drag
  // doesn't trail accent colour through every ancestor.
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null)

  const folderDragOver = (folderPath: string) => (ev: React.DragEvent) => {
    if (!ev.dataTransfer.types.includes(MOVE_MIME)) return
    if (!isValidDropTarget(mountId, folderPath)) return
    ev.preventDefault()
    ev.stopPropagation()
    ev.dataTransfer.dropEffect = 'move'
    setDropTargetPath(folderPath)
  }
  const folderDragLeave = (folderPath: string) => () => {
    setDropTargetPath((cur) => (cur === folderPath ? null : cur))
  }
  const folderDrop = (folderPath: string) => async (ev: React.DragEvent) => {
    if (!ev.dataTransfer.types.includes(MOVE_MIME)) return
    ev.preventDefault()
    ev.stopPropagation()
    setDropTargetPath(null)
    const { attempted, failed } = await performDropMove(mountId, folderPath)
    if (attempted > 0 && failed < attempted) {
      // Pre-expand the destination so the user sees the moved entries
      // appear in their new home as soon as the refresh lands.
      setExpanded((prev) => {
        if (prev.has(folderPath)) return prev
        const next = new Set(prev)
        next.add(folderPath)
        return next
      })
      onAfterMutation?.()
    }
  }

  const renderDir = (path: string, depth: number): React.ReactNode => {
    const state = dirs[path]
    if (!state) return null
    if (state.loading && state.entries.length === 0) {
      return <LoadingState label="Loading…" />
    }
    if (state.error) return <ErrorState title="Failed to list" description={state.error} />
    // Show the "empty mount" hint specifically for the root listing,
    // regardless of indent depth - the synthetic root row pushes the
    // mount's top-level entries to depth 1, so we key off the path
    // instead of the depth here.
    if (state.entries.length === 0 && path === '') {
      return <EmptyState title="Empty mount" description="No files yet. Create one to get started." />
    }
    // Apply the show-hidden filter at render time so we never refetch
    // when the user flips the pref - same backend response, narrower
    // client-side projection. The "empty mount" hint above
    // intentionally uses the raw list: if the mount truly has only
    // dotfiles in it, we still want to show those once the user
    // enables hidden files, instead of declaring the mount empty.
    const visible = showHidden ? state.entries : state.entries.filter((e) => !isHiddenEntry(e.name))
    return (
      <S.Group>
        {visible.map((e) => {
          // A folder is open iff it is in the user-controlled `expanded`
          // set. No derived "force open" rules: user input is the only
          // source of truth for the tree shape.
          const open = expanded.has(e.path)
          return (
            <React.Fragment key={e.path}>
              <FileTreeItem
                entry={e}
                depth={depth}
                open={open}
                active={e.path === activePath}
                onActivate={activate}
                onToggle={toggle}
                showDetails={showDetails}
                userById={userById}
                groupById={groupById}
                dropTarget={e.is_dir && dropTargetPath === e.path}
                onDragOver={e.is_dir ? folderDragOver(e.path) : undefined}
                onDragEnter={e.is_dir ? folderDragOver(e.path) : undefined}
                onDragLeave={e.is_dir ? folderDragLeave(e.path) : undefined}
                onDrop={e.is_dir ? folderDrop(e.path) : undefined}
              />
              {e.is_dir && open && renderDir(e.path, depth + 1)}
            </React.Fragment>
          )
        })}
      </S.Group>
    )
  }

  // Synthetic FileEntry for the mount root. It surfaces as a real row
  // at the top of the tree so the user has a one-click way back to
  // the root, even after drilling deep into sub-folders. The chevron
  // doubles as a collapse-all affordance for the whole tree.
  const rootEntry = useMemo<FileEntry>(() => ({
    name: '/',
    path: '',
    is_dir: true,
    size: 0,
    modified_at: '',
    mode: 0,
  }), [])
  const rootOpen = expanded.has('')

  return (
    <S.FileExplorerRoot>
      <S.Toolbar>
        <S.DetailsToggle
          type="button"
          $active={showDetails}
          onClick={toggleDetails}
          aria-pressed={showDetails}
          title={showDetails ? 'Hide owner, group and permissions' : 'Show owner, group and permissions'}
        >
          {/* "list-details"-style glyph: three rows with leading dots,
              echoing the `ls -l` long-format vibe of the details mode. */}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="3" cy="4" r="0.6" fill="currentColor" stroke="none" />
            <circle cx="3" cy="8" r="0.6" fill="currentColor" stroke="none" />
            <circle cx="3" cy="12" r="0.6" fill="currentColor" stroke="none" />
            <line x1="6" y1="4" x2="13" y2="4" />
            <line x1="6" y1="8" x2="13" y2="8" />
            <line x1="6" y1="12" x2="13" y2="12" />
          </svg>
        </S.DetailsToggle>
        <Button size="sm" onClick={onCreateFile}>+ File</Button>
        <Button size="sm" variant="secondary" onClick={onCreateDir}>+ Folder</Button>
      </S.Toolbar>
      <S.List>
        {/* The synthetic root row sits at depth 0; its children - the
            actual top-level entries - render one level deeper so the
            indentation reads as "inside /". Collapsing the root via
            its chevron hides the whole tree. */}
        <FileTreeItem
          entry={rootEntry}
          depth={0}
          open={rootOpen}
          active={activePath === ''}
          onActivate={activate}
          onToggle={toggle}
          showDetails={showDetails}
          userById={userById}
          groupById={groupById}
          dropTarget={dropTargetPath === ''}
          onDragOver={folderDragOver('')}
          onDragEnter={folderDragOver('')}
          onDragLeave={folderDragLeave('')}
          onDrop={folderDrop('')}
        />
        {rootOpen && renderDir('', 1)}
      </S.List>
    </S.FileExplorerRoot>
  )
}
