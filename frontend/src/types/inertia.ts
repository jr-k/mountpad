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
}

export interface SharedProps {
  app: AppInfo
  auth: AuthState
  mount_points?: MountPoint[]
  flash?: Record<string, string>
}
