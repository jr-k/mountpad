import React from 'react'
import { initialFor, resolveAvatarColor } from './avatarColor'

import * as S from './styled'

interface AvatarProps {
  /**
   * Numeric identifier used as the seed for the deterministic palette when
   * no explicit color is provided. Pass `user.id` or `group.id`.
   */
  id?: number | null
  /**
   * Optional explicit color override (e.g. `user.avatar_color`). Empty
   * string is treated as "no override" and falls back to the palette.
   */
  color?: string | null
  /**
   * Labels considered (in order) when picking the displayed initial. The
   * first non-empty label wins. Typical usage is `[display_name, username]`
   * for users, `[group.name]` for groups.
   */
  labels: Array<string | null | undefined>
  /** Pixel diameter; defaults to 32 (table-row scale). */
  size?: number
  /** Optional class hook for callers that need to position the avatar. */
  className?: string
  title?: string
}

export const Avatar: React.FC<AvatarProps> = ({ id, color, labels, size = 32, className, title }) => {
  const bg = resolveAvatarColor(color, id ?? null)
  const initial = initialFor(...labels)
  return (
    <S.AvatarCircle
      $bg={bg}
      $size={size}
      className={className}
      title={title}
      aria-hidden={title ? undefined : true}
    >
      {initial}
    </S.AvatarCircle>
  )
}

Avatar.displayName = 'Avatar'
