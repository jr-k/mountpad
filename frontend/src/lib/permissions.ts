export const BITS = {
  UR: 1 << 8, UW: 1 << 7, UX: 1 << 6,
  GR: 1 << 5, GW: 1 << 4, GX: 1 << 3,
  OR: 1 << 2, OW: 1 << 1, OX: 1 << 0,
} as const

export function formatMode(mode: number): string {
  const map: [number, string][] = [
    [BITS.UR, 'r'], [BITS.UW, 'w'], [BITS.UX, 'x'],
    [BITS.GR, 'r'], [BITS.GW, 'w'], [BITS.GX, 'x'],
    [BITS.OR, 'r'], [BITS.OW, 'w'], [BITS.OX, 'x'],
  ]
  return map.map(([b, ch]) => (mode & b ? ch : '-')).join('')
}

export function toggleBit(mode: number, bit: number): number {
  return mode ^ bit
}

export function modeToOctal(mode: number): string {
  return (mode & 0o777).toString(8).padStart(3, '0')
}
