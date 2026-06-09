import React from 'react'
import { Button } from '@/components/Button'
import { Breadcrumb } from '@/components/Breadcrumb'

import * as S from './styled'

interface FileToolbarProps {
  /**
   * Current location relative to the mount root. May point at a file
   * (when `isFile` is true) or at a folder (default). The breadcrumb
   * renders every parent segment as a clickable folder.
   */
  filePath?: string
  /** True when `filePath` points at an editable file (not a folder). */
  isFile?: boolean
  /** Mount name, shown as the root crumb. */
  mountName?: string
  /** Click handler for any clickable breadcrumb segment (folder path). */
  onNavigateFolder?: (folderPath: string) => void
  status: 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
  statusLabel?: string
  canSave: boolean
  onSave: () => void
  onRename: () => void
  onDelete: () => void
  onPermissions: () => void
  /**
   * Whether a contextual target exists for Rename/Delete (i.e. the user
   * selected an entry in DirectoryView, or is editing a file). When
   * false, the two buttons are hidden entirely — renaming the current
   * folder still has a dedicated pencil affordance on the breadcrumb
   * leaf (see `onRenameLeaf`).
   */
  canModify?: boolean
  /**
   * Optional handler for the breadcrumb-leaf pencil: rename the current
   * folder (the leaf path). When omitted (or when the leaf is a file
   * or the mount root) the breadcrumb renders without the pencil.
   */
  onRenameLeaf?: () => void
  /**
   * Details-panel state. Controlled from WorkspacePage so the toggle
   * preference can be persisted across sessions.
   */
  showDetails?: boolean
  onToggleDetails?: () => void
}

const isMac = typeof navigator !== 'undefined'
  && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '')

const saveShortcut = isMac ? '\u2318S' : 'Ctrl+S' // ⌘S on macOS

// PanelIcon draws a generic "right sidebar" glyph. The right column is
// filled when the panel is visible and outlined when it's hidden, which
// gives an at-a-glance read of the current toggle state.
const PanelIcon: React.FC<{ $active?: boolean }> = ({ $active }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    <line x1="10" y1="3" x2="10" y2="13" stroke="currentColor" strokeWidth="1.5" />
    {$active && (
      <rect x="10" y="3" width="4" height="10" fill="currentColor" opacity="0.35" />
    )}
  </svg>
)

export const FileToolbar: React.FC<FileToolbarProps> = ({
  filePath, isFile, mountName, onNavigateFolder,
  status, statusLabel, canSave, onSave, onRename, onDelete, onPermissions,
  canModify = false, onRenameLeaf,
  showDetails, onToggleDetails,
}) => (
  <S.FileToolbarRoot>
    {/* Single source of truth for the current location: the breadcrumb
        sits in the toolbar so it is visible in both the directory view
        and the file editor. Each folder segment is a one-click jump
        back up the tree. The leaf pencil (when shown) is the only way
        to rename the folder you are currently *inside*, separate from
        renaming an entry you've selected inside it. */}
    <S.Title>
      <Breadcrumb
        path={filePath || ''}
        isFile={!!isFile}
        rootLabel={mountName || '/'}
        onNavigate={(p) => onNavigateFolder?.(p)}
        onRenameLeaf={onRenameLeaf}
      />
    </S.Title>
    {statusLabel && <S.Status $tone={status}>{statusLabel}</S.Status>}
    <Button size="sm" variant="ghost" onClick={onPermissions} disabled={!filePath}>Permissions</Button>
    {/* Rename and Delete are contextual: they only render when there is
        a real target (a selected entry in the directory view, or the
        file currently being edited). With nothing selected the user
        renames the current folder via the breadcrumb pencil instead. */}
    {canModify && (
      <>
        <Button size="sm" variant="secondary" onClick={onRename}>Rename</Button>
        <Button size="sm" variant="danger" onClick={onDelete}>Delete</Button>
      </>
    )}
    {/* Save only appears when there is something to save. Showing it
        disabled the rest of the time turns the toolbar's primary action
        into visual noise and steals attention from the other buttons. */}
    {canSave && (
      <Button
        size="sm"
        variant="primary"
        onClick={onSave}
        title={`Save (${saveShortcut})`}
      >
        Save <S.Kbd>{saveShortcut}</S.Kbd>
      </Button>
    )}
    {onToggleDetails && (
      <S.PanelToggle
        type="button"
        $active={showDetails}
        aria-pressed={showDetails}
        onClick={onToggleDetails}
        title={showDetails ? 'Hide details panel' : 'Show details panel'}
        aria-label={showDetails ? 'Hide details panel' : 'Show details panel'}
      >
        <PanelIcon $active={showDetails} />
      </S.PanelToggle>
    )}
  </S.FileToolbarRoot>
)
