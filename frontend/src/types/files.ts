export interface FileEntry {
  name: string
  path: string
  is_dir: boolean
  /**
   * True when the on-disk entry is a symbolic link. Mirrors the
   * field on ReadResponse so callers that have the FileEntry handy
   * (the file explorer, the workspace page) can act on it BEFORE
   * the read response comes back - notably to flip the text editor
   * into read-only mode the moment the user clicks the row.
   */
  is_symlink?: boolean
  size: number
  modified_at: string
  owner_id?: number | null
  group_id?: number | null
  mode: number
  has_manifest?: boolean
}

export interface MountPoint {
  id: number
  slug: string
  name: string
  description: string
  host_path: string
  is_active: boolean
  default_owner_id?: number | null
  default_group_id?: number | null
  default_mode: number
  /**
   * Optional CSS color override for the mount avatar. Empty / missing
   * means "use the deterministic palette entry derived from the id"
   * (handled by `resolveAvatarColor` on the client).
   */
  avatar_color?: string
  /**
   * Per-mount override of MOUNTPAD_FOLLOW_SYMLINK. The runtime ANDs
   * this with the global env-var, so this column can only TIGHTEN
   * the global setting, never loosen it. Defaults to true so a
   * fresh mount inherits whatever the global flag dictates.
   */
  follow_symlinks: boolean
}

export interface ListResponse {
  mount_id: number
  mount_slug: string
  path: string
  entries: FileEntry[]
}

export interface ReadResponse {
  path: string
  content?: string
  checksum?: string
  modified_at: string
  is_binary: boolean
  /**
   * True when the on-disk entry is itself a symbolic link. The editor
   * flips into read-only mode when this is set: the write endpoint
   * refuses to mutate through a symlink (it'd silently rewrite the
   * target's content), so letting the user type would just queue up
   * a guaranteed save failure.
   */
  is_symlink?: boolean
  size?: number
  /**
   * Base64-encoded bytes returned alongside `is_binary: true` so the
   * frontend can render a hex preview. Capped server-side at 256 KiB;
   * `truncated` is set when the file was larger than the cap.
   */
  content_base64?: string
  truncated?: boolean
}

export interface ACLView {
  path: string
  owner_id: number | null
  group_id: number | null
  mode: number
  mode_str: string
  source: 'manifest' | 'inherited' | 'default'
}
