import React from 'react'
import type { FileEntry, ACLView } from '@/types/files'
import { formatMode, modeToOctal } from '@/lib/permissions'

import * as S from './styled'

interface FileDetailsPanelProps {
  entry?: FileEntry
  acl?: ACLView
  mountName?: string
}

export const FileDetailsPanel: React.FC<FileDetailsPanelProps> = ({ entry, acl, mountName }) => {
  if (!entry) {
    return (
      <S.FileDetailsPanelRoot>
        <S.Title>Details</S.Title>
        <S.Row><span>No file selected.</span></S.Row>
      </S.FileDetailsPanelRoot>
    )
  }
  return (
    <S.FileDetailsPanelRoot>
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
