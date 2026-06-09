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
   * Rename only makes sense against a single subject, so the parent
   * passes `true` only when there is exactly one entry selected (or a
   * file is open in the editor). With nothing or many selected, the
   * Rename button stays hidden.
   */
  canRename?: boolean
  /**
   * Delete supports both single and bulk subjects. The button label
   * adapts via `deleteCount` below.
   */
  canDelete?: boolean
  /**
   * Download is single OR bulk: a single file streams its bytes
   * directly, anything else (a folder, or multiple selections)
   * comes back as a zip. The button is hidden when there's nothing
   * to download.
   */
  canDownload?: boolean
  /** Number of subjects the next Download press would act on. */
  downloadCount?: number
  onDownload?: () => void
  /**
   * Number of entries the next Delete press would act on. When > 1,
   * the button surfaces the count ("Delete 5 items") so the user knows
   * the action is a bulk operation before they trigger the confirmation
   * dialog. Defaults to 1; ignored when canDelete is false.
   */
  deleteCount?: number
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

// All toolbar action glyphs share a single 14x14 stroked style so the
// visual weight stays consistent across Download / Rename / Delete /
// Permissions. They rely on `currentColor` so the destructive variant
// (Delete) automatically picks up the right tint.
const iconProps = {
  width: 14,
  height: 14,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}
const DownloadIcon = () => (
  <svg {...iconProps}>
    <path d="M8 2v8" />
    <path d="M4.5 7L8 10.5 11.5 7" />
    <path d="M3 13h10" />
  </svg>
)
const RenameIcon = () => (
  <svg {...iconProps}>
    <path d="M11.5 2.5l2 2L6 12l-2.5.5L4 10z" />
    <path d="M10 4l2 2" />
  </svg>
)
const DeleteIcon = () => (
  <svg {...iconProps}>
    <path d="M3 4.5h10" />
    <path d="M6 4.5V3a1 1 0 011-1h2a1 1 0 011 1v1.5" />
    <path d="M4.5 4.5l.7 8a1 1 0 001 .9h3.6a1 1 0 001-.9l.7-8" />
    <path d="M7 7v4M9 7v4" />
  </svg>
)
const PermissionsIcon = () => (
  <svg {...iconProps}>
    <path d="M8 1.75L13.25 4v4c0 3-2.25 5.25-5.25 6.25C5 13.25 2.75 11 2.75 8V4z" />
    <circle cx="8" cy="7.5" r="1.4" />
    <path d="M8 8.9V11" />
  </svg>
)

export const FileToolbar: React.FC<FileToolbarProps> = ({
  filePath, isFile, mountName, onNavigateFolder,
  status, statusLabel, canSave, onSave, onRename, onDelete, onPermissions,
  canRename = false, canDelete = false, deleteCount = 1, onRenameLeaf,
  canDownload = false, downloadCount = 1, onDownload,
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
    {/* Action cluster order, left to right: Delete first so the
        single red (danger) button never sits sandwiched between gray
        buttons (which produced a jarring grey-red-grey rhythm as
        the cluster lit up). All secondary actions then run in one
        uninterrupted gray block: Download, Rename, Permissions.
        Permissions always renders (just disabled when nothing's
        applicable) so its slot doesn't shift around. */}
    {canDelete && (
      <Button size="sm" variant="danger" onClick={onDelete}>
        <DeleteIcon />
        {deleteCount > 1 ? `Delete ${deleteCount} items` : 'Delete'}
      </Button>
    )}
    {canDownload && (
      <Button size="sm" variant="secondary" onClick={onDownload}>
        <DownloadIcon />
        {downloadCount > 1 ? `Download ${downloadCount} items` : 'Download'}
      </Button>
    )}
    {canRename && (
      <Button size="sm" variant="secondary" onClick={onRename}>
        <RenameIcon />
        Rename
      </Button>
    )}
    <Button size="sm" variant="secondary" onClick={onPermissions} disabled={!filePath}>
      <PermissionsIcon />
      Permissions
    </Button>
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
