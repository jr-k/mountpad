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

import { fsApi } from './api'

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
 * Execute the move for the active drag onto `targetFolder`. Renames
 * each entry in parallel via the rename endpoint (the backend treats
 * cross-folder renames as moves). Entries that would land on top of
 * themselves are filtered out beforehand so the caller doesn't have
 * to. Resolves with the count of attempted vs successful renames.
 */
export async function performDropMove(
  targetMountId: number,
  targetFolder: string,
): Promise<{ attempted: number; failed: number }> {
  const a = active
  clearActiveDrag()
  if (!a) return { attempted: 0, failed: 0 }
  if (a.mountId !== targetMountId) return { attempted: 0, failed: 0 }
  const moves = a.paths.filter((p) => {
    if (targetFolder === p) return false
    if (p !== '' && targetFolder.startsWith(p + '/')) return false
    if (parentOf(p) === targetFolder) return false
    return true
  })
  if (moves.length === 0) return { attempted: 0, failed: 0 }
  const api = fsApi(a.mountId)
  const results = await Promise.allSettled(moves.map((from) => {
    const name = from.includes('/') ? from.slice(from.lastIndexOf('/') + 1) : from
    const to = targetFolder ? `${targetFolder}/${name}` : name
    return api.rename(from, to)
  }))
  const failed = results.reduce((n, r) => n + (r.status === 'rejected' ? 1 : 0), 0)
  return { attempted: moves.length, failed }
}
