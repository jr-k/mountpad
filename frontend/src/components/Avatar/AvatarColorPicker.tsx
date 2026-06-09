import React from 'react'
import { AVATAR_PALETTE } from './avatarColor'

import * as S from './styled'

interface AvatarColorPickerProps {
  /** Currently selected colour. Empty string = "automatic" / palette. */
  value: string
  /** Fired with the new colour, or `''` when the auto swatch is picked. */
  onChange: (value: string) => void
  /** Optional override for the swatch diameter (defaults to 32px). */
  size?: number
  className?: string
}

/**
 * Swatch grid used by every "pick an avatar color" form (profile,
 * mount settings, eventually groups). The leading "auto" swatch
 * clears the user's pick and falls back to the deterministic
 * palette entry derived from the entity id — same behaviour as
 * `resolveAvatarColor` on the rendering side.
 *
 * Kept inside the Avatar package because the swatch list IS the
 * `AVATAR_PALETTE` constant: anywhere we surface "pick a color"
 * should automatically inherit changes to the palette.
 */
export const AvatarColorPicker: React.FC<AvatarColorPickerProps> = ({
  value, onChange, size = 32, className,
}) => {
  const norm = value.trim().toLowerCase()
  return (
    <S.SwatchRow className={className} $size={size}>
      <S.SwatchAuto
        type="button"
        $size={size}
        $active={norm === ''}
        onClick={() => onChange('')}
        title="Use the automatic color"
        aria-label="Automatic color"
      />
      {AVATAR_PALETTE.map((c) => (
        <S.Swatch
          key={c}
          type="button"
          $size={size}
          $color={c}
          $active={norm === c.toLowerCase()}
          onClick={() => onChange(c)}
          title={c}
          aria-label={`Color ${c}`}
        />
      ))}
    </S.SwatchRow>
  )
}

AvatarColorPicker.displayName = 'AvatarColorPicker'
