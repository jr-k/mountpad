export interface User {
  id: number
  username: string
  display_name: string
  first_name?: string
  last_name?: string
  email?: string
  /** CSS color string; empty means "fall back to deterministic palette". */
  avatar_color?: string
  is_admin: boolean
  is_active: boolean
  group_ids?: number[]
}

export interface Group {
  id: number
  name: string
  description: string
  avatar_color?: string
}
