import React from 'react'
import type { FileEntry, ACLView } from '@/types/files'
import { formatMode, modeToOctal } from '@/lib/permissions'
import { useHorizontalResize } from '@/hooks/useHorizontalResize'

import * as S from './styled'

interface FileDetailsPanelProps {
  entry?: FileEntry
  acl?: ACLView
  mountName?: string
}

// Min/max/default for the details pane width. Mirrors the FileExplorer
// envelope: narrow enough to fit a label + value side by side, wide
// enough to read long paths without truncation, and never so wide that
// the editor turns into a sliver.
const DETAILS_MIN = 220
const DETAILS_MAX = 600
const DETAILS_DEFAULT = 300
const DETAILS_STORAGE_KEY = 'mountpad:details:width'

export const FileDetailsPanel: React.FC<FileDetailsPanelProps> = ({ entry, acl, mountName }) => {
  // The resize handle sits on the pane's LEFT edge (the editor is on
  // the left in the flex flow), so dragging right shrinks the pane.
  // Persisted across reloads independently of the explorer width so
  // the two panes don't get yanked in sync.
  const resize = useHorizontalResize({
    initial: DETAILS_DEFAULT,
    min: DETAILS_MIN,
    max: DETAILS_MAX,
    side: 'left',
    storageKey: DETAILS_STORAGE_KEY,
  })

  const widthStyle = { ['--details-width' as string]: `${resize.width}px` }
  const resizer = (
    <S.DetailsResizer
      $resizing={resize.resizing}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize details panel"
      title="Drag to resize · double-click to reset"
      {...resize.handleProps}
    />
  )

  if (!entry) {
    return (
      <S.FileDetailsPanelRoot style={widthStyle}>
        {resizer}
        <S.Title>Details</S.Title>
        <S.Row><span>No file selected.</span></S.Row>
      </S.FileDetailsPanelRoot>
    )
  }
  return (
    <S.FileDetailsPanelRoot style={widthStyle}>
      {resizer}
      <S.Group>
        <S.Title>File</S.Title>
        <S.Row><span>Name</span><S.Value>{entry.name}</S.Value></S.Row>
        <S.Row><span>Type</span><S.Value>{entry.is_dir ? 'directory' : 'file'}</S.Value></S.Row>
        <S.Row><span>Path</span><S.Value>/{entry.path}</S.Value></S.Row>
        <S.Row><span>Mount</span><S.Value>{mountName || '-'}</S.Value></S.Row>
        <S.Row><span>Size</span><S.Value>{entry.size} B</S.Value></S.Row>
        <S.Row><span>Modified</span><S.Value>{new Date(entry.modified_at).toLocaleString()}</S.Value></S.Row>
      </S.Group>
      <S.Group>
        <S.Title>Permissions</S.Title>
        <S.Row><span>Mode</span><S.Value>{formatMode(entry.mode)} ({modeToOctal(entry.mode)})</S.Value></S.Row>
        <S.Row><span>Owner</span><S.Value>{entry.owner_id ?? '-'}</S.Value></S.Row>
        <S.Row><span>Group</span><S.Value>{entry.group_id ?? '-'}</S.Value></S.Row>
        {acl && <S.Row><span>Source</span><S.Value>{acl.source}</S.Value></S.Row>}
      </S.Group>
    </S.FileDetailsPanelRoot>
  )
}
