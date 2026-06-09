import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePage } from '@inertiajs/react'
import { AppShell } from '@/layouts/AppShell'
import { MountPointSidebar } from '@/components/MountPointSidebar'
import { FileExplorer } from '@/components/FileExplorer'
import { DirectoryView } from '@/components/DirectoryView'
import { TextEditor } from '@/components/TextEditor'
import { FileToolbar } from '@/components/FileToolbar'
import { FileDetailsPanel } from '@/components/FileDetailsPanel'
import { PermissionsPanel } from '@/components/PermissionsPanel'
import { Modal } from '@/components/Modal'
import { Input } from '@/components/Input'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { LoadingState } from '@/components/LoadingState'
import { WelcomeScreen } from '@/components/WelcomeScreen'
import { StatusBarParts as SB } from '@/components/StatusBar'
import { fsApi, HttpError } from '@/lib/api'
import { useDirty } from '@/hooks/useDirty'
import { useSaveShortcut } from '@/hooks/useSaveShortcut'
import type { FileEntry, MountPoint } from '@/types/files'
import type { SharedProps } from '@/types/inertia'

import * as S from './styled'

type EditorStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

const WorkspacePage: React.FC = () => {
  const { props } = usePage<SharedProps & Record<string, unknown>>()
  const rawMountPoints = useMemo(() => props.mount_points ?? [], [props.mount_points])
  const user = props.auth.user

  // Defensive client-side prune: the backend already filters mount_points by
  // user ACL, but the sidebar self-heals on top of that so an inaccessible
  // mount never lingers (e.g. when an Inertia visit cached pre-filter, or
  // when the user actually does have list-root permission per ACL but a
  // runtime check ends up rejecting them later).
  const [forbiddenMountIds, setForbiddenMountIds] = useState<Set<number>>(() => new Set())
  const mountPoints = useMemo(
    () => rawMountPoints.filter((mp) => !forbiddenMountIds.has(mp.id)),
    [rawMountPoints, forbiddenMountIds],
  )
  const markForbidden = useCallback((mountId: number) => {
    setForbiddenMountIds((prev) => {
      if (prev.has(mountId)) return prev
      const next = new Set(prev)
      next.add(mountId)
      return next
    })
  }, [])

  // Probe every mount once on load: a cheap `list root` call tells us whether
  // the user actually has ActionList on that mount root. Anything that comes
  // back 403 is added to the forbidden set right away, so the sidebar matches
  // the user's true access without waiting for them to click. We track which
  // IDs we've already probed so the effect is idempotent across re-renders.
  const probedMountIds = useRef<Set<number>>(new Set())
  useEffect(() => {
    let cancelled = false
    for (const mp of rawMountPoints) {
      if (probedMountIds.current.has(mp.id)) continue
      probedMountIds.current.add(mp.id)
      void fsApi(mp.id).list('').catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof HttpError && err.status === 403) {
          markForbidden(mp.id)
        }
      })
    }
    return () => { cancelled = true }
  }, [rawMountPoints, markForbidden])

  const [activeMount, setActiveMount] = useState<MountPoint | undefined>(undefined)
  const [activeDir, setActiveDir] = useState('')
  const [activeFile, setActiveFile] = useState<FileEntry | undefined>()
  // Tracks whether the URL → state restore has run; gates the inverse
  // state → URL sync so we never push history on the first render.
  const urlInitialized = useRef(false)
  const [content, setContent] = useState('')
  const [origContent, setOrigContent] = useState('')
  const [checksum, setChecksum] = useState('')
  const [mtime, setMtime] = useState('')
  const [status, setStatus] = useState<EditorStatus>('idle')
  const [statusLabel, setStatusLabel] = useState<string>('')
  const [explorerKey, setExplorerKey] = useState(0)
  const [loadingFile, setLoadingFile] = useState(false)

  const [showCreateFile, setShowCreateFile] = useState(false)
  const [showCreateDir, setShowCreateDir] = useState(false)
  const [newName, setNewName] = useState('')
  const [showRename, setShowRename] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteRecursive, setDeleteRecursive] = useState(false)
  const [showPerms, setShowPerms] = useState(false)

  // DirectoryView selection, lifted up here so the toolbar's Rename and
  // Delete buttons can act on whatever the user just highlighted in the
  // listing.
  // - selectedEntry: the *primary* (only) selection, used by single-
  //   subject actions (Rename, Permissions). `null` for empty or
  //   multi-selection.
  // - selectedEntries: the full selection in stable order, used by
  //   bulk Delete. Length 0 = nothing selected; length 1 = same item
  //   as selectedEntry; length N = a multi-select.
  const [selectedEntry, setSelectedEntry] = useState<FileEntry | null>(null)
  const [selectedEntries, setSelectedEntries] = useState<FileEntry[]>([])
  // Directory-listing counts surfaced by DirectoryView and fed back
  // into the bottom StatusBar (e.g. "42 of 48 items"). `visible` is
  // post-filter (show-hidden toggle etc.); `total` is the raw entry
  // count. null = not currently in directory mode, so the status bar
  // omits the item metric entirely.
  const [dirCounts, setDirCounts] = useState<{ visible: number; total: number } | null>(null)
  // When the user switches from a folder listing to the file editor
  // we unmount DirectoryView, but its last reported counts would
  // otherwise stay pinned in the status bar. Drop the metric so it
  // matches what's actually on screen.
  const inEditorView = !!activeFile && !activeFile.is_dir
  useEffect(() => {
    if (inEditorView && dirCounts !== null) setDirCounts(null)
  }, [inEditorView, dirCounts])

  // Details panel visibility, persisted across sessions so the user's
  // preference sticks. We default to "shown" because a first-time visitor
  // benefits from seeing what's available; once they hide it, we honour
  // that choice on subsequent loads.
  const DETAILS_KEY = 'mountpad:workspace:details'
  const [showDetails, setShowDetails] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    const raw = window.localStorage.getItem(DETAILS_KEY)
    return raw === null ? true : raw === '1'
  })
  const toggleDetails = useCallback(() => {
    setShowDetails((prev) => {
      const next = !prev
      try { window.localStorage.setItem(DETAILS_KEY, next ? '1' : '0') } catch { /* quota */ }
      return next
    })
  }, [])

  const dirty = content !== origContent && !!activeFile && !activeFile.is_dir
  useDirty(dirty)

  useEffect(() => { setStatus(dirty ? 'dirty' : (activeFile ? 'idle' : 'idle')) }, [dirty, activeFile])
  useEffect(() => { setStatusLabel(status === 'dirty' ? 'Unsaved changes' : status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? 'Error' : '') }, [status])

  // navigateToFolder lands the workspace on a folder identified by its
  // path relative to the mount root. Used by the breadcrumbs in both the
  // file toolbar and the directory view header so the user can pop up to
  // any parent in one click. We clear `activeFile` so the editor swaps
  // back to the DirectoryView for that folder; the URL-sync effect then
  // pushes a regular history entry, keeping browser back/forward in sync.
  const navigateToFolder = useCallback((folderPath: string) => {
    if (!activeMount) return
    setActiveFile(undefined)
    setActiveDir(folderPath)
  }, [activeMount])

  const openFile = useCallback(async (entry: FileEntry) => {
    if (!activeMount) return
    setActiveFile(entry)
    // For a folder we also move the working directory there: that way the
    // "+ File / + Folder" toolbar actions and the DirectoryView both target
    // the folder the user just opened, not whatever directory was selected
    // before. Files inherit the working directory from their parent instead.
    if (entry.is_dir) {
      setActiveDir(entry.path)
      return
    }
    const parent = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : ''
    setActiveDir(parent)
    setLoadingFile(true)
    try {
      const res = await fsApi(activeMount.id).read(entry.path)
      if (res.is_binary) {
        setContent('')
        setOrigContent('')
        setStatus('error')
        setStatusLabel('Binary file (preview not supported)')
        return
      }
      setContent(res.content ?? '')
      setOrigContent(res.content ?? '')
      setChecksum(res.checksum ?? '')
      setMtime(res.modified_at)
      setStatus('idle')
    } catch (e: unknown) {
      setStatus('error')
      setStatusLabel(e instanceof HttpError ? `Open failed (${e.status})` : 'Open failed')
    } finally { setLoadingFile(false) }
  }, [activeMount])

  const save = useCallback(async () => {
    if (!activeMount || !activeFile || activeFile.is_dir) return
    setStatus('saving'); setStatusLabel('Saving…')
    try {
      const res = await fsApi(activeMount.id).write({
        path: activeFile.path,
        content,
        expected_checksum: checksum || undefined,
        expected_mtime: mtime || undefined,
      }) as { checksum: string; modified_at: string }
      setChecksum(res.checksum); setMtime(res.modified_at)
      setOrigContent(content); setStatus('saved'); setStatusLabel('Saved')
      setExplorerKey((k) => k + 1)
    } catch (e: unknown) {
      setStatus('error')
      if (e instanceof HttpError && e.status === 409) setStatusLabel('Conflict: file changed elsewhere')
      else setStatusLabel('Save failed')
    }
  }, [activeMount, activeFile, content, checksum, mtime])

  // Ctrl+S / Cmd+S → save the current file. The shortcut is only armed when
  // there's something to save and we're not already saving, so accidental
  // double-saves are impossible.
  useSaveShortcut(() => { if (dirty && status !== 'saving') void save() }, {
    enabled: !!activeFile && !activeFile.is_dir,
  })

  const submitCreateFile = async () => {
    if (!activeMount || !newName.trim()) return
    const target = activeDir ? `${activeDir}/${newName.trim()}` : newName.trim()
    await fsApi(activeMount.id).createFile({ path: target, content: '' })
    setShowCreateFile(false); setNewName(''); setExplorerKey((k) => k + 1)
  }
  const submitCreateDir = async () => {
    if (!activeMount || !newName.trim()) return
    const target = activeDir ? `${activeDir}/${newName.trim()}` : newName.trim()
    await fsApi(activeMount.id).createDir(target)
    setShowCreateDir(false); setNewName(''); setExplorerKey((k) => k + 1)
  }
  // actionTarget resolves which entry Rename should operate on. Only
  // two cases qualify:
  //   1. A DirectoryView selection of exactly one entry.
  //   2. A file currently being edited (activeFile is a file).
  // Browsing into a folder via the sidebar/breadcrumb does NOT make
  // that folder a target — renaming the folder you are *inside*
  // belongs to the breadcrumb leaf pencil instead, where the action
  // is visually unambiguous.
  const actionTarget = useMemo<FileEntry | null>(() => {
    if (selectedEntry) return selectedEntry
    if (activeFile && !activeFile.is_dir) return activeFile
    return null
  }, [selectedEntry, activeFile])
  // Rename only ever makes sense with a single subject. Delete works
  // for both single and bulk, so it follows the wider selectedEntries
  // array (with the open file as a fallback when nothing is selected).
  const canRename = !!actionTarget
  const deleteSubjects = useMemo<FileEntry[]>(() => {
    if (selectedEntries.length > 0) return selectedEntries
    if (actionTarget) return [actionTarget]
    return []
  }, [selectedEntries, actionTarget])
  const canDelete = deleteSubjects.length > 0

  // Drop any DirectoryView selection whenever the listing context shifts
  // (different mount, or a different folder shown in the main pane). A
  // selection only makes sense for the folder currently on screen; once
  // we navigate away, leaving it set would let stale targets sneak into
  // Rename/Delete on the new folder's listing.
  const dirPath = activeFile?.path ?? activeDir
  useEffect(() => {
    setSelectedEntry(null)
    setSelectedEntries([])
  }, [activeMount?.id, dirPath])

  // The active rename/delete *subjects* are captured at the moment the
  // dialog opens, not derived live from selection. This lets the
  // breadcrumb pencil open the rename modal against the current folder
  // even when nothing is selected, and protects the in-flight operation
  // from a stray selection change made while the modal is open. Delete
  // is an array to support bulk operations from a multi-select.
  const [renameSubject, setRenameSubject] = useState<FileEntry | null>(null)
  const [deleteSubjectsState, setDeleteSubjectsState] = useState<FileEntry[]>([])
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // pendingFocus tells DirectoryView "select + cursor this path as
  // soon as it shows up in the next listing". Set after a rename so
  // the freshly-named row keeps the highlight the user just had,
  // instead of falling out of the selection when the refresh prunes
  // the now-stale old path. Cleared by DirectoryView via
  // onPendingFocusConsumed once the focus has been applied.
  const [pendingFocus, setPendingFocus] = useState<string | null>(null)

  // pendingRename tells FileExplorer "rebase any expanded paths
  // matching `from` onto `to` on the next refresh". Without this,
  // renaming a folder would snap its (and its descendants') open
  // branches shut because the stored expanded set still references
  // the pre-rename paths. Cleared by FileExplorer via
  // onPendingRenameConsumed once applied.
  const [pendingRename, setPendingRename] = useState<{ from: string; to: string } | null>(null)

  const openRenameDialog = (subject: FileEntry | null = actionTarget) => {
    if (!subject) return
    setRenameSubject(subject)
    setRenameValue(subject.name)
    setShowRename(true)
  }
  const submitRename = async () => {
    if (!activeMount || !renameSubject || !renameValue.trim()) return
    const from = renameSubject.path
    const newName = renameValue.trim()
    const parent = from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : ''
    const to = parent ? `${parent}/${newName}` : newName
    await fsApi(activeMount.id).rename(from, to)
    setShowRename(false); setRenameValue(''); setRenameSubject(null)
    // Carry the highlight onto the renamed entry instead of clearing
    // the selection blindly. The three checks below aren't mutually
    // exclusive — when the user clicked into a folder, activeFile
    // AND activeDir both point at the same path, so renaming it
    // needs to update both for the URL, breadcrumb and DirectoryView
    // listing to all converge on the new name.
    //   - activeFile match: swap the editor / opened entry to the
    //     renamed clone (keeps the editor open instead of bouncing
    //     the user back to the parent folder).
    //   - activeDir match: follow the working directory so the
    //     workspace doesn't strand itself on a now-stale path.
    //   - neither: the renamed entry is just highlighted in
    //     DirectoryView. Hand the new path to DirectoryView as a
    //     pendingFocus — it'll re-select + cursor that row once
    //     the refresh lands, and our onSelectionChange wiring will
    //     push selectedEntry back to a fresh FileEntry automatically.
    const hitsActiveFile = !!activeFile && activeFile.path === from
    const hitsActiveDir  = activeDir === from
    if (hitsActiveFile && activeFile) {
      setActiveFile({ ...activeFile, path: to, name: newName })
    }
    if (hitsActiveDir) {
      setActiveDir(to)
    }
    if (!hitsActiveFile && !hitsActiveDir) {
      setPendingFocus(to)
    }
    // Always hand the rename hint to FileExplorer so its persisted
    // expanded-folders set follows the path rewrite — even for file
    // renames, where the entry itself isn't in `expanded`, the call
    // is a cheap no-op (rewriteExpanded short-circuits when no path
    // matches the prefix).
    setPendingRename({ from, to })
    setExplorerKey((k) => k + 1)
  }

  // renameCurrentFolder is the breadcrumb-pencil hook: synthesise a
  // minimal FileEntry for activeDir and feed it to the rename flow.
  // We guard on activeDir being non-empty so the mount root never
  // accidentally becomes a rename target.
  const renameCurrentFolder = () => {
    if (!activeDir) return
    const slashIdx = activeDir.lastIndexOf('/')
    const name = slashIdx >= 0 ? activeDir.slice(slashIdx + 1) : activeDir
    openRenameDialog({
      name,
      path: activeDir,
      is_dir: true,
      size: 0,
      modified_at: '',
      mode: 0,
    })
  }

  // openDeleteDialog accepts either an explicit subject (legacy single-
  // entry call site) or falls back to the live `deleteSubjects` memo —
  // which itself already prefers a multi-selection over the open-file
  // fallback, so there's no further branching needed here.
  const openDeleteDialog = (subject?: FileEntry | null) => {
    const subjects = subject ? [subject] : deleteSubjects
    if (subjects.length === 0) return
    setDeleteSubjectsState(subjects)
    setDeleteRecursive(false)
    setDeleteError(null)
    setConfirmDelete(true)
  }
  // submitDelete walks every subject in parallel. The recursive
  // checkbox applies only to folders; flat files always use the basic
  // remove endpoint. We collect failures into a single human-readable
  // message instead of aborting on the first one, so a partial bulk
  // delete still surfaces what went wrong.
  const submitDelete = async () => {
    if (!activeMount || deleteSubjectsState.length === 0) return
    const targets = deleteSubjectsState
    const api = fsApi(activeMount.id)
    const results = await Promise.allSettled(targets.map((t) => {
      const recursive = t.is_dir && deleteRecursive
      return recursive ? api.deepRemove(t.path) : api.remove(t.path)
    }))
    const failed: { path: string; reason: string }[] = []
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const e = r.reason
        const reason = e instanceof HttpError ? `${e.status}` : String(e)
        failed.push({ path: targets[i].path, reason })
      }
    })
    if (failed.length > 0) {
      setDeleteError(
        failed.length === targets.length
          ? `Delete failed for every item (${failed[0].reason}).`
          : `Deleted ${targets.length - failed.length} of ${targets.length}; ${failed.length} failed.`,
      )
      // Refresh anyway so the successful deletes are reflected.
      setExplorerKey((k) => k + 1)
      return
    }
    setConfirmDelete(false)
    setDeleteRecursive(false)
    setDeleteSubjectsState([])
    setSelectedEntry(null)
    setSelectedEntries([])
    // If the open file was among the deleted, close the editor on it.
    if (activeFile && targets.some((t) => t.path === activeFile.path)) {
      setActiveFile(undefined)
    }
    setExplorerKey((k) => k + 1)
  }
  const closeDeleteDialog = () => {
    setConfirmDelete(false)
    setDeleteRecursive(false)
    setDeleteSubjectsState([])
    setDeleteError(null)
  }

  // ── URL sync ─────────────────────────────────────────────────────────
  //
  // The URL mirrors the workspace state so a refresh, copy-paste or browser
  // back/forward action all restore the same file or folder:
  //   /workspace                              → no mount selected
  //   /workspace/<slug>                       → mount selected, no file
  //   /workspace/<slug>/<file/or/dir/path>    → file/dir highlighted
  //
  // Path segments are URI-encoded individually so spaces, accents and unicode
  // names round-trip cleanly. The slash separator stays unencoded.

  const buildUrl = useCallback((mount?: MountPoint, entryPath?: string) => {
    if (!mount) return '/workspace'
    let url = '/workspace/' + encodeURIComponent(mount.slug)
    if (entryPath) url += '/' + entryPath.split('/').map(encodeURIComponent).join('/')
    return url
  }, [])

  const parseUrl = useCallback(() => {
    const pathname = window.location.pathname
    if (pathname === '/workspace' || pathname === '/workspace/' || pathname === '/') {
      return { slug: undefined as string | undefined, path: undefined as string | undefined }
    }
    if (!pathname.startsWith('/workspace/')) {
      return { slug: undefined, path: undefined }
    }
    const rest = pathname.slice('/workspace/'.length)
    const slashIdx = rest.indexOf('/')
    if (slashIdx < 0) return { slug: decodeURIComponent(rest), path: undefined }
    return {
      slug: decodeURIComponent(rest.slice(0, slashIdx)),
      path: rest.slice(slashIdx + 1).split('/').map(decodeURIComponent).join('/'),
    }
  }, [])

  // Restore from the parent directory listing so we recover the *real* entry
  // (with proper is_dir, mode, mtime, etc.) instead of stubbing it. If the
  // entry was deleted between sessions, we silently degrade to "open the
  // closest parent directory we could find".
  const restoreFromUrl = useCallback(async (mount: MountPoint, path: string) => {
    const slashIdx = path.lastIndexOf('/')
    const parent = slashIdx >= 0 ? path.slice(0, slashIdx) : ''
    const name = slashIdx >= 0 ? path.slice(slashIdx + 1) : path
    try {
      const res = await fsApi(mount.id).list(parent)
      const entry = res.entries.find((e) => e.name === name)
      if (!entry) { setActiveDir(parent); return }
      if (entry.is_dir) {
        setActiveDir(entry.path)
        setActiveFile(entry)
      } else {
        await openFile(entry)
      }
    } catch {
      setActiveDir('')
    }
  }, [openFile])

  // 1. Initial restore: parse the URL once we have the mount list. If the
  //    URL is empty or references an unknown slug, fall back to the first
  //    available mount so the workspace is never blank by accident.
  useEffect(() => {
    if (urlInitialized.current || mountPoints.length === 0) return
    urlInitialized.current = true

    const { slug, path } = parseUrl()
    const mount = (slug && mountPoints.find((m) => m.slug === slug)) || mountPoints[0]
    if (!mount) return
    setActiveMount(mount)
    if (path) void restoreFromUrl(mount, path)
  }, [mountPoints, parseUrl, restoreFromUrl])

  // 2. Reflect every state change back into the URL, *pushing* a history
  //    entry per navigation so the browser back / forward buttons walk
  //    through explorer states instead of jumping back to the previous
  //    page. Two refinements keep history readable:
  //      a. The first sync after the URL → state restore uses
  //         `replaceState`, not push. This avoids polluting the stack
  //         with a synthetic "go here" entry on landing.
  //      b. The state → URL push is debounced (≈60 ms) so a single user
  //         action that updates several pieces of state (mount + dir +
  //         file from `restoreFromUrl`, for instance) collapses into one
  //         history entry, not three.
  //      c. When a `popstate` brings the URL back to a target our state
  //         is converging towards, the equality check below short-circuits
  //         the sync — no spurious push, no recursive loop.
  const firstUrlSyncDone = useRef(false)
  useEffect(() => {
    if (!urlInitialized.current) return
    const t = window.setTimeout(() => {
      const entryPath = activeFile?.path || activeDir || undefined
      const target = buildUrl(activeMount, entryPath)
      if (target === window.location.pathname) {
        firstUrlSyncDone.current = true
        return
      }
      if (firstUrlSyncDone.current) {
        window.history.pushState(null, '', target)
      } else {
        window.history.replaceState(null, '', target)
        firstUrlSyncDone.current = true
      }
    }, 60)
    return () => window.clearTimeout(t)
  }, [activeMount, activeFile, activeDir, buildUrl])

  // 2b. Browser back / forward → re-parse the URL and reconcile the
  //     workspace state. The sync effect (2) is debounced + does an
  //     equality check against `window.location.pathname`, so it stays
  //     quiet while we drive state from `popstate`: the popped URL is
  //     already the URL we'd otherwise have written.
  //
  //     We deliberately ignore popstates that land outside `/workspace`
  //     because that means the user navigated back to a different page
  //     entirely (Settings, Profile…) and Inertia will swap the page
  //     component for us; touching local state would only race with the
  //     unmount.
  useEffect(() => {
    if (!urlInitialized.current) return
    const onPop = () => {
      if (!window.location.pathname.startsWith('/workspace')) return
      const { slug, path } = parseUrl()
      const mount = slug ? mountPoints.find((m) => m.slug === slug) : undefined
      if (!mount) {
        setActiveMount(undefined)
        setActiveFile(undefined)
        setActiveDir('')
        return
      }
      if (mount.id !== activeMount?.id) {
        setActiveMount(mount)
      }
      if (path) {
        void restoreFromUrl(mount, path)
      } else {
        setActiveFile(undefined)
        setActiveDir('')
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [mountPoints, parseUrl, restoreFromUrl, activeMount])

  // 3. If the active mount just got marked as forbidden, fall back to the
  //    next visible one (or clear the workspace if none are left). Without
  //    this, the main panel keeps an explorer for a mount we already hid
  //    from the sidebar.
  useEffect(() => {
    if (activeMount && forbiddenMountIds.has(activeMount.id)) {
      const fallback = mountPoints[0]
      setActiveMount(fallback)
      setActiveFile(undefined)
      setActiveDir('')
    }
  }, [activeMount, forbiddenMountIds, mountPoints])

  // First-admin setup is enforced server-side: by the time WorkspacePage
  // mounts, either at least one user exists or SAFE_MODE is on. We don't
  // try to render a "no users" welcome; the operator is on /setup instead.

  // Compose the page-specific left half of the bottom status bar.
  // Two metric chips at most: an item counter (only meaningful while
  // a folder is open) and a selection counter (only while there's
  // something selected). We pluralise inline rather than pulling in
  // an i18n util so the bar stays self-contained.
  const statusMetrics = useMemo<React.ReactNode>(() => {
    const chips: React.ReactNode[] = []
    if (dirCounts) {
      const { visible, total } = dirCounts
      const itemsLabel = visible <= 1 ? 'item' : 'items'
      chips.push(
        <SB.Metric key="items" title={total === visible ? undefined : `${total - visible} hidden`}>
          {total === visible
            ? <><b>{visible}</b> {itemsLabel}</>
            : <><b>{visible}</b> of <b>{total}</b> {itemsLabel}</>}
        </SB.Metric>,
      )
    }
    if (selectedEntries.length > 0) {
      chips.push(
        <SB.Metric key="selected">
          <b>{selectedEntries.length}</b> selected
        </SB.Metric>,
      )
    }
    if (chips.length === 0) return null
    // Interleave bullet separators between chips so the bar reads
    // "42 items · 3 selected" without each chip having to know
    // whether it's the last one.
    const out: React.ReactNode[] = []
    chips.forEach((c, i) => {
      if (i > 0) out.push(<SB.Sep key={`sep-${i}`} />)
      out.push(c)
    })
    return out
  }, [dirCounts, selectedEntries.length])

  if (!mountPoints.length) {
    return (
      <AppShell
        statusMetrics={statusMetrics}
        main={
          <WelcomeScreen
            title="No mounts yet"
            lead={
              user?.is_admin
                ? <>MountPad is online but has nothing to show: there's no host directory exposed to the workspace yet. Define one to get started.</>
                : <>This instance has no mounts configured. Ask an administrator to set one up for your account.</>
            }
            steps={user?.is_admin ? [
              {
                number: 1,
                title: 'Pick a host path',
                description: <>Choose an absolute directory inside the container, most often a subfolder of <code>/storage</code>.</>,
              },
              {
                number: 2,
                title: 'Give it a slug and a name',
                description: <>The slug is URL-safe (<code>a-z0-9-</code>); the name is what shows up in the sidebar.</>,
              },
              {
                number: 3,
                title: 'Set a default permission mode',
                description: <>It controls who can read, write, and execute newly created files when no explicit ACL is set.</>,
              },
            ] : undefined}
            actions={
              user?.is_admin ? (
                <Button variant="primary" onClick={() => (window.location.href = '/settings/mount-points')}>Configure mounts</Button>
              ) : null
            }
          />
        }
      />
    )
  }

  return (
    <>
      <AppShell
        statusMetrics={statusMetrics}
        sidebar={
          <MountPointSidebar
            mountPoints={mountPoints}
            activeMountId={activeMount?.id}
            onSelect={(mp) => { setActiveMount(mp); setActiveFile(undefined); setActiveDir('') }}
          />
        }
        explorer={
          activeMount ? (
            <FileExplorer
              mountId={activeMount.id}
              activePath={activeFile?.path || activeDir}
              refreshKey={explorerKey}
              onOpenFile={openFile}
              onChangeDir={setActiveDir}
              onCreateFile={() => setShowCreateFile(true)}
              onCreateDir={() => setShowCreateDir(true)}
              onRootForbidden={markForbidden}
              /* Drag-and-drop moves into a sidebar folder reuse the
                 same refresh path as every other mutation, so the
                 source listing AND the destination tree both re-fetch. */
              onAfterMutation={() => setExplorerKey((k) => k + 1)}
              /* Carry the rename across the refresh so the sidebar's
                 persisted expanded-folders set follows the new path
                 instead of stranding the user with a snapped-shut
                 subtree. */
              pendingRename={pendingRename}
              onPendingRenameConsumed={() => setPendingRename(null)}
            />
          ) : null
        }
        main={
          <>
            <FileToolbar
              /* Hand the toolbar both the location and whether it points
                 at an editable file so its breadcrumb stays accurate
                 in the directory view AND the file-editor view. Folder
                 segments are clickable through onNavigateFolder. */
              filePath={activeFile?.path || activeDir || ''}
              isFile={!!activeFile && !activeFile.is_dir}
              mountName={activeMount?.name}
              onNavigateFolder={navigateToFolder}
              status={status}
              statusLabel={statusLabel}
              canSave={dirty}
              onSave={save}
              onRename={() => openRenameDialog()}
              onDelete={() => openDeleteDialog()}
              onPermissions={() => activeFile && setShowPerms(true)}
              canRename={canRename}
              canDelete={canDelete}
              deleteCount={deleteSubjects.length}
              /* The pencil on the breadcrumb leaf is the one and only
                 way to rename the folder the workspace is currently
                 displaying. We pass it only in folder-listing mode so
                 it never shows up next to a file leaf. */
              onRenameLeaf={
                !!activeDir && (!activeFile || activeFile.is_dir)
                  ? renameCurrentFolder
                  : undefined
              }
              showDetails={showDetails}
              onToggleDetails={toggleDetails}
            />
            <S.MainBody>
              <S.EditorWrap>
                {loadingFile ? <LoadingState label="Loading file…" />
                  : activeMount && (!activeFile || activeFile.is_dir) ? (
                      <DirectoryView
                        mountId={activeMount.id}
                        /* Prefer activeFile (when it's a folder) so the
                           DirectoryView stays in sync with the side-tree
                           highlight. Fall back to activeDir for the case
                           where a toolbar-breadcrumb click cleared
                           activeFile but parked us on a specific
                           folder. */
                        path={activeFile?.path || activeDir || ''}
                        refreshKey={explorerKey}
                        onOpenEntry={openFile}
                        /* DirectoryView owns the multi-selection model
                           internally and bubbles two signals up:
                           - onSelectionChange: the primary entry when
                             exactly one item is selected (drives Rename
                             and Permissions).
                           - onSelectedEntriesChange: the full array,
                             feeding the bulk-Delete affordance and
                             label ("Delete N items"). */
                        onSelectionChange={setSelectedEntry}
                        onSelectedEntriesChange={setSelectedEntries}
                        /* onNavigatePath powers the synthetic ".."
                           parent entry rendered at the top of the
                           folder listing. */
                        onNavigatePath={navigateToFolder}
                        /* Drag-and-drop moves bump the shared key so
                           both panes re-fetch from the source of truth. */
                        onAfterMutation={() => setExplorerKey((k) => k + 1)}
                        /* pendingFocus is set by the rename flow so
                           the renamed row regains the highlight
                           after the listing refresh. DirectoryView
                           clears it once applied. */
                        pendingFocus={pendingFocus}
                        onPendingFocusConsumed={() => setPendingFocus(null)}
                        /* Counts feed the discrete bottom status
                           bar: visible (post-hidden-filter) vs.
                           total raw count from the backend. */
                        onCountsChange={setDirCounts}
                      />
                    )
                  : activeFile && !activeFile.is_dir
                    ? <TextEditor value={content} onChange={setContent} status={statusLabel} fileName={activeFile.path} />
                    : <EmptyState title="Open a file" description="Select a file in the explorer to start editing." />
                }
              </S.EditorWrap>
              {showDetails && (
                <>
                  {/* Backdrop is invisible on desktop (display:none in
                      styled.ts) and only kicks in below `lg`, where the
                      details panel slides over the editor. Tapping it
                      closes the panel just like the toolbar toggle. */}
                  <S.DetailsBackdrop onClick={toggleDetails} />
                  <FileDetailsPanel entry={activeFile} mountName={activeMount?.name} />
                </>
              )}
            </S.MainBody>
          </>
        }
      />

      <Modal
        open={showCreateFile}
        title="Create file"
        onClose={() => setShowCreateFile(false)}
        onSubmit={submitCreateFile}
        footer={<><Button variant="ghost" onClick={() => setShowCreateFile(false)}>Cancel</Button><Button variant="primary" onClick={submitCreateFile}>Create</Button></>}
      >
        <Input label="File name" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} />
      </Modal>

      <Modal
        open={showCreateDir}
        title="Create folder"
        onClose={() => setShowCreateDir(false)}
        onSubmit={submitCreateDir}
        footer={<><Button variant="ghost" onClick={() => setShowCreateDir(false)}>Cancel</Button><Button variant="primary" onClick={submitCreateDir}>Create</Button></>}
      >
        <Input label="Folder name" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} />
      </Modal>

      <Modal
        open={showRename}
        title="Rename"
        onClose={() => setShowRename(false)}
        onSubmit={submitRename}
        footer={<><Button variant="ghost" onClick={() => setShowRename(false)}>Cancel</Button><Button variant="primary" onClick={submitRename}>Rename</Button></>}
      >
        <Input label="New name" autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
      </Modal>

      {/* Delete modal: single-subject and bulk share the same shell.
          The header, summary line and confirm-button label all adapt
          to the count, so a multi-select that becomes a single-delete
          (via a deselect mid-dialog) still reads correctly. The
          recursive checkbox only shows when at least one folder is in
          the selection — flat files don't need it. */}
      {(() => {
        const subjects = deleteSubjectsState
        const n = subjects.length
        const folderCount = subjects.reduce((acc, s) => acc + (s.is_dir ? 1 : 0), 0)
        const fileCount = n - folderCount
        const hasFolder = folderCount > 0
        const single = n === 1 ? subjects[0] : null
        const title =
          n > 1 ? `Delete ${n} items`
            : single?.is_dir ? 'Delete folder'
              : 'Delete file'
        const confirmLabel = hasFolder && deleteRecursive
          ? (n > 1 ? `Delete ${n} items recursively` : 'Delete recursively')
          : (n > 1 ? `Delete ${n} items` : 'Delete')
        return (
          <Modal
            open={confirmDelete}
            title={title}
            onClose={closeDeleteDialog}
            footer={<>
              <Button variant="ghost" onClick={closeDeleteDialog}>Cancel</Button>
              <Button variant="danger" onClick={submitDelete} disabled={n === 0}>{confirmLabel}</Button>
            </>}
          >
            <S.DeleteMessage>
              {single
                ? (single.is_dir
                    ? <>Delete the folder <code>/{single.path}</code>?</>
                    : <>Delete the file <code>/{single.path}</code>?</>)
                : <>
                    Delete <strong>{n} items</strong>
                    {folderCount > 0 && fileCount > 0 && <> ({folderCount} folder{folderCount === 1 ? '' : 's'}, {fileCount} file{fileCount === 1 ? '' : 's'})</>}
                    {folderCount > 0 && fileCount === 0 && <> ({folderCount} folder{folderCount === 1 ? '' : 's'})</>}
                    {folderCount === 0 && fileCount > 0 && <> ({fileCount} file{fileCount === 1 ? '' : 's'})</>}?
                  </>}
            </S.DeleteMessage>
            {n > 1 && (
              <S.DeleteList>
                {subjects.map((s) => (
                  <li key={s.path} className={s.is_dir ? 'dir' : 'file'} title={`/${s.path}`}>/{s.path}</li>
                ))}
              </S.DeleteList>
            )}
            {hasFolder ? (
              <S.DeleteOption $danger={deleteRecursive}>
                <input
                  type="checkbox"
                  checked={deleteRecursive}
                  onChange={(e) => setDeleteRecursive(e.target.checked)}
                />
                <div>
                  <strong>Also delete folder contents recursively</strong>
                  <p>
                    {n > 1
                      ? <>Without this, only empty folders can be deleted; any non-empty folder in the selection will return an error. Recursive delete cannot be undone.</>
                      : <>Without this, only empty folders can be deleted; non-empty folders return an error. Recursive delete cannot be undone.</>}
                  </p>
                </div>
              </S.DeleteOption>
            ) : (
              <S.DeleteHint>
                {n > 1 ? 'This cannot be undone. Every selected file is unlinked from the filesystem.' : 'This cannot be undone. The file is unlinked from the filesystem.'}
              </S.DeleteHint>
            )}
            {deleteError && <S.DeleteError>{deleteError}</S.DeleteError>}
          </Modal>
        )
      })()}

      {activeFile && activeMount && (
        <PermissionsPanel
          open={showPerms}
          mountId={activeMount.id}
          path={activeFile.path}
          canChown={!!user?.is_admin}
          onClose={() => setShowPerms(false)}
          onSaved={() => setExplorerKey((k) => k + 1)}
        />
      )}
    </>
  )
}

export default WorkspacePage
