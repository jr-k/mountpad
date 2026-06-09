import React from 'react'

import * as S from './styled'

interface BreadcrumbProps {
  /**
   * Path relative to the mount root, e.g. `foo/bar/file.txt`. Leading
   * and trailing slashes are tolerated and stripped. Pass an empty
   * string to render just the root crumb.
   */
  path: string
  /**
   * When true, the last segment is treated as a file and rendered as
   * static text instead of a clickable folder crumb. The penultimate
   * segments stay clickable so the user can jump up to a parent.
   */
  isFile?: boolean
  /**
   * Label for the root crumb. Defaults to "/" but a mount name reads
   * better — clicking it always navigates to the mount root.
   */
  rootLabel?: React.ReactNode
  /**
   * Called with the cumulative folder path when a crumb is clicked. The
   * root crumb passes an empty string (= mount root). The leaf is *not*
   * passed when `isFile` is true.
   */
  onNavigate: (folderPath: string) => void
  /**
   * Optional: when provided AND the leaf is a folder (i.e. `isFile` is
   * false and `path` is non-empty), renders a small pencil button
   * after the leaf segment. Clicking it triggers a rename of the
   * current folder. The mount-root crumb never gets the pencil —
   * renaming a mount is a settings-level concern, not a workspace one.
   */
  onRenameLeaf?: () => void
}

// Pencil glyph used by the leaf-rename affordance. Inline so the
// breadcrumb stays self-contained; 12×12 keeps it visually subordinate
// to the path segments instead of competing for attention.
const PencilIcon: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" />
    <path d="M10 4l2 2" />
  </svg>
)

/**
 * Breadcrumb: a clickable file path used in the workspace toolbar and
 * the directory-view header. Each segment is an independent navigation
 * target so the user can jump back to a parent folder with one click
 * (instead of using browser-back or the file tree).
 *
 *     <Breadcrumb path="foo/bar/baz.txt" isFile rootLabel="storage" onNavigate={…} />
 *
 *   storage / foo / bar / baz.txt
 *      ↑       ↑     ↑      ↑
 *      ""    "foo"  "foo/bar"  static (file)
 */
export const Breadcrumb: React.FC<BreadcrumbProps> = ({
  path,
  isFile = false,
  rootLabel = '/',
  onNavigate,
  onRenameLeaf,
}) => {
  // Normalise: strip any leading/trailing slashes so the segments split
  // cleanly without a phantom empty string at either end.
  const cleaned = path.replace(/^\/+/, '').replace(/\/+$/, '')
  const segments = cleaned ? cleaned.split('/') : []
  // The leaf pencil only makes sense when there's a folder leaf to
  // rename: at the mount root the leaf is implicit and renaming the
  // mount itself isn't a workspace-level action, and in editor mode
  // the file is already covered by the toolbar's Rename button.
  const showRenameLeaf = !!onRenameLeaf && segments.length > 0 && !isFile

  return (
    <S.BreadcrumbRoot aria-label="Breadcrumb">
      {/* Root crumb is always rendered so the user can pop straight back
          to the mount root from any depth — and so an empty `path`
          (sitting at the mount root) still shows the mount name as
          context, not an awkward empty bar. */}
      <S.Crumb
        type="button"
        title="Go to mount root"
        onClick={() => onNavigate('')}
      >
        {rootLabel}
      </S.Crumb>
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1
        const cumulative = segments.slice(0, i + 1).join('/')

        // The leaf of a file path is the file itself — clicking it as a
        // folder would 404 the filesystem call. Keep it as a static
        // label, the folder crumb for its parent is still clickable.
        if (isLast && isFile) {
          return (
            <React.Fragment key={i}>
              <S.Separator>/</S.Separator>
              <S.Current>{seg}</S.Current>
            </React.Fragment>
          )
        }

        return (
          <React.Fragment key={i}>
            <S.Separator>/</S.Separator>
            <S.Crumb
              type="button"
              title={isLast ? `Go to /${cumulative}` : `Go to /${cumulative}/`}
              onClick={() => onNavigate(cumulative)}
            >
              {seg}
            </S.Crumb>
          </React.Fragment>
        )
      })}
      {showRenameLeaf && (
        <S.RenameLeaf
          type="button"
          onClick={onRenameLeaf}
          title="Rename current folder"
          aria-label="Rename current folder"
        >
          <PencilIcon />
        </S.RenameLeaf>
      )}
    </S.BreadcrumbRoot>
  )
}

Breadcrumb.displayName = 'Breadcrumb'
