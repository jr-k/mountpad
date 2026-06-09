export interface FileEntry {
  name: string
  path: string
  is_dir: boolean
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
  size?: number
}

export interface ACLView {
  path: string
  owner_id: number | null
  group_id: number | null
  mode: number
  mode_str: string
  source: 'manifest' | 'inherited' | 'default'
}
