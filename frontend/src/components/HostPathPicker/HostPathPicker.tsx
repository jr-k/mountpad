import React, { useEffect, useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { api, HttpError } from '@/lib/api'
import * as S from './styled'

interface HostEntry {
  name: string
  path: string
  is_dir: boolean
}

interface BrowseResponse {
  path: string
  parent: string
  entries: HostEntry[]
}

interface HostPathPickerProps {
  open: boolean
  /** Initial absolute path to seed the browser with. Defaults to "/". */
  initialPath?: string
  /** Called with the absolute path of the chosen directory. */
  onPick: (path: string) => void
  onClose: () => void
}

// Inline icons - kept tiny and dependency-free, same convention as the
// rest of the settings pages.
const UpIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const RefreshIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M4 4v6h6M20 20v-6h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20 9a8 8 0 0 0-14.93-2M4 15a8 8 0 0 0 14.93 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const FolderIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
)
const FileIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M14 3v4h4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
)

/**
 * HostPathPicker - admin-only modal that lets the operator click their
 * way through the host filesystem (as visible to the running
 * container) and confirm an absolute path. Backed by GET
 * /api/host/browse.
 *
 * The path is also typeable directly in the bar at the top so power
 * users can paste an absolute path and validate it with Enter or the
 * refresh button - useful for paths that have restrictive read
 * permissions further up the chain (you can land on them straight
 * away without browsing through them).
 */
export const HostPathPicker: React.FC<HostPathPickerProps> = ({
  open,
  initialPath,
  onPick,
  onClose,
}) => {
  // currentPath is the path the listing reflects. typedPath is the
  // value of the address bar (free-typing). They diverge only while
  // the user is typing a new path; pressing Enter or Refresh syncs
  // them by re-running load(typedPath).
  const [currentPath, setCurrentPath] = useState<string>(initialPath || '/')
  const [typedPath, setTypedPath] = useState<string>(initialPath || '/')
  const [entries, setEntries] = useState<HostEntry[]>([])
  const [parent, setParent] = useState<string>('')
  const [showHidden, setShowHidden] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = async (path: string, hidden: boolean) => {
    setLoading(true)
    setErr(null)
    try {
      const qs = new URLSearchParams({ path, show_hidden: hidden ? '1' : '0' })
      const res = await api.get<BrowseResponse>(`/api/host/browse?${qs.toString()}`)
      setCurrentPath(res.path)
      setTypedPath(res.path)
      setParent(res.parent)
      setEntries(res.entries ?? [])
    } catch (e: unknown) {
      // Preserve the typed path on error so the user can see what
      // they aimed at and correct it; leave the listing intact so
      // they can keep navigating from where they were.
      setErr(e instanceof HttpError && e.body ? e.body : 'Could not read this directory.')
    } finally {
      setLoading(false)
    }
  }

  // Reset to initialPath every time the picker is reopened. Without
  // this the dialog would resume wherever the user last left it,
  // which is confusing when editing two different mounts in a row.
  useEffect(() => {
    if (!open) return
    void load(initialPath || '/', showHidden)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Reload when the dotfile toggle flips, but only while the picker
  // is open so we don't keep firing requests in the background.
  useEffect(() => {
    if (!open) return
    void load(currentPath, showHidden)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHidden])

  const enter = (p: string) => { void load(p, showHidden) }
  const goUp = () => { if (parent) void load(parent, showHidden) }
  const onSubmitPath = (e: React.FormEvent) => {
    e.preventDefault()
    void load(typedPath.trim() || '/', showHidden)
  }

  return (
    <Modal
      open={open}
      title="Pick a folder"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => onPick(currentPath)}
            disabled={loading || !!err}
            title={err ? 'Cannot select a folder that failed to load' : `Use ${currentPath}`}
          >
            Use this folder
          </Button>
        </>
      }
    >
      <S.PickerSurface>
        <form onSubmit={onSubmitPath} style={{ display: 'contents' }}>
          <S.PathBar>
            <S.IconButton
              type="button"
              onClick={goUp}
              disabled={!parent}
              title="Up one level"
              aria-label="Up one level"
            >
              <UpIcon />
            </S.IconButton>
            <S.PathInput
              value={typedPath}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(e) => setTypedPath(e.target.value)}
              placeholder="/absolute/path"
              aria-label="Absolute path"
            />
            <S.IconButton
              type="submit"
              disabled={loading}
              title="Go"
              aria-label="Go to typed path"
            >
              <RefreshIcon />
            </S.IconButton>
          </S.PathBar>
        </form>

        {err && <S.ErrorBanner>{err}</S.ErrorBanner>}

        <S.Listing>
          {loading && entries.length === 0 ? (
            <S.Empty>Loading…</S.Empty>
          ) : entries.length === 0 ? (
            <S.Empty>{err ? 'No entries to display.' : 'This folder is empty.'}</S.Empty>
          ) : (
            entries.map((entry) => (
              <S.Row
                key={entry.path}
                $isDir={entry.is_dir}
                onClick={() => entry.is_dir && enter(entry.path)}
                disabled={!entry.is_dir}
                title={entry.is_dir ? `Enter ${entry.name}` : `${entry.name} (file)`}
              >
                <S.RowIcon>{entry.is_dir ? <FolderIcon /> : <FileIcon />}</S.RowIcon>
                <S.RowName>{entry.name}</S.RowName>
              </S.Row>
            ))
          )}
        </S.Listing>

        <S.Toolbar>
          <S.HiddenToggle>
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(e) => setShowHidden(e.target.checked)}
            />
            Show hidden
          </S.HiddenToggle>
          <span>{entries.filter((e) => e.is_dir).length} folders · {entries.filter((e) => !e.is_dir).length} files</span>
        </S.Toolbar>
      </S.PickerSurface>
    </Modal>
  )
}
