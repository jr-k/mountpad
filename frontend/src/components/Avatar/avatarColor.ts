// A curated palette of 12 perceptually balanced hues. The "no-pick" default
// in the UI picks an entry from here deterministically based on the entity's
// numeric ID, so the same user/group always gets the same color across
// refreshes and sessions without us storing anything.
//
// Hues are spaced ~30deg apart and tuned for legibility against both light
// and dark surfaces (S~55–65%, L~50–55%).
export const AVATAR_PALETTE = [
  '#e0567c', // raspberry
  '#e07b3e', // pumpkin
  '#d4a32c', // goldenrod
  '#85b53a', // grass
  '#3fb65a', // emerald
  '#37b58f', // teal
  '#3aa3d4', // sky
  '#5a7fe0', // cobalt
  '#7d62e0', // violet
  '#b455d4', // orchid
  '#d0498f', // fuchsia
  '#8a8a8a', // graphite (neutral fallback)
] as const

// pickAvatarColor returns the deterministic palette color for an id. Negative
// or absent ids fall back to the last (neutral) slot.
export function pickAvatarColor(id: number | null | undefined): string {
  if (id == null || id < 0) return AVATAR_PALETTE[AVATAR_PALETTE.length - 1]
  return AVATAR_PALETTE[id % AVATAR_PALETTE.length]
}

// resolveAvatarColor honours an explicit override when the user has picked
// a custom color, otherwise it falls back to the deterministic palette.
export function resolveAvatarColor(custom: string | null | undefined, id: number | null | undefined): string {
  const trimmed = (custom ?? '').trim()
  if (trimmed) return trimmed
  return pickAvatarColor(id)
}

// initialFor extracts the first visible character of the most descriptive
// label available, uppercased. We strip accents first so "Élise" → "E".
export function initialFor(...candidates: Array<string | null | undefined>): string {
  for (const raw of candidates) {
    if (!raw) continue
    const trimmed = raw.trim()
    if (!trimmed) continue
    const ascii = trimmed.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    return ascii.charAt(0).toUpperCase()
  }
  return '?'
}
