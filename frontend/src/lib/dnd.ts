// In-tab drag-and-drop coordination for moving file entries.
//
// HTML5 DnD only exposes `dataTransfer.getData(...)` to the `drop`
// handler - `dragover` / `dragenter` can read the *type list* but not
// the payload, which makes it impossible to compute "would this be a
// valid drop?" highlights without an out-of-band channel.
//
// We pay the small cost of a module-level singleton to mirror the
// payload here at `dragstart`, so any component (DirectoryView,
// FileTreeItem, …) can consult it during the move-phase events.
//
// The singleton is intentionally not exported as state: drag sessions
// are short-lived and never crossed; React re-renders triggered by the
// payload would just be noise.

import { fsApi, HttpError } from './api'

/** MIME type stored on the native dataTransfer to identify our payload. */
export const MOVE_MIME = 'application/x-mountpad-move'

export interface DragPayload {
  /** Mount the dragged entries belong to. Cross-mount drops aren't valid. */
  mountId: number
  /** Folder the entries currently sit in (their common parent). Drops back
   *  onto the same folder are no-ops and silently ignored. */
  sourceFolder: string
  /** Full paths (relative to the mount root) of every dragged entry. */
  paths: string[]
}

let active: DragPayload | null = null

export const setActiveDrag = (payload: DragPayload): void => { active = payload }
export const getActiveDrag = (): DragPayload | null => active
export const clearActiveDrag = (): void => { active = null }

/**
 * Returns true iff the active drag could legally land on `targetFolder`
 * within `targetMountId`. Used by every drop target to drive its
 * highlight state in `dragover` (where `dataTransfer.getData` is
 * unavailable). Reasons we reject:
 *   - no active drag,
 *   - different mount,
 *   - the target IS one of the dragged folders, or sits inside one,
 *   - every dragged entry already sits directly under `targetFolder`
 *     (a no-op move).
 */
export const isValidDropTarget = (
  targetMountId: number,
  targetFolder: string,
): boolean => {
  const a = active
  if (!a) return false
  if (a.mountId !== targetMountId) return false
  // Can't drop a folder into itself or any of its descendants.
  for (const p of a.paths) {
    if (targetFolder === p) return false
    if (p !== '' && targetFolder.startsWith(p + '/')) return false
  }
  // If every dragged entry's parent already equals the target folder,
  // there is nothing to move.
  let anyDifferent = false
  for (const p of a.paths) {
    const parent = parentOf(p)
    if (parent !== targetFolder) { anyDifferent = true; break }
  }
  return anyDifferent
}

const parentOf = (p: string): string => {
  const i = p.lastIndexOf('/')
  return i < 0 ? '' : p.slice(0, i)
}

/**
 * Per-entry error returned by performDropMove. `path` is the source
 * path (so the UI can render the entry name); `reason` is a human-
 * readable phrase, NOT a raw backend message - we translate the
 * common HTTP codes here so every drop site surfaces the same
 * wording without each one having to re-implement the mapping.
 */
export interface MoveError {
  path: string
  reason: string
}

const reasonForRenameError = (err: unknown, destName: string): string => {
  if (err instanceof HttpError) {
    switch (err.status) {
      case 409:
        // Backend returns ErrAlreadyExists → 409 when the destination
        // path already exists. Most common cause for a "nothing
        // happens" silent failure - we now spell it out.
        return `An item named "${destName}" already exists in the destination folder.`
      case 403:
        return 'Permission denied: you cannot write into the destination folder.'
      case 404:
        return 'The source no longer exists - it may have been moved or deleted.'
      case 400:
        return 'The destination path is invalid (rejected by the server).'
      case 415:
        return 'The source is a symbolic link, which the server is configured to refuse.'
    }
  }
  return err instanceof Error ? err.message : String(err)
}

/**
 * Execute the move for the active drag onto `targetFolder`. Renames
 * each entry in parallel via the rename endpoint (the backend treats
 * cross-folder renames as moves). Entries that would land on top of
 * themselves are filtered out beforehand so the caller doesn't have
 * to.
 *
 * Returns the attempted count alongside a per-entry `errors` array
 * with translated, user-facing reasons. `failed === errors.length`
 * by construction; callers can pick whichever shape is more
 * convenient (`failed` for the booleans, `errors` for the modal
 * body).
 */
export async function performDropMove(
  targetMountId: number,
  targetFolder: string,
): Promise<{ attempted: number; failed: number; errors: MoveError[] }> {
  const a = active
  clearActiveDrag()
  if (!a) return { attempted: 0, failed: 0, errors: [] }
  if (a.mountId !== targetMountId) return { attempted: 0, failed: 0, errors: [] }
  const moves = a.paths.filter((p) => {
    if (targetFolder === p) return false
    if (p !== '' && targetFolder.startsWith(p + '/')) return false
    if (parentOf(p) === targetFolder) return false
    return true
  })
  if (moves.length === 0) return { attempted: 0, failed: 0, errors: [] }
  const api = fsApi(a.mountId)
  const results = await Promise.allSettled(moves.map((from) => {
    const name = from.includes('/') ? from.slice(from.lastIndexOf('/') + 1) : from
    const to = targetFolder ? `${targetFolder}/${name}` : name
    return api.rename(from, to)
  }))
  const errors: MoveError[] = []
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const from = moves[i]
      const name = from.includes('/') ? from.slice(from.lastIndexOf('/') + 1) : from
      errors.push({ path: from, reason: reasonForRenameError(r.reason, name) })
    }
  })
  return { attempted: moves.length, failed: errors.length, errors }
}
