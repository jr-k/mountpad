import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePage } from '@inertiajs/react'
import { AppShell } from '@/layouts/AppShell'
import { MountPointSidebar } from '@/components/MountPointSidebar'
import { FileExplorer } from '@/components/FileExplorer'
import { DirectoryView } from '@/components/DirectoryView'
import { TextEditor } from '@/components/TextEditor'
import { HexEditor } from '@/components/HexEditor'
import { MediaPreview } from '@/components/MediaPreview'
import type { MediaKind } from '@/components/MediaPreview'
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
import type { UploadFileResult } from '@/lib/api'
import type { MoveError } from '@/lib/dnd'
import { useDirty } from '@/hooks/useDirty'
import { useSaveShortcut } from '@/hooks/useSaveShortcut'
import type { FileEntry, MountPoint } from '@/types/files'
import type { SharedProps } from '@/types/inertia'

import * as S from './styled'

type EditorStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

// downloadErrorMessage maps the backend's terse plaintext error
// responses into something a human can act on. The server already
// uses stable phrases (see writeError in handlers/fs.go), so we
// match on them rather than relying on status codes alone - a
// "403" can mean three different things here.
function downloadErrorMessage(status: number, body: string, subjects: { name?: string; path: string }[]): string {
  const subjectLabel = subjects.length === 1
    ? (subjects[0].name || subjects[0].path || 'this item')
    : `${subjects.length} items`
  switch (body) {
    case 'symlink not allowed':
      return `“${subjectLabel}” is a symbolic link. The server is configured to refuse symlink downloads to prevent leaking files from outside the mount point.`
    case 'permission denied':
      return `You don't have permission to download “${subjectLabel}”.`
    case 'not found':
      return `“${subjectLabel}” was not found. It may have been moved or deleted by someone else.`
    case 'manifest protected':
      return `“${subjectLabel}” is an internal mountpad metadata file and cannot be downloaded.`
    case 'invalid path':
      return `The path for “${subjectLabel}” is invalid.`
    default:
      return body || `Download failed (HTTP ${status}).`
  }
}

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

  // Persist the active mount across Inertia page navigations (e.g.
  // Workspace → Settings → Workspace). Without this, switching to
  // the Access or Mounts page and coming back would lose the
  // mount selection and dump the user on the first mount.
  const MOUNT_KEY = 'mountpad:workspace:activeMount'
  const [activeMount, setActiveMountRaw] = useState<MountPoint | undefined>(undefined)
  const setActiveMount = useCallback((mp: MountPoint | undefined) => {
    setActiveMountRaw(mp)
    try {
      if (mp) window.localStorage.setItem(MOUNT_KEY, String(mp.id))
      else window.localStorage.removeItem(MOUNT_KEY)
    } catch { /* quota */ }
  }, [])
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
  // Binary preview state. Populated when openFile resolves on a
  // non-text file: the hex view renders `binaryBytes`, and
  // `binaryMeta` carries the original-on-disk size + truncation
  // flag so the header can say "showing 256 KiB of 1.3 MiB".
  // Both are cleared when a text file (or no file) takes over so
  // the previous binary doesn't bleed into the next selection.
  const [binaryBytes, setBinaryBytes] = useState<Uint8Array | null>(null)
  const [binaryMeta, setBinaryMeta] = useState<{ size?: number; truncated?: boolean } | null>(null)
  // mediaPreview short-circuits the hex view for binary files the
  // browser can render natively (images, videos, audio, pdf). When
  // set, the editor pane renders a <MediaPreview> pointed at the
  // /raw endpoint instead of decoding the (potentially huge) file
  // bytes through JSON+base64. Cleared whenever a non-media file
  // takes over so a previous preview never bleeds into the next.
  const [mediaPreview, setMediaPreview] = useState<{ kind: MediaKind; size?: number } | null>(null)
  // isSymlink is sourced from the Read response and flips the text
  // editor into read-only mode (the write endpoint won't mutate
  // through a symlink, so letting the user type would just queue a
  // guaranteed save failure).
  const [isSymlink, setIsSymlink] = useState(false)

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

  // Symlinks are read-only: the write endpoint refuses to mutate
  // through them, so we force dirty=false even if content somehow
  // drifts from origContent (defensive - the TextEditor is already
  // non-editable). Keeps Cmd+S a no-op and greys the Save button.
  const dirty = content !== origContent && !!activeFile && !activeFile.is_dir && !isSymlink
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

  // openFile takes an optional `mountOverride` so the URL-restore path
  // (which sets activeMount and immediately wants to open a file in
  // the SAME tick) can pass the freshly-resolved mount instead of
  // reading the closure's stale activeMount value, which is still
  // null until React commits the next render. Every other caller
  // (sidebar, explorer, breadcrumb) just calls openFile(entry) and
  // relies on activeMount being already set.
  const openFile = useCallback(async (entry: FileEntry, mountOverride?: MountPoint) => {
    const mount = mountOverride ?? activeMount
    if (!mount) return
    setActiveFile(entry)
    // For a folder we also move the working directory there: that way the
    // "+ File / + Folder" toolbar actions and the DirectoryView both target
    // the folder the user just opened, not whatever directory was selected
    // before. Files inherit the working directory from their parent instead.
    if (entry.is_dir) {
      setActiveDir(entry.path)
      return
    }
    // Optimistic readonly flip: if the listing already flagged this
    // entry as a symlink, the editor renders in read-only mode the
    // moment we set activeFile (no flash of writable editor before
    // the read response comes back). The follow-up Read response
    // re-confirms via res.is_symlink in case the entry changed on
    // disk between list and read.
    setIsSymlink(!!entry.is_symlink)
    const parent = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : ''
    setActiveDir(parent)
    setLoadingFile(true)
    try {
      const res = await fsApi(mount.id).read(entry.path)
      setIsSymlink(!!res.is_symlink || !!entry.is_symlink)
      if (res.is_binary) {
        // Text-editor state is cleared so a previous textual file
        // doesn't leak into the binary view (and so `dirty` resolves
        // to false: both hex and media previews are read-only).
        setContent('')
        setOrigContent('')
        setChecksum('')
        setMtime(res.modified_at)
        setStatus('idle')
        setStatusLabel('')
        if (res.media_kind) {
          // Media short-circuit: skip hex altogether. The component
          // points at /raw, which streams the bytes with the right
          // Content-Type so the browser renders it natively.
          setBinaryBytes(null)
          setBinaryMeta(null)
          setMediaPreview({ kind: res.media_kind, size: res.size })
          return
        }
        setMediaPreview(null)
        if (res.content_base64) {
          // atob → byte string → Uint8Array. Cheap and correct for
          // payloads under our 256 KiB server cap; for larger
          // previews we'd switch to a chunked decoder.
          const bin = atob(res.content_base64)
          const bytes = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
          setBinaryBytes(bytes)
        } else {
          setBinaryBytes(new Uint8Array(0))
        }
        setBinaryMeta({ size: res.size, truncated: res.truncated })
        return
      }
      // Text path: clear any leftover binary preview from a prior
      // selection so the hex / media view doesn't briefly flash
      // before the text editor takes over.
      setBinaryBytes(null)
      setBinaryMeta(null)
      setMediaPreview(null)
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
  // that folder a target - renaming the folder you are *inside*
  // belongs to the breadcrumb leaf pencil instead, where the action
  // is visually unambiguous.
  const actionTarget = useMemo<FileEntry | null>(() => {
    if (selectedEntry) return selectedEntry
    if (activeFile && !activeFile.is_dir) return activeFile
    return null
  }, [selectedEntry, activeFile])
  // The toolbar Rename button is reserved for a *DirectoryView*
  // single-selection. When the workspace is parked on an open file
  // (editor mode) the breadcrumb pencil already covers renaming the
  // file, so duplicating the affordance with a second button on the
  // right would just add visual noise. Delete still works for both
  // single and bulk targets, hence the wider deleteSubjects below.
  const canRename = !!selectedEntry
  const deleteSubjects = useMemo<FileEntry[]>(() => {
    if (selectedEntries.length > 0) return selectedEntries
    if (actionTarget) return [actionTarget]
    return []
  }, [selectedEntries, actionTarget])
  const canDelete = deleteSubjects.length > 0
  // Download resolves to the same subject set as Delete: a current
  // DirectoryView selection (single or bulk) takes precedence, and
  // when nothing is selected we fall back to the actionTarget so the
  // editor-mode toolbar can grab the currently open file (text OR
  // hex). The backend streams one file raw and zips anything else.
  const downloadSubjects = deleteSubjects
  const canDownload = downloadSubjects.length > 0
  // downloadError surfaces server-side rejections (symlink not
  // allowed, permission denied, missing path...) in a real modal
  // instead of the plaintext "symlink not allowed" page that the
  // browser would otherwise navigate to when `<a download>` follows
  // a non-2xx response.
  const [downloadError, setDownloadError] = useState<string | null>(null)

  // ── Upload + drag-and-drop ──────────────────────────────────────────
  // The Upload toolbar button proxies its click into a hidden file
  // input; drag-and-drop on the main panel uses the same uploadFiles
  // helper so both surfaces share the post-upload refresh, error
  // dialog, and conflict handling.
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadSummary, setUploadSummary] = useState<{
    results: UploadFileResult[]
    targetDir: string
  } | null>(null)
  // dragCounter copes with the way HTML5 DnD fires dragenter/dragleave
  // every time a drag crosses a child boundary. We track the net
  // depth so the overlay stays on until the user has really left the
  // panel, not just hovered over an inner element.
  const dragCounter = useRef(0)
  const [isDragging, setIsDragging] = useState(false)
  // uploadTargetDir is the current working directory the upload will
  // land in. We capture it as a memo so the overlay can echo the
  // path back to the user before they drop.
  const uploadTargetDir = activeDir
  const canUpload = !!activeMount
  const canDragDrop = canUpload

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    if (!activeMount) return
    const list = Array.from(files).filter((f) => f && f.name && f.name !== '.DS_Store')
    if (list.length === 0) return
    setUploading(true)
    try {
      const res = await fsApi(activeMount.id).upload(uploadTargetDir, list)
      // Only surface a modal if there's something to report (errors,
      // conflicts, or a multi-file batch). A single successful upload
      // refreshes silently - the new entry appearing in the listing
      // is feedback enough.
      const hasIssue = res.files.some((f) => f.status !== 'uploaded')
      if (hasIssue || res.files.length > 1) {
        setUploadSummary({ results: res.files, targetDir: res.path })
      }
      setExplorerKey((k) => k + 1)
    } catch (e: unknown) {
      const body = e instanceof HttpError && e.body ? e.body : 'Upload failed.'
      setUploadSummary({
        results: list.map((f) => ({ name: f.name, status: 'error', error: body })),
        targetDir: uploadTargetDir,
      })
    } finally {
      setUploading(false)
    }
  }, [activeMount, uploadTargetDir])

  const onPickFiles = useCallback(() => {
    if (!fileInputRef.current) return
    // Reset value first so re-selecting the same file fires the
    // change event again. Without this, picking foo.txt twice in a
    // row would only trigger the first upload.
    fileInputRef.current.value = ''
    fileInputRef.current.click()
  }, [])

  const onFileInputChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const fl = e.target.files
    if (fl && fl.length > 0) void uploadFiles(fl)
  }

  // Drag handlers attached to the main panel wrapper. We only react
  // when the drag actually carries files (not when it's a text/uri
  // drag from elsewhere in the page), and we always preventDefault
  // on the events so the browser doesn't navigate to the dropped
  // file when it lands.
  const dragCarriesFiles = (e: React.DragEvent) => {
    const types = e.dataTransfer?.types
    if (!types) return false
    for (let i = 0; i < types.length; i++) {
      if (types[i] === 'Files') return true
    }
    return false
  }
  const onDragEnter: React.DragEventHandler = (e) => {
    if (!canDragDrop || !dragCarriesFiles(e)) return
    e.preventDefault()
    dragCounter.current += 1
    if (dragCounter.current === 1) setIsDragging(true)
  }
  const onDragOver: React.DragEventHandler = (e) => {
    if (!canDragDrop || !dragCarriesFiles(e)) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }
  const onDragLeave: React.DragEventHandler = (e) => {
    if (!canDragDrop || !dragCarriesFiles(e)) return
    e.preventDefault()
    dragCounter.current = Math.max(0, dragCounter.current - 1)
    if (dragCounter.current === 0) setIsDragging(false)
  }
  const onDrop: React.DragEventHandler = (e) => {
    if (!canDragDrop) return
    e.preventDefault()
    dragCounter.current = 0
    setIsDragging(false)
    const files = e.dataTransfer?.files
    if (files && files.length > 0) void uploadFiles(files)
  }

  // ── Extract ─────────────────────────────────────────────────────────
  // The Extract button surfaces when the current single subject (a
  // single-selection in the directory view OR the open file in the
  // editor) is one of the archive formats the backend can unpack.
  // Detection is extension-based and case-insensitive to match the
  // server.
  const archiveExtensions = ['.zip', '.tar', '.tar.gz', '.tgz', '.tar.bz2', '.tbz', '.tbz2']
  const isArchiveName = (name: string): boolean => {
    const lower = name.toLowerCase()
    return archiveExtensions.some((ext) => lower.endsWith(ext))
  }
  const extractTarget = useMemo<FileEntry | null>(() => {
    if (selectedEntries.length === 1 && !selectedEntries[0].is_dir && isArchiveName(selectedEntries[0].name)) {
      return selectedEntries[0]
    }
    if (activeFile && !activeFile.is_dir && isArchiveName(activeFile.name)) {
      return activeFile
    }
    return null
  // archiveExtensions is a const reference so it's fine to omit; the
  // hooks-deps lint would also reject mutable arrays anyway.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEntries, activeFile])
  const canExtract = !!extractTarget && !uploading
  const [extractError, setExtractError] = useState<string | null>(null)

  // moveErrors collects per-entry rename failures bubbled up from
  // every drag-and-drop site (DirectoryView rows, FileExplorer
  // sidebar). Most common cause: a name collision in the destination
  // folder (backend rename refuses to clobber, returns 409). Without
  // this modal the drop would just silently no-op, leaving the user
  // wondering why nothing moved.
  const [moveErrors, setMoveErrors] = useState<MoveError[] | null>(null)
  const [extracting, setExtracting] = useState(false)
  const triggerExtract = useCallback(async () => {
    if (!activeMount || !extractTarget) return
    setExtracting(true)
    setExtractError(null)
    try {
      await fsApi(activeMount.id).extract(extractTarget.path)
      setExplorerKey((k) => k + 1)
    } catch (e: unknown) {
      const body = e instanceof HttpError && e.body ? e.body : ''
      const msg = body
        ? `Extract failed: ${body}.`
        : 'Extract failed. The archive may be malformed or the destination already exists.'
      setExtractError(msg)
    } finally {
      setExtracting(false)
    }
  }, [activeMount, extractTarget])
  const triggerDownload = useCallback(async () => {
    if (!activeMount || downloadSubjects.length === 0) return
    const paths = downloadSubjects.map((e) => e.path)
    const url = fsApi(activeMount.id).downloadUrl(paths)
    try {
      // Dry-run first: the backend runs the same validation the
      // real download would (ACL, manifest, symlink, existence) but
      // returns 204 without streaming a single byte. Cheap, and
      // means a download that's going to fail fails BEFORE the
      // browser commits to the navigation.
      const check = await fetch(url + '&check=1', { credentials: 'same-origin' })
      if (!check.ok) {
        const body = (await check.text()).trim()
        setDownloadError(
          downloadErrorMessage(check.status, body, downloadSubjects),
        )
        return
      }
    } catch {
      setDownloadError('Could not reach the server. Check your connection and try again.')
      return
    }
    // Hidden anchor instead of window.location: keeps the current
    // SPA navigation intact (no page replacement), and the explicit
    // `download` attribute nudges browsers that might otherwise try
    // to render the content inline (e.g. text/plain previews).
    const a = document.createElement('a')
    a.href = url
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [activeMount, downloadSubjects])

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
    // exclusive - when the user clicked into a folder, activeFile
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
    //     pendingFocus - it'll re-select + cursor that row once
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
    // expanded-folders set follows the path rewrite - even for file
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

  // renameLeaf dispatches the breadcrumb pencil based on what the
  // leaf actually points at:
  //   • file mode  → rename the open file (the activeFile entry).
  //   • dir mode   → rename the current folder (activeDir).
  // Returns undefined when there is no leaf to rename so the
  // breadcrumb hides the pencil entirely instead of rendering a
  // dead button.
  const renameLeaf: (() => void) | undefined = (() => {
    if (activeFile && !activeFile.is_dir) return () => openRenameDialog(activeFile)
    if (activeDir) return renameCurrentFolder
    return undefined
  })()

  // openDeleteDialog accepts either an explicit subject (legacy single-
  // entry call site) or falls back to the live `deleteSubjects` memo -
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
        // mount is passed through so openFile doesn't read the
        // (still-null) activeMount closure value on the very first
        // render after a refresh - that was making file URLs fall
        // back to the explorer view on reload.
        await openFile(entry, mount)
      }
    } catch {
      setActiveDir('')
    }
  }, [openFile])

  // 1. Initial restore: parse the URL once we have the mount list.
  //    Priority chain:
  //      a. URL slug - explicit deep link takes precedence.
  //      b. localStorage saved mount - restores the "last active"
  //         when the user navigates back from Settings.
  //      c. First available mount - so the workspace is never blank.
  useEffect(() => {
    if (urlInitialized.current || mountPoints.length === 0) return
    urlInitialized.current = true

    const { slug, path } = parseUrl()
    let mount: MountPoint | undefined
    if (slug) mount = mountPoints.find((m) => m.slug === slug)
    if (!mount) {
      try {
        const savedId = window.localStorage.getItem(MOUNT_KEY)
        if (savedId) mount = mountPoints.find((m) => m.id === Number(savedId))
      } catch { /* storage unavailable */ }
    }
    if (!mount) mount = mountPoints[0]
    if (!mount) return
    setActiveMount(mount)
    if (path) void restoreFromUrl(mount, path)
  }, [mountPoints, parseUrl, restoreFromUrl, setActiveMount])

  // 2. Push a history entry for every in-workspace navigation so that
  //    the browser back / forward buttons walk through explorer states.
  //    We preserve `window.history.state` (Inertia's page descriptor)
  //    so that popstate on these entries still lets Inertia render the
  //    correct page component.
  const firstUrlSyncDone = useRef(false)
  const popNavigation = useRef(false)
  useEffect(() => {
    if (!urlInitialized.current) return
    const t = window.setTimeout(() => {
      const entryPath = activeFile?.path || activeDir || undefined
      const target = buildUrl(activeMount, entryPath)
      if (target === window.location.pathname) {
        firstUrlSyncDone.current = true
        return
      }
      if (!firstUrlSyncDone.current || popNavigation.current) {
        window.history.replaceState(window.history.state, '', target)
        firstUrlSyncDone.current = true
        popNavigation.current = false
      } else {
        window.history.pushState(window.history.state, '', target)
      }
    }, 60)
    return () => window.clearTimeout(t)
  }, [activeMount, activeFile, activeDir, buildUrl])

  // 2b. Browser back / forward - re-parse the popped URL and reconcile
  //     workspace state. We flag `popNavigation` so effect (2) uses
  //     replaceState instead of pushing yet another entry.
  useEffect(() => {
    if (!urlInitialized.current) return
    const onPop = () => {
      if (!window.location.pathname.startsWith('/workspace')) return
      popNavigation.current = true
      const { slug, path } = parseUrl()
      let mount: MountPoint | undefined
      if (slug) mount = mountPoints.find((m) => m.slug === slug)
      if (!mount) {
        try {
          const savedId = window.localStorage.getItem(MOUNT_KEY)
          if (savedId) mount = mountPoints.find((m) => m.id === Number(savedId))
        } catch { /* storage unavailable */ }
      }
      if (!mount) mount = mountPoints[0]
      if (!mount) return
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
  }, [mountPoints, parseUrl, restoreFromUrl, activeMount, setActiveMount])

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
                title: 'Give it a name',
                description: <>The name is what shows up in the sidebar.</>,
              },
              {
                number: 2,
                title: 'Pick a host path',
                description: <>Choose an absolute directory inside the container, most often a subfolder of <code>/storage</code>.</>,
              },
              {
                number: 3,
                title: 'Set a default permission mode',
                description: <>It controls who can read, write, and execute files when no explicit ACL is set.</>,
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
              /* Failures (name collision, permission denied, …)
                 bubble up here so the user gets a real modal
                 instead of a silent no-op. */
              onMoveErrors={setMoveErrors}
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
          <S.MainPanel
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
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
              canDownload={canDownload}
              downloadCount={downloadSubjects.length}
              onDownload={triggerDownload}
              canUpload={canUpload && !uploading}
              onUpload={onPickFiles}
              canExtract={canExtract}
              onExtract={triggerExtract}
              /* The pencil on the breadcrumb leaf renames whatever
                 the workspace is currently *parked on*: the open
                 file in editor mode, the active folder in listing
                 mode. The mount-root crumb itself stays pencil-free
                 - renaming a mount is a settings-page concern. */
              onRenameLeaf={renameLeaf}
              showDetails={showDetails}
              onToggleDetails={toggleDetails}
            />
            <S.HiddenFileInput ref={fileInputRef} onChange={onFileInputChange} />
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
                        /* Backspace / Delete keyboard shortcut routes
                           into the same dialog as the toolbar button -
                           openDeleteDialog reads `deleteSubjects`
                           which already prefers the live selection. */
                        onDeleteShortcut={() => openDeleteDialog()}
                        /* Drag-and-drop refusals (name collision,
                           permission denied, …) land here so the
                           shared modal can explain what went wrong
                           instead of leaving the drop silent. */
                        onMoveErrors={setMoveErrors}
                      />
                    )
                  : activeFile && !activeFile.is_dir
                    ? (mediaPreview && activeMount
                        ? <MediaPreview
                            src={fsApi(activeMount.id).rawUrl(activeFile.path)}
                            fileName={activeFile.name}
                            kind={mediaPreview.kind}
                            size={mediaPreview.size}
                          />
                        : binaryBytes
                          ? <HexEditor bytes={binaryBytes} totalSize={binaryMeta?.size} truncated={binaryMeta?.truncated} />
                          : <TextEditor
                              value={content}
                              onChange={setContent}
                              status={statusLabel}
                              fileName={activeFile.path}
                              readOnly={isSymlink}
                              readOnlyReason={isSymlink ? {
                                title: 'Symbolic link - read-only',
                                body: 'This file is a symbolic link. Editing through a symlink would silently overwrite whatever it points at, so MountPad lets you read the target content but not save back. Open the target file directly to make changes.',
                              } : undefined}
                            />)
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
            {isDragging && (
              <S.DropOverlay>
                <S.DropCallout>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M12 17V5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M5 12l7-7 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M5 19h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  Drop files to upload
                  <div className="target">
                    {activeMount?.name}{uploadTargetDir ? `/${uploadTargetDir}` : ''}
                  </div>
                </S.DropCallout>
              </S.DropOverlay>
            )}
          </S.MainPanel>
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
          the selection - flat files don't need it. */}
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
            /* onSubmit lets Enter trigger the delete from anywhere
               inside the modal - the hidden submit button on the
               wrapping <form> catches the keypress even when focus
               sits on the "recursive" checkbox or wandered off. */
            onSubmit={() => { if (n > 0) submitDelete() }}
            footer={<>
              <Button variant="ghost" onClick={closeDeleteDialog}>Cancel</Button>
              {/* autoFocus visibly lands on the action button when
                  the modal opens (so the user sees what Enter is
                  about to do) and gives the common "open → press
                  Enter" gesture an obvious target. */}
              <Button variant="danger" autoFocus onClick={submitDelete} disabled={n === 0}>{confirmLabel}</Button>
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

      {/* Reuses the standard Modal portal so it sits above the file
          explorer and the toolbar overlays correctly. Single-button
          footer because there's no second action that makes sense:
          either the user re-tries, or they cancel - and "cancel" is
          implicit when the dialog is dismissed. */}
      <Modal
        open={!!downloadError}
        title="Download unavailable"
        onClose={() => setDownloadError(null)}
        footer={
          <Button variant="primary" onClick={() => setDownloadError(null)}>OK</Button>
        }
      >
        <S.DownloadError>{downloadError}</S.DownloadError>
      </Modal>

      {/* Upload summary: only shown when something is worth reporting
          (errors, conflicts, multi-file batches). A single successful
          upload refreshes silently because the new entry's arrival in
          the listing is feedback enough. */}
      <Modal
        open={!!uploadSummary}
        title="Upload results"
        onClose={() => setUploadSummary(null)}
        footer={
          <Button variant="primary" onClick={() => setUploadSummary(null)}>Close</Button>
        }
      >
        {uploadSummary && (() => {
          const ok = uploadSummary.results.filter((r) => r.status === 'uploaded').length
          const conflict = uploadSummary.results.filter((r) => r.status === 'conflict').length
          const err = uploadSummary.results.filter((r) => r.status === 'error').length
          return (
            <>
              <S.DeleteMessage>
                Uploaded to <code>/{uploadSummary.targetDir || ''}</code>:
                <br />
                <strong>{ok}</strong> succeeded
                {conflict > 0 && <>, <strong>{conflict}</strong> already existed</>}
                {err > 0 && <>, <strong>{err}</strong> failed</>}.
              </S.DeleteMessage>
              <S.UploadList>
                {uploadSummary.results.map((r, i) => {
                  const cls = r.status === 'uploaded' ? 'ok' : r.status === 'conflict' ? 'warn' : 'err'
                  const icon = r.status === 'uploaded' ? '✓' : r.status === 'conflict' ? '!' : '✕'
                  return (
                    <li key={`${r.name}-${i}`} className={cls} title={r.error || r.name}>
                      <span aria-hidden style={{ minWidth: 14, textAlign: 'center' }}>{icon}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.name}
                        {r.error && <> - <em>{r.error}</em></>}
                      </span>
                    </li>
                  )
                })}
              </S.UploadList>
            </>
          )
        })()}
      </Modal>

      <Modal
        open={!!extractError}
        title="Extract failed"
        onClose={() => setExtractError(null)}
        footer={
          <Button variant="primary" onClick={() => setExtractError(null)}>OK</Button>
        }
      >
        <S.DownloadError>{extractError}</S.DownloadError>
      </Modal>

      <Modal
        open={!!moveErrors && moveErrors.length > 0}
        title={
          moveErrors && moveErrors.length === 1
            ? 'Move not performed'
            : `${moveErrors?.length ?? 0} items could not be moved`
        }
        onClose={() => setMoveErrors(null)}
        footer={<Button variant="primary" onClick={() => setMoveErrors(null)}>OK</Button>}
      >
        {moveErrors && moveErrors.length === 1 ? (
          <S.DownloadError>{moveErrors[0].reason}</S.DownloadError>
        ) : (
          <>
            <S.DownloadError>
              The following items could not be moved into the destination folder:
            </S.DownloadError>
            <S.UploadList>
              {(moveErrors ?? []).map((e) => {
                const name = e.path.includes('/')
                  ? e.path.slice(e.path.lastIndexOf('/') + 1)
                  : e.path
                return (
                  <li key={e.path}>
                    <strong>{name}</strong> - <em>{e.reason}</em>
                  </li>
                )
              })}
            </S.UploadList>
          </>
        )}
      </Modal>

      {extracting && null /* placeholder for future busy spinner; the
        button itself disables via canExtract during the in-flight
        call, so a global modal isn't necessary right now. */}
    </>
  )
}

export default WorkspacePage
