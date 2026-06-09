import React, { useMemo } from 'react'

import * as S from './styled'

interface HexEditorProps {
  /** Raw bytes to render. */
  bytes: Uint8Array
  /**
   * Total file size on disk. May be larger than `bytes.length` when
   * the server truncated the preview - we surface the difference in
   * the header so the user knows they're seeing a head sample, not
   * the full file.
   */
  totalSize?: number
  /** True when the server capped the preview. */
  truncated?: boolean
}

// 16 bytes per row, split into two groups of 8 separated by an extra
// space - the universal "xxd" / hex-fiend layout. Increasing this
// would let the user see more per row at the cost of horizontal
// scrolling on narrow viewports.
const BYTES_PER_ROW = 16
const GROUP_SIZE = 8

const HEX = '0123456789abcdef'

const toHex2 = (n: number): string => HEX[(n >> 4) & 0xf] + HEX[n & 0xf]

// 32-bit-wide offset is enough for our 256 KiB cap and stays
// readable. We pad with zeros so the column doesn't jitter as the
// scroll reveals larger offsets.
const toOffset = (n: number): string => n.toString(16).padStart(8, '0')

// Printable-ASCII window: 0x20 (space) to 0x7e (~). Anything else
// becomes a centered dot, matching the convention used by xxd,
// hexdump -C and most desktop hex editors.
const toAscii = (b: number): string => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.')

const formatBytes = (n: number): string => {
  if (n < 1024) return `${n} B`
  const units = ['KiB', 'MiB', 'GiB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`
}

/**
 * HexEditor: read-only inspection view for binary files. Three
 * synchronised columns - offset, grouped hex bytes, ASCII - rendered
 * as plain text inside a single scrollable pane so selection /
 * copy-paste behave like any terminal hex dump.
 */
export const HexEditor: React.FC<HexEditorProps> = ({ bytes, totalSize, truncated }) => {
  const rows = useMemo(() => {
    const out: { offset: string; hex: string; ascii: string }[] = []
    for (let i = 0; i < bytes.length; i += BYTES_PER_ROW) {
      const end = Math.min(i + BYTES_PER_ROW, bytes.length)
      const hexParts: string[] = []
      let ascii = ''
      for (let j = i; j < end; j++) {
        hexParts.push(toHex2(bytes[j]))
        ascii += toAscii(bytes[j])
        // Mid-row visual gap after the 8th byte (xxd-style). We add
        // it as an extra space in the joined string rather than a
        // separate span so column alignment stays trivial.
        if (j - i === GROUP_SIZE - 1) hexParts.push('')
      }
      // Pad the final, possibly-short row so the ASCII column lines
      // up with full rows above. Two hex chars + one separator =
      // three characters per missing byte.
      const missing = BYTES_PER_ROW - (end - i)
      const hex = hexParts.join(' ') + (missing > 0 ? ' '.repeat(missing * 3) : '')
      out.push({ offset: toOffset(i), hex, ascii })
    }
    return out
  }, [bytes])

  // Build the column ruler once: same spacing as a row, two hex
  // digits per index, mid-row gap after position 7.
  const ruler = useMemo(() => {
    const parts: string[] = []
    for (let i = 0; i < BYTES_PER_ROW; i++) {
      parts.push(toHex2(i).slice(-2).padStart(2, '0'))
      if (i === GROUP_SIZE - 1) parts.push('')
    }
    return parts.join(' ')
  }, [])

  const shownLabel = formatBytes(bytes.length)
  const totalLabel = typeof totalSize === 'number' ? formatBytes(totalSize) : null

  return (
    <S.HexEditorRoot>
      <S.Header>
        <span>hex view</span>
        <span>·</span>
        <span>
          {truncated && totalLabel
            ? <>showing <b>{shownLabel}</b> of <b>{totalLabel}</b></>
            : <><b>{shownLabel}</b></>}
        </span>
        {truncated && (
          <S.TruncatedNote>preview truncated</S.TruncatedNote>
        )}
      </S.Header>
      <S.ColumnRuler>
        <span>{'         '/* 8-char offset gutter spacer */}</span>
        <span>{ruler}</span>
        <span>{'ascii'}</span>
      </S.ColumnRuler>
      <S.Scroll>
        {rows.map((row, idx) => (
          <S.Row key={idx}>
            <S.Offset>{row.offset}</S.Offset>
            <S.Hex>{row.hex}</S.Hex>
            <S.Ascii>|{row.ascii}|</S.Ascii>
          </S.Row>
        ))}
      </S.Scroll>
    </S.HexEditorRoot>
  )
}

HexEditor.displayName = 'HexEditor'
