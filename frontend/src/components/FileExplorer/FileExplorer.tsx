import React, { useCallback, useEffect, useState } from 'react'
import { fsApi, HttpError, api } from '@/lib/api'
import type { FileEntry } from '@/types/files'
import { FileTreeItem } from '@/components/FileTreeItem'
import { Button } from '@/components/Button'
import { LoadingState } from '@/components/LoadingState'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'

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
  onRootForbidden,
}) => {
  const [dirs, setDirs] = useState<Record<string, DirState>>({})
  // Initial value is read from localStorage so the very first render
  // already reflects the persisted shape — no flash of a collapsed tree
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
    const restored = readExpanded(mountId)
    setExpanded(restored)
    void loadDir('')
    for (const p of restored) {
      if (p === '') continue
      void loadDir(p)
    }
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
  // to the expanded set — it never removes — so a user's deliberate
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

  // toggle handles ONLY the expand/collapse of a folder branch — it is
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
  // DirectoryView), files are opened in the editor. Single-click is
  // the natural interaction for a navigation tree — the dual-click
  // (select-then-open) pattern is reserved for DirectoryView, which
  // behaves like a desktop file manager's main pane.
  const activate = (entry: FileEntry) => {
    onChangeDir(entry.path)
    onOpenFile(entry)
  }

  const renderDir = (path: string, depth: number): React.ReactNode => {
    const state = dirs[path]
    if (!state) return null
    if (state.loading && state.entries.length === 0) {
      return <LoadingState label="Loading…" />
    }
    if (state.error) return <ErrorState title="Failed to list" description={state.error} />
    if (state.entries.length === 0 && depth === 0) {
      return <EmptyState title="Empty mount" description="No files yet. Create one to get started." />
    }
    return (
      <S.Group>
        {state.entries.map((e) => {
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
              />
              {e.is_dir && open && renderDir(e.path, depth + 1)}
            </React.Fragment>
          )
        })}
      </S.Group>
    )
  }

  return (
    <S.FileExplorerRoot>
      <S.Toolbar>
        <S.PathBar title={`/${activePath}`}>{activePath ? `/${activePath}` : '/'}</S.PathBar>
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
      <S.List>{renderDir('', 0)}</S.List>
    </S.FileExplorerRoot>
  )
}
