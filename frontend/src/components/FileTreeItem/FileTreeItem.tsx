import React from 'react'
import type { FileEntry } from '@/types/files'
import { formatMode } from '@/lib/permissions'

import * as S from './styled'

interface FileTreeItemProps {
  entry: FileEntry
  depth: number
  open?: boolean
  active?: boolean
  /**
   * Click / Enter handler: OPEN the entry (load the file content or
   * navigate into the folder). The sidebar tree is single-click on
   * purpose — it's a navigation control, not a selection grid; the
   * double-click "select then open" idiom lives in DirectoryView.
   */
  onActivate: (entry: FileEntry) => void
  /** Chevron click handler: toggle collapse/expand for a folder branch. */
  onToggle?: (entry: FileEntry) => void
  /**
   * When true, render the Linux-style metadata trail (owner:group · rwx)
   * to the right of the entry name. Off by default to keep the tree dense
   * and readable; the FileExplorer toolbar exposes a toggle.
   */
  showDetails?: boolean
  /** Map of user ID → display label, used when `showDetails` is on. */
  userById?: Record<number, string>
  /** Map of group ID → display label, used when `showDetails` is on. */
  groupById?: Record<number, string>
}

// iconFor returns an emoji-based glyph that scales nicely (~16-18px) and is
// readable at a glance, replacing the previous unicode triangles.
// Exported so the directory view can reuse the same icon mapping and the
// whole app stays visually consistent.
export function iconFor(entry: FileEntry, open: boolean): string {
  if (entry.is_dir) return open ? '📂' : '📁'

  const lower = entry.name.toLowerCase()
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : ''

  switch (ext) {
    case 'md':
    case 'markdown':
    case 'txt':
    case 'rst':
    case 'log':
      return '📝'
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'svg':
    case 'bmp':
    case 'ico':
      return '🖼️'
    case 'mp3':
    case 'wav':
    case 'ogg':
    case 'flac':
    case 'm4a':
      return '🎵'
    case 'mp4':
    case 'mov':
    case 'mkv':
    case 'webm':
    case 'avi':
      return '🎬'
    case 'zip':
    case 'tar':
    case 'gz':
    case 'tgz':
    case 'bz2':
    case '7z':
    case 'rar':
      return '📦'
    case 'pdf':
      return '📕'
    case 'json':
    case 'yaml':
    case 'yml':
    case 'toml':
    case 'env':
    case 'ini':
    case 'conf':
      return '⚙️'
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
    case 'go':
    case 'py':
    case 'rs':
    case 'rb':
    case 'java':
    case 'kt':
    case 'c':
    case 'cpp':
    case 'h':
    case 'hpp':
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'css':
    case 'scss':
    case 'html':
    case 'sql':
      return '📜'
    default:
      return '📄'
  }
}

// labelFor pulls a friendly label from the id maps, with a Linux-style dash
// when nothing is set (e.g. inherited entries with no explicit owner).
const labelFor = (id: number | null | undefined, map?: Record<number, string>): string => {
  if (id === null || id === undefined) return '-'
  return map?.[id] ?? String(id)
}

// Compact chevron used by the disclosure button. Sized to sit comfortably
// within an 18px hit area; the rotation is driven by the styled wrapper so
// the SVG itself stays orientation-agnostic.
const ChevronIcon: React.FC = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="3.5,2 6.5,5 3.5,8" />
  </svg>
)

export const FileTreeItem: React.FC<FileTreeItemProps> = ({
  entry, depth, open, active, onActivate, onToggle,
  showDetails = false, userById, groupById,
}) => {
  // Two interactions on a row:
  //   - row click / Enter / Space → ACTIVATE (open file / enter folder)
  //   - chevron click             → TOGGLE expand/collapse (folder only)
  // Single-click activation matches how an explorer tree behaves in
  // most IDEs and OS file managers' navigation pane.
  const handleRowClick = () => onActivate(entry)
  const handleRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onActivate(entry)
    }
  }
  const handleToggleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    onToggle?.(entry)
  }

  return (
    <S.FileTreeItemRow
      $depth={depth}
      $active={active}
      role="treeitem"
      aria-expanded={entry.is_dir ? !!open : undefined}
      aria-selected={active}
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={handleRowKeyDown}
      title={entry.path}
    >
      {entry.is_dir ? (
        <S.Disclosure
          type="button"
          $open={!!open}
          aria-label={open ? 'Collapse folder' : 'Expand folder'}
          tabIndex={-1}
          onClick={handleToggleClick}
        >
          <ChevronIcon />
        </S.Disclosure>
      ) : (
        <S.DisclosureSpacer aria-hidden />
      )}
      <S.Icon aria-hidden>{iconFor(entry, !!open)}</S.Icon>
      <S.Name>{entry.name}</S.Name>
      {showDetails && (
        <S.Details>
          <S.Owner>{labelFor(entry.owner_id, userById)}</S.Owner>
          <S.Sep>:</S.Sep>
          <S.Group>{labelFor(entry.group_id, groupById)}</S.Group>
          <S.Mode>{formatMode(entry.mode)}</S.Mode>
        </S.Details>
      )}
    </S.FileTreeItemRow>
  )
}
