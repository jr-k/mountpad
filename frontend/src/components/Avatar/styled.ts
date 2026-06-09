import styled, { css } from 'styled-components'

// readableTextOn computes a near-black or near-white token based on the
// luminance of `bg`. We pick the threshold at 0.55 instead of the textbook
// 0.5 so saturated mid-tones (e.g. teal/yellow) tilt towards the dark text
// option, which reads better than pure white over those backgrounds.
const luminance = (hex: string): number => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return 0.5
  const r = parseInt(m[1].slice(0, 2), 16) / 255
  const g = parseInt(m[1].slice(2, 4), 16) / 255
  const b = parseInt(m[1].slice(4, 6), 16) / 255
  // Rec. 709 luma; close enough to perceived brightness for our needs.
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export const AvatarCircle = styled.span<{ $bg: string; $size: number }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width:  ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  border-radius: 50%;
  font-family: ${({ theme }) => theme.font.mono};
  font-weight: 600;
  /* Initial sizing scales with the circle: ~46% of the diameter looks right
     across the 24..96px range we use (chip, table row, hero). */
  font-size: ${({ $size }) => Math.round($size * 0.46)}px;
  text-transform: uppercase;
  user-select: none;
  ${({ $bg }) => css`
    background: ${$bg};
    color: ${luminance($bg) > 0.55 ? '#1f2328' : '#ffffff'};
  `}
  /* Subtle ring so the avatar still has an edge against same-coloured
     surfaces (e.g. white avatar on white modal). */
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.06);
`

AvatarCircle.displayName = 'Avatar.Circle'

// ── AvatarColorPicker styled parts ─────────────────────────────────────
// The swatch grid sits inside any "edit avatar color" form. Kept here
// so swatch + circle share spacing and accent treatment (both keyed
// to AVATAR_PALETTE) and so a future palette tweak only needs to
// touch this package.
export const SwatchRow = styled.div<{ $size: number }>`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => `${theme.space[2]} 0`};
`
SwatchRow.displayName = 'AvatarColorPicker.Row'

export const Swatch = styled.button<{ $color: string; $size: number; $active?: boolean }>`
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  border-radius: 50%;
  border: 0;
  padding: 0;
  cursor: pointer;
  background: ${({ $color }) => $color};
  outline: 2px solid ${({ $active, theme }) => ($active ? theme.color.accent : 'transparent')};
  outline-offset: 2px;
  transition: transform 120ms ease;
  &:hover { transform: scale(1.08); }
`
Swatch.displayName = 'AvatarColorPicker.Swatch'

// The "auto" swatch represents the deterministic palette fallback. We
// draw a diagonal stripe so it's visually distinct from the explicit
// colour chips next to it (and reads as "no override").
export const SwatchAuto = styled(Swatch)`
  background:
    repeating-linear-gradient(
      135deg,
      ${({ theme }) => theme.color.bgElev} 0,
      ${({ theme }) => theme.color.bgElev} 6px,
      ${({ theme }) => theme.color.border} 6px,
      ${({ theme }) => theme.color.border} 12px
    );
`
SwatchAuto.displayName = 'AvatarColorPicker.SwatchAuto'
