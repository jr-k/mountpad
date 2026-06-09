import type { MountPoint } from '@/types/files'
import type { User } from '@/types/users'

export interface AuthState {
  user: (User & { synthetic?: boolean }) | null
  enabled: boolean
  safe_mode: boolean
  user_count: number
}

export interface AppInfo {
  /** Display name shown in the header brand, login, setup, and tab title. */
  name: string
  /**
   * Build-time release tag of the running binary. "dev" for local
   * builds; production releases inject a proper tag via ldflags.
   * Rendered in the status bar at the bottom of the app shell.
   */
  version?: string
  /**
   * Effective MOUNTPAD_FOLLOW_SYMLINK env-var setting. When false,
   * the per-mount `follow_symlinks` column is ignored at runtime
   * (the global flag is restrictive), so the settings UI uses this
   * to grey out the per-mount checkbox with an explanatory note.
   */
  follow_symlinks?: boolean
}

export interface SharedProps {
  app: AppInfo
  auth: AuthState
  mount_points?: MountPoint[]
  flash?: Record<string, string>
}
